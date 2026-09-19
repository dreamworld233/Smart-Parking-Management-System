// adminReservations 云函数（CommonJS .js）的离线测试。
//
// 复用 adminGetLot 的 stub 手法，加 orderBy().limit().get()。测试重点是：
// 权限、未绑定车场、列表按 arriveTime 升序 + 字段精简。

// 标记为模块：顶层声明（Store/mockStore/main 等）不落入全局作用域，避免与其它
// stub 式测试文件在同一 jest worker 里被 ts-jest 合并编译时撞名（全局脚本无 import/export）。
export {}

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null

jest.mock(
  'wx-server-sdk',
  () => {
    const matchQuery = (query: Record<string, unknown>) => (doc: Record<string, unknown>): boolean =>
      Object.entries(query).every(([k, v]) => doc[k] === v)

    const mkCollection = (collName: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const doc = mockStore[collName].get(id)
          if (!doc) throw new Error('document not found') // 真实 SDK doc.get 缺失即抛错
          return { data: doc }
        },
      }),
      where: (query: Record<string, unknown>) => ({
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
        collection: (name: string) => mkCollection(name),
      }),
    }
  },
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminReservations = require('../../cloudfunctions/adminReservations/index.js')
const main: (event?: any) => Promise<any> = adminReservations.main

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
    lotName: '合肥大学(南艳湖校区)停车场',
    orderNo: `NO-${id}`,
    plateNo: '京A12345',
    arriveTime: Date.now(),
    enterDeadline: Date.now() + 15 * 60 * 1000,
    prepaidParkingFee: 5,
    serviceFee: 2,
    totalAmount: 7,
    status: 'pending_entry',
    verifyCode: '123456',
    createdAt: Date.now(),
    ...overrides,
  })
}

describe('adminReservations', () => {
  beforeEach(() => {
    mockStore = { users: new Map(), lots: new Map(), reservations: new Map() }
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
      adminUserId: 'openid-other',
    })
    const r = await main({ lotId: 'lot2' })
    expect(r.code).toBe('FORBIDDEN')
  })

  it('车场不存在 → NOT_FOUND', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot_no_such' })).code).toBe('NOT_FOUND')
  })

  it('列表按 arriveTime 升序 + 全字段（列表卡片与详情视图共用）', async () => {
    seedUser()
    seedLot()
    seedReservation('r1', { arriveTime: Date.now() + 2 * 60 * 60 * 1000, totalAmount: 8 })
    seedReservation('r2', { arriveTime: Date.now() + 1 * 60 * 60 * 1000 })
    seedReservation('r3', { arriveTime: Date.now(), status: 'entered', refundTotal: 3 })

    const r = (await main({ lotId: 'lot1' })) as any
    expect(r.code).toBe(0)
    expect(r.data.lot._id).toBe('lot1')
    expect(r.data.list.map((x: { _id: string }) => x._id)).toEqual(['r3', 'r2', 'r1'])
    const first = r.data.list[0]
    expect(first.plateNo).toBe('京A12345')
    expect(first.status).toBe('entered')
    // 详情视图依赖的字段必须带全（不是精简列表）
    expect(first.orderNo).toBe('NO-r3')
    expect(first.enterDeadline).toEqual(expect.any(Number))
    expect(first.prepaidParkingFee).toBe(5)
    expect(first.serviceFee).toBe(2)
    expect(first.totalAmount).toBe(7)
    expect(first.verifyCode).toBe('123456')
    expect(first.refundTotal).toBe(3)
  })
})
