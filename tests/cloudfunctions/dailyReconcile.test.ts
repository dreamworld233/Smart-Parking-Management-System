// dailyReconcile 云函数（CommonJS .js）的离线测试。
//
// 复用 releaseExpiredReservations.test.ts 的 stub 手法：jest.mock('wx-server-sdk') 返回内存
// store，where().count() 真按 query 过滤。差异只在：
// - 主查询是 lots.limit(BATCH).get()（无 where），所以 stub 的 collection 要直接支持 limit()
// - 子查询是 reservations.where({ lotId, status: _.in([...]) }).count()，所以 command 补一个
//   in：{ __op: 'in', value: [...] }，matchQuery 对 __op==='in' 走数组 includes
// - 记录每次 doc().update 的调用次数 mockUpdateCount：验证「只有不一致才写」与二次跑幂等
// - 单车场失败注入：mockFailCountLotId（该车场的 count 抛错）不中断整批

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
let mockFailCountLotId: string | null
let mockUpdateCount: number

jest.mock(
  'wx-server-sdk',
  () => {
    const isOp = (v: unknown, op: string): v is { __op: string; value: unknown } =>
      !!v && typeof v === 'object' && (v as { __op?: string }).__op === op

    const matchQuery = (query: Record<string, unknown>) => (doc: Record<string, unknown>): boolean =>
      Object.entries(query).every(([k, v]) => {
        // _.in([...]) 在 query 里是 { __op: 'in', value: [...] }：doc[k] 落在数组里才算匹配
        if (isOp(v, 'in')) return (v as { value: unknown[] }).value.includes(doc[k])
        return doc[k] === v
      })

    const mkDocApi = (collName: string, id: string) => ({
      get: async () => {
        const doc = mockStore[collName].get(id)
        if (!doc) throw new Error('document.get:fail document not exists')
        return { data: { ...doc } }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        mockUpdateCount++
        const doc = mockStore[collName].get(id)
        if (!doc) return { stats: { updated: 0 } }
        Object.assign(doc, data)
        return { stats: { updated: 1 } }
      },
    })

    const mkCollection = (collName: string) => ({
      doc: (id: string) => mkDocApi(collName, id),
      // 主查询 lots.limit(BATCH).get() 直接挂在 collection 上（无 where）
      limit: (n: number) => ({
        get: async () => ({
          data: [...mockStore[collName].values()].slice(0, n).map((d) => ({ ...d })),
        }),
      }),
      where: (query: Record<string, unknown>) => ({
        count: async () => {
          // 注入「该车场 count 失败」：验证单车场失败不中断整批
          if (collName === 'reservations' && mockFailCountLotId === (query.lotId as string)) {
            throw new Error('reservations.count failed')
          }
          return { total: [...mockStore[collName].values()].filter(matchQuery(query)).length }
        },
      }),
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      getWXContext: () => ({ OPENID: mockOpenid }),
      database: () => ({
        command: { in: (arr: unknown[]) => ({ __op: 'in', value: arr }) },
        collection: (name: string) => mkCollection(name),
      }),
    }
  },
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dailyReconcile = require('../../cloudfunctions/dailyReconcile/index.js')
const main: () => Promise<any> = dailyReconcile.main

/** 铺一张预约单。默认 pending_entry，挂在 lot1 */
function seedReservation(id: string, overrides: Record<string, unknown> = {}): void {
  mockStore.reservations.set(id, {
    _id: id,
    userId: 'openid-test-1',
    lotId: 'lot1',
    status: 'pending_entry',
    ...overrides,
  })
}

function seedLot(id = 'lot1', overrides: Record<string, unknown> = {}): void {
  mockStore.lots.set(id, {
    _id: id,
    name: '万象城测试店',
    reservedCount: 1,
    ...overrides,
  })
}

function freshStore(): Store {
  return {
    lots: new Map(),
    reservations: new Map(),
  }
}

beforeEach(() => {
  mockStore = freshStore()
  mockOpenid = 'openid-test-1'
  mockFailCountLotId = null
  mockUpdateCount = 0
})

describe('dailyReconcile 一致与漂移修正', () => {
  it('一致：current == expected → 不写任何 update', async () => {
    seedLot('lot1', { reservedCount: 2 })
    seedReservation('r1')
    seedReservation('r2')

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 0, checked: 1 })
    expect(mockUpdateCount).toBe(0)
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(2)
  })

  it('漂移：current 2 但生效单 3 张 → 修正成 expected 3', async () => {
    seedLot('lot1', { reservedCount: 2 })
    seedReservation('r1') // pending_entry 计
    seedReservation('r2', { status: 'entered' }) // entered 计（核销不减额度，仍占车位）
    seedReservation('r3', { status: 'completed' }) // completed 计

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 1, checked: 1 })
    expect(mockUpdateCount).toBe(1)
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(3)
  })

  it('修正后二次跑幂等：不再写', async () => {
    seedLot('lot1', { reservedCount: 2 })
    seedReservation('r1')
    seedReservation('r2')
    seedReservation('r3')

    const first = await main()
    expect(first.data.corrected).toBe(1)
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(3)

    const second = await main()
    expect(second.data).toEqual({ lots: 1, corrected: 0, checked: 1 })
    expect(mockUpdateCount).toBe(1) // 第一次写了 1 次，第二次不再写
  })

  it('cancelled / released 不计入理论值（已回补额度）', async () => {
    seedLot('lot1', { reservedCount: 1 }) // 只有 1 张生效单
    seedReservation('r1')
    seedReservation('r2', { status: 'cancelled' })
    seedReservation('r3', { status: 'released' })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 0, checked: 1 })
    expect(mockUpdateCount).toBe(0)
  })
})

describe('dailyReconcile 边界与容错', () => {
  it('无任何预约的车场：current 有残留 → 清 0', async () => {
    seedLot('lot1', { reservedCount: 5 })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 1, checked: 1 })
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(0)
  })

  it('无任何预约且 current 已 0 → 不写', async () => {
    seedLot('lot1', { reservedCount: 0 })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 0, checked: 1 })
    expect(mockUpdateCount).toBe(0)
  })

  it('定时触发无 OPENID 不拦截（系统任务），照常执行', async () => {
    seedLot('lot1', { reservedCount: 1 })
    seedReservation('r1')
    mockOpenid = null

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 0, checked: 1 })
  })

  it('单车场 count 失败不中断整批：其余车场照常修正', async () => {
    seedLot('lot1', { reservedCount: 0 })
    seedLot('lot2', { reservedCount: 0 })
    seedLot('lot3', { reservedCount: 0 })
    seedReservation('r1', { lotId: 'lot1' })
    seedReservation('r2', { lotId: 'lot3' })
    seedReservation('r3', { lotId: 'lot3' })
    mockFailCountLotId = 'lot2'

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 3, corrected: 2, checked: 2 })
    // lot1、lot3 照常修正；lot2 失败跳过，额度保持原值
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(1)
    expect(mockStore.lots.get('lot2')!.reservedCount).toBe(0)
    expect(mockStore.lots.get('lot3')!.reservedCount).toBe(2)
    expect(mockUpdateCount).toBe(2)
  })
})
