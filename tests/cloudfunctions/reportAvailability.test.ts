// reportAvailability 云函数（CommonJS .js）的离线测试。
//
// 复用 adminGetLot 的 stub 手法，加 doc().get()/doc().update()（取 totalSpots 与写余位）。
// 测试重点是权限（非管理员/越权）、边界（freeSpots 越界/负/totalSpots 缺失）、
// 写 availability + availability_samples。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null

jest.mock(
  'wx-server-sdk',
  () => {
    const mkDocApi = (collName: string, id: string) => ({
      get: async () => {
        const doc = mockStore[collName].get(id)
        if (!doc) throw new Error('document.get:fail document not exists')
        return { data: { ...doc } }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const doc = mockStore[collName].get(id)
        if (!doc) return { stats: { updated: 0 } }
        Object.assign(doc, data)
        return { stats: { updated: 1 } }
      },
    })

    const mkCollection = (collName: string) => ({
      doc: (id: string) => mkDocApi(collName, id),
      add: async ({ data }: { data: Record<string, unknown> }) => {
        const id = 'auto_' + (mockStore[collName].size + 1)
        mockStore[collName].set(id, { ...data, _id: id })
        return { _id: id }
      },
      where: (query: Record<string, unknown>) => ({
        limit: () => ({
          get: async () => ({
            data: [...mockStore[collName].values()]
              .filter(d => Object.entries(query).every(([k, v]) => d[k] === v))
              .map(d => ({ ...d })),
          }),
        }),
      }),
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      getWXContext: () => ({ OPENID: mockOpenid }),
      database: () => ({
        collection: (name: string) => mkCollection(name),
      }),
    }
  },
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const reportAvailability = require('../../cloudfunctions/reportAvailability/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = reportAvailability.main

function seedUser(overrides: Record<string, unknown> = {}): void {
  mockStore.users.set('openid-test-1', {
    _id: 'openid-test-1',
    _openid: 'openid-test-1',
    role: 'lot_admin',
    ...overrides,
  })
}

function seedLot(overrides: Record<string, unknown> = {}): void {
  mockStore.lots.set('lot1', {
    _id: 'lot1',
    name: '合肥大学(南艳湖校区)停车场',
    adminUserId: 'openid-test-1',
    availability: { totalSpots: 200, source: 'placeholder' },
    ...overrides,
  })
}

describe('reportAvailability', () => {
  beforeEach(() => {
    mockStore = { users: new Map(), lots: new Map(), availability_samples: new Map() }
    mockOpenid = 'openid-test-1'
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    expect((await main({})).code).toBe('NO_AUTH')
  })

  it('缺 lotId / freeSpots 非数字 → BAD_REQUEST', async () => {
    expect((await main({})).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1' })).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1', freeSpots: 'x' })).code).toBe('BAD_REQUEST')
  })

  it('非车场管理员 → NO_AUTH', async () => {
    seedUser({ role: 'driver' })
    seedLot()
    expect((await main({ lotId: 'lot1', freeSpots: 100 })).code).toBe('NO_AUTH')
  })

  it('车场不存在 → NOT_FOUND', async () => {
    seedUser()
    expect((await main({ lotId: 'lot1', freeSpots: 100 })).code).toBe('NOT_FOUND')
  })

  it('不是自己管理的车场 → FORBIDDEN', async () => {
    seedUser()
    seedLot({ adminUserId: 'openid-other' })
    expect((await main({ lotId: 'lot1', freeSpots: 100 })).code).toBe('FORBIDDEN')
  })

  it('totalSpots 缺失 → CONFLICT', async () => {
    seedUser()
    seedLot({ availability: null })
    expect((await main({ lotId: 'lot1', freeSpots: 100 })).code).toBe('CONFLICT')
  })

  it('freeSpots 越界（负/超 totalSpots）→ BAD_REQUEST', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', freeSpots: -1 })).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1', freeSpots: 201 })).code).toBe('BAD_REQUEST')
  })

  it('正常上报：写 availability + availability_samples', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', freeSpots: 150 })
    expect(r.code).toBe(0)
    expect(r.data.freeSpots).toBe(150)
    expect(r.data.totalSpots).toBe(200)

    const lot = mockStore.lots.get('lot1')!
    const avail = lot.availability as { freeSpots: number; totalSpots: number; reportedAt: number; source: string }
    expect(avail).toMatchObject({
      freeSpots: 150,
      totalSpots: 200,
      source: 'reported',
    })
    expect(typeof avail.reportedAt).toBe('number')

    const sample = [...mockStore.availability_samples.values()][0]
    expect(sample.lotId).toBe('lot1')
    expect(sample.freeSpots).toBe(150)
    expect(sample.occupancyRate).toBe(75) // 150/200
    expect(sample.source).toBe('reported')
  })

  it('freeSpots == totalSpots（全满）不越界', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', freeSpots: 200 })
    expect(r.code).toBe(0)
  })
})
