// adminGetLot 云函数（CommonJS .js）的离线测试。
//
// 复用 createReservation.test.ts 的 stub 手法：jest.mock('wx-server-sdk') 返回内存
// store，where().limit().get() 真实过滤。差异只在：只有 users / lots 两张集合，
// 且测试重点是「角色判定」与「管理员→车场」两条路径。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null

jest.mock(
  'wx-server-sdk',
  () => {
    const mkCollection = (collName: string) => ({
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
const adminGetLot = require('../../cloudfunctions/adminGetLot/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = adminGetLot.main

function seedUser(overrides: Record<string, unknown> = {}): void {
  const doc: Record<string, unknown> = {
    _id: 'openid-test-1',
    _openid: 'openid-test-1',
    role: 'lot_admin',
    ...overrides,
  }
  mockStore.users.set('openid-test-1', doc)
}

function seedLot(overrides: Record<string, unknown> = {}): void {
  const doc: Record<string, unknown> = {
    _id: 'lot1',
    name: '合肥大学(南艳湖校区)停车场',
    address: '安徽省合肥市蜀山区锦绣大道99号',
    location: { lat: 31.750924, lng: 117.25706 },
    pricing: { firstHour: 3, perHourAfter: 2, stepMinutes: 60, capPerDay: 15, nightRate: null, source: 'placeholder' },
    availability: { totalSpots: 200, source: 'placeholder' },
    reservableQuota: 10,
    reservedCount: 3,
    facilities: [],
    adminUserId: 'openid-test-1',
    note: '测试数据',
    ...overrides,
  }
  mockStore.lots.set('lot1', doc)
}

describe('adminGetLot', () => {
  beforeEach(() => {
    mockStore = { users: new Map(), lots: new Map() }
    mockOpenid = 'openid-test-1'
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    const r = await main({})
    expect(r.code).toBe('NO_AUTH')
  })

  it('无 users 文档 → 按 driver 处理，NO_AUTH', async () => {
    const r = await main({})
    expect(r.code).toBe('NO_AUTH')
  })

  it('非 lot_admin（driver）→ NO_AUTH', async () => {
    seedUser({ role: 'driver' })
    seedLot()
    const r = await main({})
    expect(r.code).toBe('NO_AUTH')
  })

  it('DB 里手标了不认识的角色 → 白名单收窄成 driver，NO_AUTH', async () => {
    // backlog #2：DB 值不能当类型用，漏下划线的 Admin 不许被当成车场端放行
    seedUser({ role: 'Admin' })
    seedLot()
    const r = await main({})
    expect(r.code).toBe('NO_AUTH')
  })

  it('lot_admin 且绑定了车场 → 返回车场', async () => {
    seedUser()
    seedLot()
    const r = await main({})
    expect(r.code).toBe(0)
    expect(r.data.role).toBe('lot_admin')
    expect(r.data.lot).not.toBeNull()
    expect(r.data.lot._id).toBe('lot1')
    expect(r.data.lot.name).toBe('合肥大学(南艳湖校区)停车场')
    expect(r.data.lot.reservedCount).toBe(3)
    // 只返回精简字段，不把 note 等无关字段带出去（pickLot 白名单）
    expect(r.data.lot.note).toBeUndefined()
  })

  it('lot_admin 但没绑定车场 → lot 为 null（不是错误）', async () => {
    seedUser()
    const r = await main({})
    expect(r.code).toBe(0)
    expect(r.data.lot).toBeNull()
  })

  it('多个绑定车场 → 取第一条（本轮一个管理员一个车场）', async () => {
    seedUser()
    seedLot()
    mockStore.lots.set('lot2', {
      _id: 'lot2',
      name: '第二家',
      address: 'x',
      adminUserId: 'openid-test-1',
    })
    const r = await main({})
    expect(r.code).toBe(0)
    expect(r.data.lot._id).toBe('lot1')
  })
})
