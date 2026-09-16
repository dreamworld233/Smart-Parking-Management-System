// adminDashboard 云函数（CommonJS .js）的离线测试。
//
// 复用 adminGetLot 的 stub 手法，加 count() / orderBy().limit().get() / _.gte()。
// 测试重点是：权限、未绑定车场、三统计（今日/待核销/收入）、待核销列表排序截断。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
const NOW = Date.now()
const DAY = 24 * 60 * 60 * 1000

jest.mock(
  'wx-server-sdk',
  () => {
    const matchQuery = (query: Record<string, unknown>) => (doc: Record<string, unknown>): boolean =>
      Object.entries(query).every(([k, v]) => {
        const op = v as { __op?: string; value?: unknown } | null
        if (op && typeof op === 'object' && op.__op === 'gte') {
          return typeof doc[k] === 'number' && (doc[k] as number) >= (op.value as number)
        }
        return doc[k] === v
      })

    const mkCollection = (collName: string) => ({
      where: (query: Record<string, unknown>) => ({
        count: async () => ({
          total: [...mockStore[collName].values()].filter(matchQuery(query)).length,
        }),
        orderBy: () => ({
          limit: (n: number) => ({
            get: async () => ({
              data: [...mockStore[collName].values()]
                .filter(matchQuery(query))
                .sort((a, b) => (a.arriveTime as number) - (b.arriveTime as number))
                .slice(0, n)
                .map(d => ({ ...d })),
            }),
          }),
        }),
        get: async () => ({
          data: [...mockStore[collName].values()].filter(matchQuery(query)).map(d => ({ ...d })),
        }),
        limit: () => ({
          get: async () => ({
            data: [...mockStore[collName].values()].filter(matchQuery(query)).map(d => ({ ...d })),
          }),
        }),
      }),
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      getWXContext: () => ({ OPENID: mockOpenid }),
      database: () => ({
        command: { gte: (n: number) => ({ __op: 'gte', value: n }) },
        collection: (name: string) => mkCollection(name),
      }),
    }
  },
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminDashboard = require('../../cloudfunctions/adminDashboard/index.js')
const main: () => Promise<any> = adminDashboard.main

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
    address: 'x',
    adminUserId: 'openid-test-1',
    availability: { freeSpots: 120, totalSpots: 200, reportedAt: NOW, source: 'reported' },
    reservableQuota: 10,
    reservedCount: 3,
    ...overrides,
  })
}

function seedReservation(id: string, overrides: Record<string, unknown> = {}): void {
  mockStore.reservations.set(id, {
    _id: id,
    lotId: 'lot1',
    plateNo: '京A12345',
    arriveTime: NOW + 60 * 60 * 1000,
    verifyCode: '123456',
    status: 'pending_entry',
    createdAt: NOW,
    ...overrides,
  })
}

function seedOrder(overrides: Record<string, unknown> = {}): void {
  const id = 'ord_' + (mockStore.orders.size + 1)
  mockStore.orders.set(id, {
    _id: id,
    lotId: 'lot1',
    amount: 6,
    type: 'prepaid',
    paidAt: NOW,
    ...overrides,
  })
}

describe('adminDashboard', () => {
  beforeEach(() => {
    mockStore = { users: new Map(), lots: new Map(), reservations: new Map(), orders: new Map() }
    mockOpenid = 'openid-test-1'
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    expect((await main()).code).toBe('NO_AUTH')
  })

  it('非 lot_admin → NO_AUTH', async () => {
    seedUser({ role: 'driver' })
    seedLot()
    expect((await main()).code).toBe('NO_AUTH')
  })

  it('未绑定车场 → lot null + 全 0', async () => {
    seedUser()
    const r = await main()
    expect(r.code).toBe(0)
    expect(r.data.lot).toBeNull()
    expect(r.data.todayReservations).toBe(0)
  })

  it('统计：今日预约 / 待核销 / 今日收入（refund 负值相抵）', async () => {
    seedUser()
    seedLot()
    // 今日 2 单（1 待入场 1 已入场），昨天 1 单不计今日
    seedReservation('r1', { status: 'pending_entry', createdAt: NOW })
    seedReservation('r2', { status: 'entered', createdAt: NOW })
    seedReservation('r3', { status: 'pending_entry', createdAt: NOW - DAY })
    // 今日流水：prepaid 6 + service 2 + refund -4 = 4
    seedOrder({ amount: 6, type: 'prepaid', paidAt: NOW })
    seedOrder({ amount: 2, type: 'service', paidAt: NOW })
    seedOrder({ amount: -4, type: 'refund', paidAt: NOW })
    seedOrder({ amount: 99, type: 'prepaid', paidAt: NOW - DAY }) // 昨天不算

    const r = await main()
    expect(r.code).toBe(0)
    expect(r.data.todayReservations).toBe(2) // r1+r2（r3 是昨天）
    // pendingEntry 是全量 status 计数，不看 createdAt → r1 + r3 = 2
    expect(r.data.pendingEntry).toBe(2)
    expect(r.data.todayIncome).toBe(4) // 6+2-4，昨天的 99 不算
  })

  it('待核销列表：按 arriveTime 升序 + 最多 5 条', async () => {
    seedUser()
    seedLot()
    for (let i = 0; i < 7; i++) {
      seedReservation('r' + i, { arriveTime: NOW + i * 60 * 60 * 1000 })
    }
    const r = await main()
    expect(r.data.pendingList.length).toBe(5)
    // 升序：第一条 arriveTime 最早
    expect(r.data.pendingList[0]._id).toBe('r0')
    expect(r.data.pendingList[4]._id).toBe('r4')
  })
})
