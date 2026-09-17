// dailyReconcile 云函数（CommonJS .js）的离线测试。
//
// 2026-09-17 改职责：reservedCount 已退役（余位统一为 availability.freeSpots 单数），
// 原「按 reservations 重算 reservedCount」对账失效。现职责 = 每日钳 freeSpots 到
// 合法区间 [0, totalSpots]：负数（回补/并发边界）→ 0，超总位 → 总位；未上报（null）
// 不修。
//
// stub 手法：jest.mock('wx-server-sdk') 返回内存 store；主查询 lots.limit(BATCH).get()，
// 修正 lots.doc().update。记录 mockUpdateCount 验证「只有不一致才写」与二次跑幂等。
// 单车场 update 失败注入 mockFailUpdateLotId，验证不中断整批。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
let mockFailUpdateLotId: string | null
let mockUpdateCount: number

jest.mock(
  'wx-server-sdk',
  () => {
    const setPath = (doc: Record<string, unknown>, path: string, value: unknown): void => {
      const segs = path.split('.')
      let cur: Record<string, unknown> = doc
      for (let i = 0; i < segs.length - 1; i++) {
        const k = segs[i]
        if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
        cur = cur[k] as Record<string, unknown>
      }
      cur[segs[segs.length - 1]] = value
    }

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
        if (collName === 'lots' && mockFailUpdateLotId === id) {
          // 模拟该车场 update 抛错：单车场失败不中断整批
          throw new Error('lots.update failed')
        }
        setPath(doc, 'availability.freeSpots', data['availability.freeSpots'])
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
const dailyReconcile = require('../../cloudfunctions/dailyReconcile/index.js')
const main: () => Promise<any> = dailyReconcile.main

function seedLot(id = 'lot1', overrides: Record<string, unknown> = {}): void {
  mockStore.lots.set(id, {
    _id: id,
    name: '万象城测试店',
    availability: { freeSpots: 5, totalSpots: 50, source: 'reported' },
    ...overrides,
  })
}

function freshStore(): Store {
  return { lots: new Map() }
}

beforeEach(() => {
  mockStore = freshStore()
  mockOpenid = 'openid-test-1'
  mockFailUpdateLotId = null
  mockUpdateCount = 0
})

describe('dailyReconcile 钳 freeSpots 合法区间', () => {
  it('一致：freeSpots 在 [0, total] 内 → 不写任何 update', async () => {
    seedLot('lot1', { availability: { freeSpots: 5, totalSpots: 50, source: 'reported' } })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 0, checked: 1 })
    expect(mockUpdateCount).toBe(0)
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(5)
  })

  it('负数（回补/并发边界）→ 钳 0', async () => {
    seedLot('lot1', { availability: { freeSpots: -3, totalSpots: 50, source: 'reported' } })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 1, checked: 1 })
    expect(mockUpdateCount).toBe(1)
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(0)
  })

  it('超总位 → 钳到总位数', async () => {
    seedLot('lot1', { availability: { freeSpots: 60, totalSpots: 50, source: 'reported' } })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 1, checked: 1 })
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(50)
  })

  it('未上报（freeSpots null）不修：checked 不计入', async () => {
    seedLot('lot1', { availability: { freeSpots: null, totalSpots: 50, source: 'placeholder' } })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 0, checked: 0 })
    expect(mockUpdateCount).toBe(0)
  })

  it('修正后二次跑幂等：不再写', async () => {
    seedLot('lot1', { availability: { freeSpots: -1, totalSpots: 50, source: 'reported' } })

    const first = await main()
    expect(first.data.corrected).toBe(1)
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(0)

    const second = await main()
    expect(second.data).toEqual({ lots: 1, corrected: 0, checked: 1 })
    expect(mockUpdateCount).toBe(1) // 第一次写了 1 次，第二次不再写
  })
})

describe('dailyReconcile 边界与容错', () => {
  it('定时触发无 OPENID 不拦截（系统任务），照常执行', async () => {
    seedLot('lot1', { availability: { freeSpots: -2, totalSpots: 50, source: 'reported' } })
    mockOpenid = null

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data.corrected).toBe(1)
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(0)
  })

  it('单车场 update 失败不中断整批：其余车场照常修正', async () => {
    seedLot('lot1', { availability: { freeSpots: -1, totalSpots: 50, source: 'reported' } })
    seedLot('lot2', { availability: { freeSpots: -1, totalSpots: 50, source: 'reported' } })
    seedLot('lot3', { availability: { freeSpots: -1, totalSpots: 50, source: 'reported' } })
    mockFailUpdateLotId = 'lot2'

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 3, corrected: 2, checked: 3 })
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(0)
    expect((mockStore.lots.get('lot2')!.availability as { freeSpots: number }).freeSpots).toBe(-1)
    expect((mockStore.lots.get('lot3')!.availability as { freeSpots: number }).freeSpots).toBe(0)
    expect(mockUpdateCount).toBe(3) // 3 家都尝试 update（lot2 那次抛错但已计入次数）
  })

  it('freeSpots 非数字（脏数据）不修，等车场端上报覆盖', async () => {
    seedLot('lot1', { availability: { freeSpots: 'abc' as unknown, totalSpots: 50, source: 'reported' } })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ lots: 1, corrected: 0, checked: 0 })
    expect(mockUpdateCount).toBe(0)
  })
})
