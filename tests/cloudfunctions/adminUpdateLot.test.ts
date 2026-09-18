// adminUpdateLot 云函数（CommonJS .js）的离线测试。
//
// 复用 reportAvailability 的 stub 手法（doc().get()/update + add + where）。测试重点是：
// 白名单（非白名单字段被拒、类型不合法被拒）、权限（非管理员/越权）、
// 改价留痕 lot_price_changes（只记变更字段、保留 source）、额度改动不留价格痕。

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
        // 点路径在此函数里用不到，直接覆盖（pricing 是整体替换）
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
const adminUpdateLot = require('../../cloudfunctions/adminUpdateLot/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = adminUpdateLot.main

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
    address: '安徽省合肥市蜀山区锦绣大道99号',
    adminUserId: 'openid-test-1',
    pricing: { firstHour: 3, perHourAfter: 2, stepMinutes: 60, capPerDay: 15, nightRate: null, source: 'placeholder' },
    reservableQuota: 10,
    reservedCount: 3,
    facilities: [],
    ...overrides,
  })
}

describe('adminUpdateLot', () => {
  beforeEach(() => {
    mockStore = { users: new Map(), lots: new Map(), lot_price_changes: new Map() }
    mockOpenid = 'openid-test-1'
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    expect((await main({})).code).toBe('NO_AUTH')
  })

  it('缺 lotId → BAD_REQUEST', async () => {
    expect((await main({ patch: { name: 'x' } })).code).toBe('BAD_REQUEST')
  })

  it('非管理员（driver）→ NO_AUTH', async () => {
    seedUser({ role: 'driver' })
    seedLot()
    expect((await main({ lotId: 'lot1', patch: { name: 'x' } })).code).toBe('NO_AUTH')
  })

  it('lot_admin 改别人的车场 → FORBIDDEN', async () => {
    seedUser()
    seedLot({ adminUserId: 'openid-other' })
    expect((await main({ lotId: 'lot1', patch: { name: 'x' } })).code).toBe('FORBIDDEN')
  })

  it('车场不存在 → NOT_FOUND', async () => {
    seedUser()
    expect((await main({ lotId: 'lot1', patch: { name: 'x' } })).code).toBe('NOT_FOUND')
  })

  it('空 patch → BAD_REQUEST', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', patch: {} })).code).toBe('BAD_REQUEST')
  })

  it('非白名单字段被拒（偷偷塞字段污染库）→ BAD_REQUEST', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', patch: { foo: 'bar', name: 'x' } })
    expect(r.code).toBe('BAD_REQUEST')
  })

  it('类型不合法（firstHour 非数字）→ BAD_REQUEST', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', patch: { pricing: { firstHour: 'x' } } })).code).toBe('BAD_REQUEST')
  })

  it('reservableQuota 已退役（2026-09-17）：不在 patch 白名单，整单拒绝、值不动', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', patch: { reservableQuota: 20 } })
    expect(r.code).toBe('BAD_REQUEST')
    expect(mockStore.lots.get('lot1')!.reservableQuota).toBe(10)
  })

  it('改价：更新 pricing + 保留 source + 落 lot_price_changes（只记变更字段）', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', patch: { pricing: { firstHour: 4 } } })
    expect(r.code).toBe(0)
    expect(r.data.priceChanged).toBe(true)

    const pricing = mockStore.lots.get('lot1')!.pricing as Record<string, unknown>
    expect(pricing.firstHour).toBe(4)
    expect(pricing.perHourAfter).toBe(2) // 未变更字段保留
    expect(pricing.source).toBe('placeholder') // 来源标注不可被车场主改

    const change = [...mockStore.lot_price_changes.values()][0]
    expect(change.lotId).toBe('lot1')
    expect(change.before).toEqual({ firstHour: 3 })
    expect(change.after).toEqual({ firstHour: 4 })
    expect(change.operatorId).toBe('openid-test-1')
    expect(change.note).toBe('车场管理员调整')
  })

  it('改价但值没变 → 不落留痕', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', patch: { pricing: { firstHour: 3 } } })
    expect(r.code).toBe(0)
    expect(r.data.priceChanged).toBe(false)
    expect(mockStore.lot_price_changes.size).toBe(0)
  })

  it('ops_admin 可改任何车场（Web 兜底）', async () => {
    seedUser({ role: 'ops_admin' })
    seedLot({ adminUserId: 'openid-other' })
    const r = await main({ lotId: 'lot1', patch: { pricing: { capPerDay: 30 } } })
    expect(r.code).toBe(0)
    const change = [...mockStore.lot_price_changes.values()][0]
    expect(change.note).toBe('平台运营调整')
  })

  it('改设施数组（合法）', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', patch: { facilities: ['充电桩'] } })
    expect(r.code).toBe(0)
    expect(mockStore.lots.get('lot1')!.facilities).toEqual(['充电桩'])
  })

  it('收费价格超上限 → 拒绝（云端权威，客户端可被绕过）', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', patch: { pricing: { firstHour: 500 } } })).code).toBe('BAD_REQUEST')
  })

  it('单日封顶超上限 → 拒绝', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', patch: { pricing: { capPerDay: 9999 } } })).code).toBe('BAD_REQUEST')
  })

  it('步长超出 5~120 → 拒绝；步长非整数 → 拒绝', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', patch: { pricing: { stepMinutes: 2 } } })).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1', patch: { pricing: { stepMinutes: 300 } } })).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1', patch: { pricing: { stepMinutes: 10.5 } } })).code).toBe('BAD_REQUEST')
  })

  it('上限内合法值通过', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', patch: { pricing: { firstHour: 200, capPerDay: 1000, stepMinutes: 60 } } })
    expect(r.code).toBe(0)
  })
})
