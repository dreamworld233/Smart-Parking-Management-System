// bindLot 云函数（CommonJS .js）的离线测试。
// 复用 switchRole 的 stub 手法。测：绑定写 adminUserId + role，已被别人绑拒绝。

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
const bindLot = require('../../cloudfunctions/bindLot/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = bindLot.main

describe('bindLot', () => {
  beforeEach(() => {
    mockStore = { users: new Map(), lots: new Map() }
    mockOpenid = 'openid-test-1'
    mockStore.users.set('openid-test-1', {
      _id: 'openid-test-1',
      _openid: 'openid-test-1',
      role: 'driver',
    })
    mockStore.lots.set('lot1', {
      _id: 'lot1',
      name: '合肥大学(南艳湖校区)停车场',
    })
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    expect((await main({ lotId: 'lot1' })).code).toBe('NO_AUTH')
  })

  it('缺 lotId → BAD_REQUEST', async () => {
    expect((await main({})).code).toBe('BAD_REQUEST')
  })

  it('车场不存在 → NOT_FOUND', async () => {
    expect((await main({ lotId: 'lotX' })).code).toBe('NOT_FOUND')
  })

  it('绑定：写 lots.adminUserId + users.role = lot_admin', async () => {
    const r = await main({ lotId: 'lot1' })
    expect(r.code).toBe(0)
    expect(r.data.lotId).toBe('lot1')
    expect(r.data.name).toBe('合肥大学(南艳湖校区)停车场')
    expect(mockStore.lots.get('lot1')!.adminUserId).toBe('openid-test-1')
    expect(mockStore.users.get('openid-test-1')!.role).toBe('lot_admin')
  })

  it('已被别人绑定 → ALREADY_BOUND，不覆盖', async () => {
    mockStore.lots.get('lot1')!.adminUserId = 'openid-other'
    const r = await main({ lotId: 'lot1' })
    expect(r.code).toBe('ALREADY_BOUND')
    // 别人的绑定不被覆盖
    expect(mockStore.lots.get('lot1')!.adminUserId).toBe('openid-other')
    // 自己的 role 不动（仍是 driver）
    expect(mockStore.users.get('openid-test-1')!.role).toBe('driver')
  })

  it('重复绑定同一家（自己已绑）→ 允许（幂等）', async () => {
    mockStore.lots.get('lot1')!.adminUserId = 'openid-test-1'
    const r = await main({ lotId: 'lot1' })
    expect(r.code).toBe(0)
  })
})
