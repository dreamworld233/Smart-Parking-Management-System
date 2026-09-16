// adminReservations 云函数（CommonJS .js）的离线测试。
//
// 复用 adminGetLot 的 stub 手法，加 orderBy().limit().get()。测试重点是：
// 权限、未绑定车场、列表按 arriveTime 升序 + 字段精简。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null

jest.mock(
  'wx-server-sdk',
  () => {
    const matchQuery = (query: Record<string, unknown>) => (doc: Record<string, unknown>): boolean =>
      Object.entries(query).every(([k, v]) => doc[k] === v)

    const mkCollection = (collName: string) => ({
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
const main: () => Promise<any> = adminReservations.main

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
    arriveTime: Date.now(),
    status: 'pending_entry',
    verifyCode: '123456',
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
    expect((await main()).code).toBe('NO_AUTH')
  })

  it('非 lot_admin → NO_AUTH', async () => {
    seedUser({ role: 'driver' })
    seedLot()
    expect((await main()).code).toBe('NO_AUTH')
  })

  it('未绑定车场 → lot null + 空列表', async () => {
    seedUser()
    const r = await main()
    expect(r.code).toBe(0)
    expect(r.data.lot).toBeNull()
    expect(r.data.list).toEqual([])
  })

  it('列表按 arriveTime 升序 + 精简字段（不带订单内部字段）', async () => {
    seedUser()
    seedLot()
    seedReservation('r1', { arriveTime: Date.now() + 2 * 60 * 60 * 1000, totalAmount: 8 })
    seedReservation('r2', { arriveTime: Date.now() + 1 * 60 * 60 * 1000 })
    seedReservation('r3', { arriveTime: Date.now(), status: 'entered' })

    const r = (await main()) as any
    expect(r.code).toBe(0)
    expect(r.data.lot._id).toBe('lot1')
    expect(r.data.list.map((x: { _id: string }) => x._id)).toEqual(['r3', 'r2', 'r1'])
    const first = r.data.list[0]
    expect(first.plateNo).toBe('京A12345')
    expect(first.status).toBe('entered')
    // 精简：不把 totalAmount 等无关字段带出去
    expect(first.totalAmount).toBeUndefined()
  })
})
