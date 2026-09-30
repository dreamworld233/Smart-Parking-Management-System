// adminDashboard 云函数（CommonJS .js）的离线测试。
//
// 复用 adminGetLot 的 stub 手法，加 count() / orderBy().limit().get() / _.gte()。
// 测试重点是：权限、未绑定车场、三统计（今日/待核销/净收益）、待核销列表排序截断、
// 收益明细口径（净收益 = 预支 − 退款，服务费不计入）、days 范围白名单。

// 标记为模块：顶层声明（Store/mockStore/main 等）不落入全局作用域，避免与其它
// stub 式测试文件在同一 jest worker 里被 ts-jest 合并编译时撞名（全局脚本无 import/export）。
export {}

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
      doc: (id: string) => ({
        get: async () => {
          const doc = mockStore[collName].get(id)
          if (!doc) throw new Error('document not found') // 真实 SDK doc.get 缺失即抛错
          return { data: doc }
        },
      }),
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
const main: (event?: any) => Promise<any> = adminDashboard.main

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
    expect((await main({ lotId: 'lot1' })).code).toBe('NO_AUTH')
  })

  it('非 lot_admin → NO_AUTH', async () => {
    seedUser({ role: 'driver' })
    seedLot()
    expect((await main({ lotId: 'lot1' })).code).toBe('NO_AUTH')
  })

  it('缺少 lotId → BAD_REQUEST', async () => {
    seedUser()
    seedLot()
    expect((await main({})).code).toBe('BAD_REQUEST')
  })

  it('查看非本人车场 → FORBIDDEN', async () => {
    seedUser()
    seedLot()
    mockStore.lots.set('lot2', {
      _id: 'lot2',
      name: '别人家的',
      address: 'x',
      adminUserId: 'openid-other',
      availability: { freeSpots: 1, totalSpots: 2, source: 'reported' },
    })
    const r = await main({ lotId: 'lot2' })
    expect(r.code).toBe('FORBIDDEN')
  })

  it('车场不存在 → NOT_FOUND', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot_no_such' })).code).toBe('NOT_FOUND')
  })

  it('统计：今日预约 / 待核销 / 今日净收益（预支 − 退还的预支停车费）', async () => {
    seedUser()
    seedLot()
    // 今日 2 单（1 待入场 1 已入场），昨天 1 单不计今日
    seedReservation('r1', { status: 'pending_entry', createdAt: NOW })
    seedReservation('r2', { status: 'entered', createdAt: NOW })
    seedReservation('r3', { status: 'pending_entry', createdAt: NOW - DAY })
    // 今日收入流水：prepaid 6、service 2（归平台）
    seedOrder({ amount: 6, type: 'prepaid', paidAt: NOW })
    seedOrder({ amount: 2, type: 'service', paidAt: NOW })
    seedOrder({ amount: 99, type: 'prepaid', paidAt: NOW - DAY }) // 昨天不算今日

    const r = await main({ lotId: 'lot1' })
    expect(r.code).toBe(0)
    expect(r.data.todayReservations).toBe(2) // r1+r2（r3 是昨天）
    // pendingEntry 是全量 status 计数，不看 createdAt → r1 + r3 = 2
    expect(r.data.pendingEntry).toBe(2)
    expect(r.data.todayIncome).toBe(6) // 6；service 2 不归车场
  })

  it('收益明细：车场净收益只扣停车费那一半，服务费净额单列', async () => {
    seedUser()
    seedLot()
    // 两单各 prepaid 6 / service 2：
    //   r1 免费窗口内全退 → 车场退 6、平台退 2
    //   r2 窗口外退一半停车费 → 车场退 3、服务费不退
    seedOrder({ amount: 6, type: 'prepaid', paidAt: NOW })
    seedOrder({ amount: 2, type: 'service', paidAt: NOW })
    seedOrder({ amount: 6, type: 'prepaid', paidAt: NOW })
    seedOrder({ amount: 2, type: 'service', paidAt: NOW })
    seedReservation('r1', { status: 'cancelled', refundAt: NOW, refundParking: 6, refundService: 2 })
    seedReservation('r2', { status: 'cancelled', refundAt: NOW, refundParking: 3, refundService: 0 })
    seedOrder({ amount: 99, type: 'unknown_type', paidAt: NOW }) // 未知科目不计入

    const r = await main({ lotId: 'lot1' })
    expect(r.data.income.days).toBe(7)
    expect(r.data.income.prepaid).toBe(12)
    expect(r.data.income.refundParking).toBe(9)
    expect(r.data.income.service).toBe(4)
    expect(r.data.income.refundService).toBe(2)
    // 12 − 9。若照 orders 的合并退款流水减（−8 与 −3）会算成 1，把平台那 2 元算成车场亏损
    expect(r.data.income.net).toBe(3)
    expect(r.data.income.serviceNet).toBe(2) // 4 − 2
    expect(r.data.todayIncome).toBe(3)
    expect(r.data.income.truncated).toBe(false)
  })

  it('orders 的 refund 合并流水不参与扣减（口径唯一来源是主档拆分）', async () => {
    seedUser()
    seedLot()
    seedOrder({ amount: 6, type: 'prepaid', paidAt: NOW })
    seedOrder({ amount: 2, type: 'service', paidAt: NOW })
    // 免费取消的合并退款流水（停车费 6 + 服务费 2），但没有对应主档
    seedOrder({ amount: -8, type: 'refund', paidAt: NOW })

    const r = await main({ lotId: 'lot1' })
    expect(r.data.income.prepaid).toBe(6)
    expect(r.data.income.refundParking).toBe(0)
    expect(r.data.income.net).toBe(6) // 不被那条流水影响
    expect(r.data.todayIncome).toBe(6)
  })

  it('跨期退款：区间内只有退款没有预支时，净收益如实为负', async () => {
    seedUser()
    seedLot()
    // 20 天前下的单今天才取消：预支落在区间外，退款落在区间内
    seedReservation('r1', {
      status: 'cancelled',
      createdAt: NOW - 20 * DAY,
      refundAt: NOW,
      refundParking: 6,
      refundService: 0,
    })

    const r = await main({ lotId: 'lot1', days: 30 })
    expect(r.data.income.prepaid).toBe(0)
    expect(r.data.income.refundParking).toBe(6)
    expect(r.data.income.net).toBe(-6)
    expect(r.data.trend[29].income).toBe(-6) // 趋势当日也按同一口径
  })

  it('趋势：长度 = days，末点是今日，收入为当日净收益', async () => {
    seedUser()
    seedLot()
    seedOrder({ amount: 6, type: 'prepaid', paidAt: NOW })
    seedOrder({ amount: 2, type: 'service', paidAt: NOW })
    seedOrder({ amount: 3, type: 'prepaid', paidAt: NOW - DAY })

    const r = await main({ lotId: 'lot1' })
    expect(r.data.trend.length).toBe(7)
    expect(r.data.trend[6].income).toBe(6) // 今日：service 不算
    expect(r.data.trend[5].income).toBe(3) // 昨日
    expect(r.data.trend[0].income).toBe(0)
  })

  it('days=30 收进 7 日窗口外的流水；非法 days 落回 7', async () => {
    seedUser()
    seedLot()
    seedOrder({ amount: 50, type: 'prepaid', paidAt: NOW - 10 * DAY })

    const d7 = await main({ lotId: 'lot1' })
    expect(d7.data.trend.length).toBe(7)
    expect(d7.data.income.prepaid).toBe(0) // 10 天前在 7 日窗口外

    const d30 = await main({ lotId: 'lot1', days: 30 })
    expect(d30.data.trend.length).toBe(30)
    expect(d30.data.income.prepaid).toBe(50)

    expect((await main({ lotId: 'lot1', days: 999 })).data.income.days).toBe(7)
    expect((await main({ lotId: 'lot1', days: 'abc' })).data.income.days).toBe(7)
  })

  it('区间单量：预约数按 createdAt 落在范围内，已核销按 entered/completed 计', async () => {
    seedUser()
    seedLot()
    seedReservation('r1', { status: 'pending_entry', createdAt: NOW })
    seedReservation('r2', { status: 'entered', createdAt: NOW - DAY })
    seedReservation('r3', { status: 'completed', createdAt: NOW - 2 * DAY })
    seedReservation('r4', { status: 'cancelled', createdAt: NOW - 3 * DAY })
    seedReservation('r5', { status: 'entered', createdAt: NOW - 40 * DAY }) // 30 日窗外

    const r = await main({ lotId: 'lot1', days: 30 })
    expect(r.data.income.reservationCount).toBe(4)
    expect(r.data.income.verifiedCount).toBe(2) // r2 + r3
    expect(r.data.trend[29].reservations).toBe(1) // 今日 r1
  })

  it('待核销列表：按 arriveTime 升序 + 最多 5 条', async () => {
    seedUser()
    seedLot()
    for (let i = 0; i < 7; i++) {
      seedReservation('r' + i, { arriveTime: NOW + i * 60 * 60 * 1000 })
    }
    const r = await main({ lotId: 'lot1' })
    expect(r.data.pendingList.length).toBe(5)
    // 升序：第一条 arriveTime 最早
    expect(r.data.pendingList[0]._id).toBe('r0')
    expect(r.data.pendingList[4]._id).toBe('r4')
  })
})
