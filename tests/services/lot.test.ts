import { WALK_DETOUR_FACTOR } from '../../miniprogram/config'
import { haversineM } from '../../miniprogram/domain/geo'
import { fetchLotById, fetchLotsAround, fetchSignedLots } from '../../miniprogram/services/lot'

interface QueryCaptured {
  cond: Record<string, unknown>
  limit: number
}

interface ReqOption {
  url: string
  success: (res: { data: unknown }) => void
  fail: (err: { errMsg: string }) => void
}

let docs: Record<string, unknown>[] = []
/** 地点搜索桩下发的 POI 池（未签约候选），fetchLotsAround 用 */
let pois: Array<Record<string, unknown>> = []
const captured: QueryCaptured[] = []
/** 每次矩阵请求带的目的地坐标，如 `['31.753,117.254098']` */
let matrixTos: string[][] = []
/**
 * 矩阵桩下发的真实路线，键为 `lat,lng`。
 * **没登记的坐标一律当作「查不到」**（elements 缺项 → null），
 * 这样「降级为估算值」是一条被刻意走到的分支，而不是因为桩发不出请求才碰巧走到的
 */
let routes: Record<string, { distance: number; duration: number }> = {}

function stubCloud(): void {
  const g = globalThis as unknown as {
    wx: {
      request: (o: ReqOption) => void
      cloud: {
        init: () => void
        callFunction: () => Promise<{ result: unknown }>
        database: () => {
          collection: (name: string) => {
            where: (cond: Record<string, unknown>) => {
              limit: (n: number) => { get: () => Promise<{ data: Record<string, unknown>[] }> }
            }
          }
        }
      }
    }
  }
  g.wx = {
    request: o => {
      const url = decodeURIComponent(o.url)
      // 地点搜索（fetchLotsAround 里拉未签约 POI）：信封是顶层 data 数组
      if (url.includes('/ws/place/v1/search')) {
        o.success({ data: { status: 0, message: 'query ok', count: pois.length, data: pois } })
        return
      }
      const to = url.match(/[?&]to=([^&]*)/)?.[1] ?? ''
      const keys = to.split(';').filter(Boolean)
      matrixTos.push(keys)
      // 腾讯的两个信封不一致：路径矩阵的结果在顶层 result，不在 data
      const elements = keys.map(k => {
        const r = routes[k]
        return r ? { distance: r.distance, duration: r.duration } : undefined
      })
      o.success({ data: { status: 0, message: 'query ok', result: { rows: [{ elements }] } } })
    },
    cloud: {
      init: () => undefined,
      callFunction: () => Promise.resolve({ result: {} }),
      database: () => ({
        collection: (name: string) => {
          if (name !== 'lots') throw new Error(`unexpected collection ${name}`)
          return {
            where: (cond: Record<string, unknown>) => {
              const entry: QueryCaptured = { cond, limit: -1 }
              captured.push(entry)
              return {
                limit: (n: number) => {
                  entry.limit = n
                  return { get: () => Promise.resolve({ data: docs }) }
                },
              }
            },
          }
        },
      }),
    },
  }
}

function doc(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: 'lot1',
    poiId: 'p1',
    name: '测试车场',
    address: '测试地址',
    location: { lat: 31.7527, lng: 117.2541 },
    pricing: { firstHour: 5, perHourAfter: 4, stepMinutes: 60, capPerDay: 40, source: 'public' },
    availability: { freeSpots: null, totalSpots: 300, source: 'ops' },
    reservedCount: 0,
    ratingSummary: null,
    facilities: ['充电桩'],
    contract: { status: 'signed' },
    ...overrides,
  }
}

/** 地点搜索桩的 POI 条目（id/标题/地址/坐标/_distance，与 RawPoi 同形） */
function poi(id: string, lat: number, lng: number, distanceM: number): Record<string, unknown> {
  return { id, title: `未签约${id}`, address: `地址${id}`, location: { lat, lng }, _distance: distanceM }
}

describe('fetchSignedLots', () => {
  const CENTER = { lat: 31.752727, lng: 117.254098 }

  beforeEach(() => {
    docs = []
    pois = []
    captured.length = 0
    matrixTos = []
    routes = {}
    stubCloud()
  })

  it('只查签约车场：查询条件带 contract.status', async () => {
    docs = [doc({})]
    await fetchSignedLots(CENTER)
    expect(captured).toHaveLength(1)
    expect(captured[0].cond).toEqual({ 'contract.status': 'signed' })
    // limit 20 是自保护的帽（签约车场个位数），桩必须把参数记下来才管得住
    expect(captured[0].limit).toBe(20)
  })

  it('返回文档映射出的车场并带上估算距离', async () => {
    docs = [doc({})]
    const lots = await fetchSignedLots(CENTER)
    expect(lots).toHaveLength(1)
    expect(lots[0].id).toBe('lot1')
    // 桩没有登记这家车场的路线，走的是「查不到就保留估算值」的降级分支
    expect(lots[0].distanceSource).toBe('estimated')
    expect(lots[0].distanceM).toBeGreaterThan(0)
    expect(lots[0].walkMinutes).toBeGreaterThan(0)
  })

  it('按距离升序、半径外的丢弃', async () => {
    // 入参故意不按距离排列：升序必须是排出来的，不是碰巧照抄了输入顺序
    docs = [
      doc({ _id: 'far', location: { lat: 31.78, lng: 117.28 } }),
      doc({ _id: 'mid', location: { lat: 31.7545, lng: 117.2545 } }),
      doc({ _id: 'near', location: { lat: 31.753, lng: 117.2545 } }),
    ]
    const lots = await fetchSignedLots(CENTER, 1000)
    expect(lots.map(l => l.id)).toEqual(['near', 'mid'])
  })

  it('演示暂定值（placeholder）照常入库，来源原样带到领域层', async () => {
    // 暂定值要被界面标注成「示例数据，待核实」，所以它必须能过校验、且 source 不被改写；
    // 若哪天有人把它规整成 'ops'，这条会红
    docs = [
      doc({
        pricing: { firstHour: 3, perHourAfter: 2, stepMinutes: 60, capPerDay: 15, source: 'placeholder' },
        availability: { freeSpots: null, totalSpots: 200, source: 'placeholder' },
      }),
    ]
    const lots = await fetchSignedLots(CENTER)
    expect(lots).toHaveLength(1)
    expect(lots[0].pricing?.source).toBe('placeholder')
    expect(lots[0].availability?.source).toBe('placeholder')
    // 签约车场带出 poiId 与 signed 标记，未签约合并去重要靠它们
    expect(lots[0].signed).toBe(true)
  })

  it('perHourAfter 缺省回落到 firstHour', async () => {
    docs = [doc({ pricing: { firstHour: 5, stepMinutes: 60, capPerDay: 40, source: 'ops' } })]
    const lots = await fetchSignedLots(CENTER)
    expect(lots[0].pricing?.perHourAfter).toBe(5)
  })

  it('车场端上报过余位（source=reported）的车场照常可预约', async () => {
    // reportAvailability 把 availability.source 写成 'reported'。曾经不在白名单里，
    // toParkingLot 判 null → 首页过滤掉 + 确认页不可预约。回归钉死：必须放行
    docs = [
      doc({
        availability: { freeSpots: 42, totalSpots: 200, source: 'reported' },
      }),
    ]
    const lots = await fetchSignedLots(CENTER)
    expect(lots).toHaveLength(1)
    expect(lots[0].availability?.source).toBe('reported')
    expect(lots[0].availability?.freeSpots).toBe(42)
    expect(lots[0].signed).toBe(true)
  })

  it('reservedCount 原样透传（可约余位 = freeSpots − reservedCount 的原料）', async () => {
    docs = [doc({ reservedCount: 7 })]
    const lots = await fetchSignedLots(CENTER)
    expect(lots[0].reservedCount).toBe(7)
  })

  it('老文档缺 reservedCount：按 0 透传，不误判坏文档', async () => {
    const d = doc({})
    delete d.reservedCount
    docs = [d]
    const lots = await fetchSignedLots(CENTER)
    expect(lots).toHaveLength(1)
    expect(lots[0].reservedCount).toBe(0)
  })

  it('形状坏的文档整条丢弃，不炸整批', async () => {
    docs = [doc({}), doc({ _id: 'bad', name: 123 }), doc({})]
    const lots = await fetchSignedLots(CENTER)
    expect(lots).toHaveLength(2)
  })

  it('估算距离是直线距离乘绕行系数的四舍五入', async () => {
    docs = [doc({ location: { lat: 31.75121, lng: 117.25325 } })]
    const lots = await fetchSignedLots(CENTER)
    const straight = haversineM(CENTER, { lat: 31.75121, lng: 117.25325 })
    expect(lots[0].distanceM).toBe(Math.round(straight * WALK_DETOUR_FACTOR))
  })

  it('路线覆盖只作用于最近的 Top N，且用接口耗时当步行时长', async () => {
    // 四家的直线距离递增：lotA < lotB < lotC < lotD，Top N=3 只该问前三家
    docs = [
      doc({ _id: 'lotA', location: { lat: 31.753, lng: 117.254098 } }),
      doc({ _id: 'lotB', location: { lat: 31.754, lng: 117.254098 } }),
      doc({ _id: 'lotC', location: { lat: 31.755, lng: 117.254098 } }),
      doc({ _id: 'lotD', location: { lat: 31.756, lng: 117.254098 } }),
    ]
    // 真实路线故意把「直线最近的那家」推到最远：绕街区、绕河道时很常见。
    // 覆盖之后若不再排一次，返回顺序就是 A(1200) B(950) C(1300) D(473)
    routes = {
      '31.753,117.254098': { distance: 1200, duration: 1500 },
      '31.754,117.254098': { distance: 950, duration: 1140 },
      '31.755,117.254098': { distance: 1300, duration: 1560 },
    }

    const lots = await fetchSignedLots(CENTER)

    // 「最近」的判定用的是覆盖前的直线距离，所以 lotD 根本没被问过路线
    expect(matrixTos).toEqual([
      ['31.753,117.254098', '31.754,117.254098', '31.755,117.254098'],
    ])

    const byId = new Map(lots.map(l => [l.id, l]))
    expect(byId.get('lotA')).toMatchObject({
      distanceSource: 'route',
      distanceM: 1200,
      // 接口给了耗时就用接口的：1200 米 ÷ 80 米/分是 15 分钟，这里必须是 25
      walkMinutes: 25,
    })
    expect(byId.get('lotB')).toMatchObject({ distanceSource: 'route', distanceM: 950 })
    expect(byId.get('lotC')).toMatchObject({ distanceSource: 'route', distanceM: 1300 })
    expect(byId.get('lotD')).toMatchObject({ distanceSource: 'estimated' })

    // 覆盖后重排：lotD(473) 比 lotB(950) 近，必须排在它前面
    expect(lots.map(l => l.id)).toEqual(['lotD', 'lotB', 'lotA', 'lotC'])
    expect(lots.map(l => l.distanceM)).toEqual([...lots.map(l => l.distanceM)].sort((a, b) => a - b))
  })

  it('环境未配置时抛出明确错误', async () => {
    const g = globalThis as unknown as { wx?: unknown }
    const saved = g.wx
    g.wx = {}
    await expect(fetchSignedLots(CENTER)).rejects.toThrow('云开发未初始化')
    g.wx = saved
  })
})

describe('fetchLotById', () => {
  beforeEach(() => {
    docs = []
    pois = []
    captured.length = 0
    matrixTos = []
    routes = {}
    stubCloud()
  })

  it('按 _id 查询并映射回签约车场', async () => {
    docs = [doc({})]
    const lot = await fetchLotById('lot1')
    expect(lot).not.toBeNull()
    expect(lot?.id).toBe('lot1')
    expect(lot?.name).toBe('测试车场')
    expect(captured[0].cond).toEqual({ _id: 'lot1' })
  })

  it('查询不到返回 null 而非抛错', async () => {
    docs = []
    await expect(fetchLotById('missing')).resolves.toBeNull()
  })

  it('形状坏的文档返回 null', async () => {
    docs = [doc({ _id: 'bad', name: 123 })]
    await expect(fetchLotById('bad')).resolves.toBeNull()
  })
})

describe('fetchLotsAround', () => {
  const CENTER = { lat: 31.752727, lng: 117.254098 }

  it('签约 + 未签约合并：签约在前，未签约无价格无余位', async () => {
    // 一家签约（p1）+ 一家远处未签约（p3）。p3 距中心 1km、_distance 1200，落在 3km 半径内
    docs = [doc({})]
    pois = [poi('p3', 31.7527, 117.2641, 1200)]

    const lots = await fetchLotsAround(CENTER)

    expect(lots).toHaveLength(2)
    expect(lots[0].signed).toBe(true)
    expect(lots[0].poiId).toBe('p1')
    expect(lots[1].signed).toBe(false)
    expect(lots[1].pricing).toBeNull()
    expect(lots[1].availability).toBeNull()
    expect(lots[1].reservedCount).toBe(0)
    expect(lots[1].distanceM).toBeGreaterThan(0)
  })

  it('按 poiId 去重：同一家 POI 不以未签约身份再出现一次', async () => {
    docs = [doc({})]
    // p1 就是签约那家的 poiId —— 腾讯库里同一条 POI，必须只出现一次（签约版）
    pois = [poi('p1', 31.7527, 117.2541, 100)]

    const lots = await fetchLotsAround(CENTER)

    expect(lots).toHaveLength(1)
    expect(lots[0].signed).toBe(true)
  })

  it('150 米近邻去重：同一片物理车位的相邻 POI 不重复展示', async () => {
    docs = [doc({})]
    // 签约在 (31.7527, 117.2541)；这个 POI 就在它旁边约 40 米，是同一片车位
    pois = [poi('p2', 31.7527, 117.2545, 300)]

    const lots = await fetchLotsAround(CENTER)

    expect(lots).toHaveLength(1)
    expect(lots[0].signed).toBe(true)
  })

  it('未签约按距离升序排在签约之后', async () => {
    docs = [doc({})]
    pois = [poi('far', 31.7527, 117.2741, 2000), poi('near', 31.7527, 117.2591, 500)]

    const lots = await fetchLotsAround(CENTER)

    // 签约 p1 在前，未签约 near 500m 先于 far 2000m
    expect(lots.map(l => l.id)).toEqual(['lot1', 'near', 'far'])
  })
})
