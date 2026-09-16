// sampleAvailability 云函数（CommonJS .js）的离线测试。
//
// 复用 releaseExpiredReservations.test.ts 的 stub 手法：jest.mock('wx-server-sdk')
// 返回内存 store，where().limit().get() 真按 query 过滤。差异只在：
// - 主查询是 where({ 'availability.reportedAt': _.gt(0) }).limit(BATCH).get()，
//   stub 的 matchQuery 必须支持点路径读值 + _.gt 指令，否则「无上报车场不采」测不出
// - 幂等查询是 where({ lotId }).orderBy('sampledAt', 'desc').limit(1).get()，
//   stub 的 orderBy 要真按字段/方向排序取最近一条，才能测「同一窗口已采过跳过」
// - command 补一个 gt：{ __op: 'gt', value }，matchQuery 对 __op==='gt' 走数值大于比较
// - 单条失败注入：mockFailAddLotId（某车场落样本抛错）不中断整批

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
let mockFailAddLotId: string | null

jest.mock(
  'wx-server-sdk',
  () => {
    // 点路径读值：'availability.reportedAt' 这类嵌套字段在 where 查询里要能匹配
    const readPath = (doc: Record<string, unknown>, path: string): unknown => {
      const segs = path.split('.')
      let cur: unknown = doc
      for (const s of segs) {
        if (typeof cur !== 'object' || cur === null) return undefined
        cur = (cur as Record<string, unknown>)[s]
      }
      return cur
    }

    const isOp = (v: unknown, op: string): v is { __op: string; value: number } =>
      !!v && typeof v === 'object' && (v as { __op?: string }).__op === op

    const matchQuery = (query: Record<string, unknown>) => (doc: Record<string, unknown>): boolean =>
      Object.entries(query).every(([k, v]) => {
        const val = readPath(doc, k)
        // _.gt(0) 在 query 里是 { __op: 'gt', value }：值必须是大数字才匹配
        if (isOp(v, 'gt')) return typeof val === 'number' && (val as number) > (v as { value: number }).value
        return val === v
      })

    const mkCollection = (collName: string) => ({
      add: async ({ data }: { data: Record<string, unknown> }) => {
        // 注入「落样本失败」：某车场 add 抛错，验证不中断整批
        if (collName === 'availability_samples' && mockFailAddLotId && (data.lotId as string) === mockFailAddLotId) {
          throw new Error('samples.add failed')
        }
        const id = 'auto_' + (mockStore[collName].size + 1)
        mockStore[collName].set(id, { ...data, _id: id })
        return { _id: id }
      },
      where: (query: Record<string, unknown>) => ({
        limit: (n: number) => ({
          get: async () => ({
            data: [...mockStore[collName].values()].filter(matchQuery(query)).slice(0, n).map((d) => ({ ...d })),
          }),
        }),
        orderBy: (field: string, dir: string) => ({
          limit: (n: number) => ({
            get: async () => {
              const rows = [...mockStore[collName].values()].filter(matchQuery(query))
              // 幂等查询要取「最近一条」：按 sampledAt 真排序，desc 最新在前
              rows.sort((a, b) => {
                const av = (a[field] as number) || 0
                const bv = (b[field] as number) || 0
                return dir === 'desc' ? bv - av : av - bv
              })
              return { data: rows.slice(0, n).map((d) => ({ ...d })) }
            },
          }),
        }),
        get: async () => ({
          data: [...mockStore[collName].values()].filter(matchQuery(query)).map((d) => ({ ...d })),
        }),
      }),
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      getWXContext: () => ({ OPENID: mockOpenid }),
      database: () => ({
        command: { gt: (n: number) => ({ __op: 'gt', value: n }) },
        collection: (name: string) => mkCollection(name),
      }),
    }
  },
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sampleAvailability = require('../../cloudfunctions/sampleAvailability/index.js')
const main: () => Promise<any> = sampleAvailability.main

const NOW = Date.now()
const MIN = 60 * 1000

/** 铺一个车场。默认有上报过的实时余位（150/200，30 分钟前上报） */
function seedLot(id: string, overrides: Record<string, unknown> = {}): void {
  mockStore.lots.set(id, {
    _id: id,
    name: '万象城测试店',
    availability: { freeSpots: 150, totalSpots: 200, reportedAt: NOW - 30 * MIN, source: 'reported' },
    ...overrides,
  })
}

/** 铺一条已有样本。默认 30 分钟前（已过 15 分钟窗口） */
function seedSample(lotId: string, overrides: Record<string, unknown> = {}): void {
  const id = 'smp_' + (mockStore.availability_samples.size + 1)
  mockStore.availability_samples.set(id, {
    _id: id,
    lotId,
    sampledAt: NOW - 30 * MIN,
    freeSpots: 150,
    totalSpots: 200,
    occupancyRate: 75,
    source: 'sampled',
    ...overrides,
  })
}

function freshStore(): Store {
  return {
    lots: new Map(),
    availability_samples: new Map(),
  }
}

beforeEach(() => {
  mockStore = freshStore()
  mockOpenid = 'openid-test-1'
  mockFailAddLotId = null
})

describe('sampleAvailability 采样', () => {
  it('有 reportedAt 的车场 → 落一条 sampled 样本，occupancyRate 正确', async () => {
    seedLot('lot1')

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ sampled: 1, skipped: 0 })

    expect(mockStore.availability_samples.size).toBe(1)
    const s = [...mockStore.availability_samples.values()][0]
    expect(s.lotId).toBe('lot1')
    expect(typeof s.sampledAt).toBe('number')
    expect(s.freeSpots).toBe(150)
    expect(s.totalSpots).toBe(200)
    expect(s.occupancyRate).toBe(75) // 150/200
    expect(s.source).toBe('sampled')
  })

  it('无 availability（没上报过）→ 查询过滤不采样', async () => {
    seedLot('lot1', { availability: null })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ sampled: 0, skipped: 0 })
    expect(mockStore.availability_samples.size).toBe(0)
  })

  it('freeSpots/totalSpots 非数字或缺失 → 跳过（不编数据）', async () => {
    seedLot('lot1', { availability: { totalSpots: 200, reportedAt: NOW, source: 'reported' } }) // freeSpots 缺失
    seedLot('lot2', { availability: { freeSpots: 'abc', totalSpots: 200, reportedAt: NOW, source: 'reported' } }) // 脏值
    seedLot('lot3', { availability: { freeSpots: 50, reportedAt: NOW, source: 'reported' } }) // totalSpots 缺失

    const res = await main()

    expect(res.data).toEqual({ sampled: 0, skipped: 3 })
    expect(mockStore.availability_samples.size).toBe(0)
  })

  it('同一 15 分钟窗口已采过 → 跳过，不叠重复样本', async () => {
    seedLot('lot1')
    seedSample('lot1', { sampledAt: NOW - 1 * MIN }) // 1 分钟前刚采过

    const res = await main()

    expect(res.data).toEqual({ sampled: 0, skipped: 1 })
    expect(mockStore.availability_samples.size).toBe(1) // 不新增
  })

  it('窗口已过（sampledAt 很旧）→ 落新样本', async () => {
    seedLot('lot1')
    seedSample('lot1', { sampledAt: NOW - 2 * 60 * MIN }) // 2 小时前，远超 15 分钟窗口

    const res = await main()

    expect(res.data).toEqual({ sampled: 1, skipped: 0 })
    expect(mockStore.availability_samples.size).toBe(2)
  })

  it('定时触发无 OPENID 不拦截（系统任务），照常采样', async () => {
    seedLot('lot1')
    mockOpenid = null

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ sampled: 1, skipped: 0 })
  })

  it('单条落样本失败不中断整批', async () => {
    seedLot('lot1')
    seedLot('lot2')
    mockFailAddLotId = 'lot1'

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ sampled: 1, skipped: 1 })

    // lot2 正常落样，lot1 失败被跳过
    const samples = [...mockStore.availability_samples.values()]
    expect(samples.length).toBe(1)
    expect(samples[0].lotId).toBe('lot2')
  })
})
