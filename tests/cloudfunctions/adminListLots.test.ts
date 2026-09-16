// adminListLots 云函数（CommonJS .js）的离线测试。
// 复用 adminReservations 的 stub 手法。测：返回全部签约车场、不鉴权（绑定前身份是 driver）。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null

jest.mock(
  'wx-server-sdk',
  () => {
    const mkCollection = (collName: string) => ({
      limit: (n: number) => ({
        get: async () => ({
          data: [...mockStore[collName].values()].slice(0, n).map(d => ({ ...d })),
        }),
      }),
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      getWXContext: () => ({ OPENID: mockOpenid }),
      database: () => ({ collection: (name: string) => mkCollection(name) }),
    }
  },
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const adminListLots = require('../../cloudfunctions/adminListLots/index.js')
const main: () => Promise<any> = adminListLots.main

describe('adminListLots', () => {
  beforeEach(() => {
    mockStore = { lots: new Map() }
    mockOpenid = 'openid-test-1'
    mockStore.lots.set('lot1', {
      _id: 'lot1',
      name: '合肥大学(南艳湖校区)停车场',
      address: '安徽省合肥市蜀山区锦绣大道99号',
    })
    mockStore.lots.set('lot2', {
      _id: 'lot2',
      name: '金屿海岸地上停车场',
      address: '安徽省合肥市蜀山区锦绣大道',
      adminUserId: 'openid-other',
    })
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    expect((await main()).code).toBe('NO_AUTH')
  })

  it('返回全部车场（不鉴权，绑定前身份可能是 driver）', async () => {
    const r = await main()
    expect(r.code).toBe(0)
    expect(r.data.list.length).toBe(2)
    const first = r.data.list[0]
    expect(first._id).toBe('lot1')
    expect(first.name).toBe('合肥大学(南艳湖校区)停车场')
    expect(first.adminUserId).toBeNull()
  })

  it('已绑定车场带出 adminUserId，前端可标「已被绑定」', async () => {
    const r = await main()
    const bound = r.data.list.find((x: { _id: string }) => x._id === 'lot2')
    expect(bound.adminUserId).toBe('openid-other')
  })
})
