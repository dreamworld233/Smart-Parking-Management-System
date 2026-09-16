// switchRole 云函数（CommonJS .js）的离线测试。
// 复用 adminUpdateLot 的 stub 手法。测：角色白名单、写 users.role。

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
const switchRole = require('../../cloudfunctions/switchRole/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = switchRole.main

describe('switchRole', () => {
  beforeEach(() => {
    mockStore = { users: new Map() }
    mockOpenid = 'openid-test-1'
    mockStore.users.set('openid-test-1', {
      _id: 'openid-test-1',
      _openid: 'openid-test-1',
      role: 'driver',
    })
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    expect((await main({ role: 'lot_admin' })).code).toBe('NO_AUTH')
  })

  it('角色不合法 → BAD_REQUEST', async () => {
    expect((await main({ role: 'Admin' })).code).toBe('BAD_REQUEST')
    expect((await main({})).code).toBe('BAD_REQUEST')
  })

  it('切 lot_admin：写 users.role', async () => {
    const r = await main({ role: 'lot_admin' })
    expect(r.code).toBe(0)
    expect(r.data.role).toBe('lot_admin')
    expect(mockStore.users.get('openid-test-1')!.role).toBe('lot_admin')
  })

  it('切回 driver', async () => {
    mockStore.users.get('openid-test-1')!.role = 'lot_admin'
    const r = await main({ role: 'driver' })
    expect(r.code).toBe(0)
    expect(mockStore.users.get('openid-test-1')!.role).toBe('driver')
  })
})
