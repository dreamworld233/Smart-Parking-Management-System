// verifyReservation 云函数（CommonJS .js）的离线测试。
//
// 复用 adminUpdateLot 的 stub 手法（doc().get()/update + add + where().limit().get()）。
// 测试重点是：双入口（输码/手动）、CAS 并发、权限（非管理员/越权）、
// 跨场防串单（verifyCode 不全局唯一）、entry_logs 留痕。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
let mockCasConflictOnce: boolean
let mockCasConflictUsed: boolean

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

    const matchQuery = (query: Record<string, unknown>) => (doc: Record<string, unknown>): boolean =>
      Object.entries(query).every(([k, v]) => doc[k] === v)

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
            data: [...mockStore[collName].values()].filter(matchQuery(query)).slice(0, 1).map(d => ({ ...d })),
          }),
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          if (collName === 'reservations' && mockCasConflictOnce && !mockCasConflictUsed) {
            // 模拟并发方抢先核销：预检读到的还是 pending_entry（通过），
            // 但 CAS 更新时状态已变 → updated 0，走 ALREADY_PROCESSED 分支
            mockCasConflictUsed = true
            return { stats: { updated: 0 } }
          }
          for (const [id, doc] of mockStore[collName]) {
            if (matchQuery(query)(doc)) {
              Object.assign(doc, data)
              return { stats: { updated: 1 } }
            }
          }
          return { stats: { updated: 0 } }
        },
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
const verifyReservation = require('../../cloudfunctions/verifyReservation/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = verifyReservation.main

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
    ...overrides,
  })
}

function seedReservation(id: string, overrides: Record<string, unknown> = {}): void {
  mockStore.reservations.set(id, {
    _id: id,
    lotId: 'lot1',
    plateNo: '京A12345',
    arriveTime: Date.now() + 60 * 60 * 1000,
    verifyCode: '123456',
    status: 'pending_entry',
    ...overrides,
  })
}

describe('verifyReservation', () => {
  beforeEach(() => {
    mockStore = { users: new Map(), lots: new Map(), reservations: new Map(), entry_logs: new Map() }
    mockOpenid = 'openid-test-1'
    mockCasConflictOnce = false
    mockCasConflictUsed = false
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    expect((await main({})).code).toBe('NO_AUTH')
  })

  it('参数非法（method 不合法 / 码非 6 位 / 手动缺车牌）→ BAD_REQUEST', async () => {
    expect((await main({ lotId: 'lot1', method: 'x' })).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1', method: 'code', verifyCode: 'abc' })).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1', method: 'manual' })).code).toBe('BAD_REQUEST')
  })

  it('非管理员 → NO_AUTH', async () => {
    seedUser({ role: 'driver' })
    seedLot()
    seedReservation('r1')
    expect((await main({ lotId: 'lot1', method: 'code', verifyCode: '123456' })).code).toBe('NO_AUTH')
  })

  it('lot_admin 核销别人的车场 → FORBIDDEN', async () => {
    seedUser()
    seedLot({ adminUserId: 'openid-other' })
    seedReservation('r1')
    expect((await main({ lotId: 'lot1', method: 'code', verifyCode: '123456' })).code).toBe('FORBIDDEN')
  })

  it('输码命中：status → entered + entryMethod + entry_logs', async () => {
    seedUser()
    seedLot()
    seedReservation('r1')
    const r = await main({ lotId: 'lot1', method: 'code', verifyCode: '123456' })
    expect(r.code).toBe(0)
    expect(r.data.reservationId).toBe('r1')
    expect(r.data.status).toBe('entered')

    const res = mockStore.reservations.get('r1')!
    expect(res.status).toBe('entered')
    expect(res.entryMethod).toBe('code')
    expect(typeof res.enteredAt).toBe('number')

    const log = [...mockStore.entry_logs.values()][0]
    expect(log).toMatchObject({ reservationId: 'r1', lotId: 'lot1', method: 'code', operatorId: 'openid-test-1' })
    expect(log.confidence).toBeNull()
  })

  it('码无效 → CODE_INVALID，状态不变', async () => {
    seedUser()
    seedLot()
    seedReservation('r1')
    const r = await main({ lotId: 'lot1', method: 'code', verifyCode: '999999' })
    expect(r.code).toBe('CODE_INVALID')
    expect(mockStore.reservations.get('r1')!.status).toBe('pending_entry')
    expect(mockStore.entry_logs.size).toBe(0)
  })

  it('码跨场防串单：同码在别的车场，不命中', async () => {
    seedUser()
    seedLot()
    // 同 verifyCode 的预约在另一个车场（lot2），本车场没有
    seedReservation('r1', { lotId: 'lot2' })
    const r = await main({ lotId: 'lot1', method: 'code', verifyCode: '123456' })
    expect(r.code).toBe('CODE_INVALID')
  })

  it('手动按车牌命中', async () => {
    seedUser()
    seedLot()
    seedReservation('r1')
    const r = await main({ lotId: 'lot1', method: 'manual', plateNo: '京A12345' })
    expect(r.code).toBe(0)
    expect(mockStore.reservations.get('r1')!.status).toBe('entered')
    expect(mockStore.reservations.get('r1')!.entryMethod).toBe('manual')
    expect([...mockStore.entry_logs.values()][0].method).toBe('manual')
  })

  it('手动无匹配 → NO_MATCH', async () => {
    seedUser()
    seedLot()
    seedReservation('r1')
    const r = await main({ lotId: 'lot1', method: 'manual', plateNo: '皖B88888' })
    expect(r.code).toBe('NO_MATCH')
  })

  it('plate（OCR 命中）：按车牌核销，entry_logs 记 method plate + confidence + imageFileID', async () => {
    seedUser()
    seedLot()
    seedReservation('r1')
    const r = await main({
      lotId: 'lot1',
      method: 'plate',
      plateNo: '京A12345',
      confidence: 98,
      imageFileID: 'cloud://x/plate.png',
    })
    expect(r.code).toBe(0)
    expect(r.data.status).toBe('entered')
    expect(mockStore.reservations.get('r1')!.status).toBe('entered')
    expect(mockStore.reservations.get('r1')!.entryMethod).toBe('plate')
    const log = [...mockStore.entry_logs.values()][0]
    expect(log.method).toBe('plate')
    expect(log.confidence).toBe(98)
    expect(log.imageFileID).toBe('cloud://x/plate.png')
  })

  it('plate 无匹配（OCR 识别出的车牌没预约）→ NO_MATCH，提示降级', async () => {
    seedUser()
    seedLot()
    seedReservation('r1')
    const r = await main({
      lotId: 'lot1',
      method: 'plate',
      plateNo: '皖B88888',
      confidence: 95,
      imageFileID: 'cloud://x/plate.png',
    })
    expect(r.code).toBe('NO_MATCH')
    expect(mockStore.reservations.get('r1')!.status).toBe('pending_entry')
    expect(mockStore.entry_logs.size).toBe(0)
  })

  it('plate 缺车牌 → BAD_REQUEST', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', method: 'plate', confidence: 90 })
    expect(r.code).toBe('BAD_REQUEST')
  })

  it('CAS 并发：双击只成功一次，第二次 ALREADY_PROCESSED', async () => {
    seedUser()
    seedLot()
    seedReservation('r1')
    mockCasConflictOnce = true
    const r = await main({ lotId: 'lot1', method: 'code', verifyCode: '123456' })
    expect(r.code).toBe('ALREADY_PROCESSED')
    // 冲突分支不写 entry_logs（CAS 没过，核销没发生）
    expect(mockStore.entry_logs.size).toBe(0)
  })

  it('ops_admin 可核销任意车场（兜底）', async () => {
    seedUser({ role: 'ops_admin' })
    seedLot({ adminUserId: 'openid-other' })
    seedReservation('r1')
    const r = await main({ lotId: 'lot1', method: 'code', verifyCode: '123456' })
    expect(r.code).toBe(0)
  })
})
