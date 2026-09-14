import { SEARCH_CACHE_TTL_MS, WALK_DETOUR_FACTOR } from '../../miniprogram/config'
import { fetchNearbyLots } from '../../miniprogram/services/lot'
import type { PoiItem } from '../../miniprogram/services/qqmap'

interface ReqOption {
  url: string
  success: (res: { data: unknown }) => void
  fail: (err: { errMsg: string }) => void
}

let searchCalls = 0
let matrixCalls = 0
/** 每次矩阵请求带的目的地个数 */
let matrixPoints: number[] = []
let storage: Record<string, unknown> = {}

function rawPoi(id: string, title: string, distanceM: number): Record<string, unknown> {
  return { id, title, address: `${title}的地址`, location: { lat: 36.6, lng: 117.1 }, _distance: distanceM }
}

function searchBody(items: Array<Record<string, unknown>>): unknown {
  return { status: 0, message: 'query ok', count: items.length, data: items }
}

function matrixBody(points: number): unknown {
  return {
    status: 0,
    message: 'query ok',
    result: {
      rows: [{ elements: Array.from({ length: points }, (_, i) => ({ distance: 400 + i * 10, duration: 300 + i * 60 })) }],
    },
  }
}

interface StubOptions {
  /** 搜索返回的 POI；默认 5 个，方便观察「只有 Top3 查矩阵」 */
  items?: Array<Record<string, unknown>>
  /** 矩阵请求一律失败 */
  matrixFails?: boolean
}

function installWx(opts: StubOptions = {}): void {
  searchCalls = 0
  matrixCalls = 0
  matrixPoints = []
  const items = opts.items ?? [1, 2, 3, 4, 5].map(i => rawPoi(`p${i}`, `第${i}停车场`, 300 + i * 50))

  const g = globalThis as unknown as {
    wx: {
      request: (o: ReqOption) => void
      getStorageSync: (k: string) => unknown
      setStorageSync: (k: string, v: unknown) => void
    }
  }
  g.wx = {
    request: o => {
      if (o.url.indexOf('/ws/place/v1/search') >= 0) {
        searchCalls++
        o.success({ data: searchBody(items) })
        return
      }
      matrixCalls++
      const to = decodeURIComponent(o.url).match(/to=([^&]*)/)?.[1] ?? ''
      const n = to.split(';').filter(Boolean).length
      matrixPoints.push(n)
      if (opts.matrixFails) o.fail({ errMsg: 'request:fail timeout' })
      else o.success({ data: matrixBody(n) })
    },
    getStorageSync: k => storage[k],
    setStorageSync: (k, v) => {
      storage[k] = v
    },
  }
}

const CENTER = { lat: 36.65, lng: 117.12 }

beforeEach(() => {
  storage = {}
  jest.useRealTimers()
})

describe('fetchNearbyLots · 估算字段', () => {
  it('估算出来的字段一律标 estimated，不冒充真实数据', async () => {
    installWx({ matrixFails: true })

    const { lots } = await fetchNearbyLots(CENTER)

    expect(lots.length).toBe(5)
    for (const lot of lots) {
      expect(lot.pricing.source).toBe('estimated')
      expect(lot.availability.source).toBe('estimated')
      expect(lot.distanceSource).toBe('estimated')
    }
  })

  it('估算值落在各自声明区间内，不产出不可能的车场', async () => {
    installWx({ matrixFails: true })

    const { lots } = await fetchNearbyLots(CENTER)

    for (const lot of lots) {
      expect(lot.availability.freeSpots).toBeGreaterThanOrEqual(0)
      expect(lot.availability.freeSpots).toBeLessThanOrEqual(lot.availability.totalSpots)
      expect(lot.rating).toBeGreaterThanOrEqual(4.0)
      expect(lot.rating).toBeLessThan(4.9)
      expect(lot.reservableQuota).toBeGreaterThanOrEqual(40)
      expect(lot.reservableQuota).toBeLessThanOrEqual(160)
      expect(lot.pricing.stepMinutes).toBe(15)
      expect(lot.pricing.perHourAfter).toBeGreaterThanOrEqual(1)
      expect(lot.walkMinutes).toBeGreaterThanOrEqual(1)
    }
  })

  it('同一 POI 的估算值稳定，刷新列表不会数字乱跳', async () => {
    installWx({ matrixFails: true })
    const first = (await fetchNearbyLots(CENTER)).lots

    storage = {}
    installWx({ matrixFails: true })
    const second = (await fetchNearbyLots(CENTER)).lots

    expect(second.map(l => [l.id, l.rating, l.reservableQuota, l.availability.freeSpots])).toEqual(
      first.map(l => [l.id, l.rating, l.reservableQuota, l.availability.freeSpots]),
    )
  })

  it('名称里的业态会影响估算（医院床位多、封顶低）', async () => {
    installWx({
      items: [rawPoi('h1', '市立医院地下停车场', 400), rawPoi('m1', '某某停车场', 400)],
      matrixFails: true,
    })

    const { lots } = await fetchNearbyLots(CENTER)
    const hospital = lots.find(l => l.id === 'h1')
    const plain = lots.find(l => l.id === 'm1')

    expect(hospital?.availability.totalSpots).toBe(800)
    expect(hospital?.pricing.capPerDay).toBe(30)
    expect(plain?.pricing.capPerDay).toBe(40)
  })
})

describe('fetchNearbyLots · 步行路线只查 Top N', () => {
  it('只发一次矩阵请求，且只带 3 个目的地', async () => {
    // 矩阵按目的地计费、实测约 5 点/秒：给 5 个车场逐个并发查询会吃限流，
    // 结果是配额花得更多、真实数据拿得更少
    installWx()

    await fetchNearbyLots(CENTER)

    expect(matrixCalls).toBe(1)
    expect(matrixPoints).toEqual([3])
  })

  it('Top3 拿真实路线，其余保持估算', async () => {
    installWx()

    const { lots } = await fetchNearbyLots(CENTER)
    const route = lots.filter(l => l.distanceSource === 'route')

    expect(route.length).toBe(3)
    // 矩阵 stub 给的第一个目的地是 400 米 / 300 秒 → 5 分钟
    expect(route.every(l => l.walkMinutes >= 1)).toBe(true)
    expect(lots.filter(l => l.distanceSource === 'estimated').length).toBe(2)
  })

  it('未查路线的车场按绕行系数折算，系数不是装饰', async () => {
    installWx()

    const { lots } = await fetchNearbyLots(CENTER)
    const estimated = lots.filter(l => l.distanceSource === 'estimated')
    // POI 直线 550 米（第 5 个）→ 估算应为 round(550 × 1.3)
    const far = estimated.find(l => l.id === 'p5')

    expect(far?.distanceM).toBe(Math.round(550 * WALK_DETOUR_FACTOR))
  })

  it('矩阵失败时全部退回估算，且不抛异常', async () => {
    installWx({ matrixFails: true })

    const { lots, hasEstimatedDistance } = await fetchNearbyLots(CENTER)

    expect(lots.every(l => l.distanceSource === 'estimated')).toBe(true)
    expect(hasEstimatedDistance).toBe(true)
  })

  it('车场不足 Top N 个时不多问几个目的地', async () => {
    installWx({ items: [rawPoi('only', '唯一停车场', 400)] })

    await fetchNearbyLots(CENTER)

    expect(matrixPoints).toEqual([1])
  })
})

describe('fetchNearbyLots · 搜索缓存', () => {
  it('同参数再次调用不再打搜索接口', async () => {
    // 地点搜索额度约 200 次/天，每次刷新都重查的话开发期几天就打光
    installWx()
    await fetchNearbyLots(CENTER)
    const afterFirst = searchCalls

    installWx()
    const { lots } = await fetchNearbyLots(CENTER)

    expect(afterFirst).toBe(1)
    expect(searchCalls).toBe(0)
    expect(lots.length).toBe(5)
  })

  it('超过 TTL 后重新搜索', async () => {
    installWx()
    const t0 = new Date('2026-09-12T10:00:00Z').getTime()
    await fetchNearbyLots(CENTER, undefined, undefined, t0)

    installWx()
    await fetchNearbyLots(CENTER, undefined, undefined, t0 + SEARCH_CACHE_TTL_MS + 1)

    expect(searchCalls).toBe(1)
  })

  it('位置变远（超出坐标取整精度）时不命中缓存', async () => {
    installWx()
    const t0 = new Date('2026-09-12T10:00:00Z').getTime()
    await fetchNearbyLots(CENTER, undefined, undefined, t0)

    installWx()
    await fetchNearbyLots({ lat: 36.7, lng: 117.2 }, undefined, undefined, t0)

    expect(searchCalls).toBe(1)
  })

  it('缓存形状不对时忽略它并重新搜索，不把脏数据喂进列表', async () => {
    storage['qnt.poiCache'] = { key: 'someone-else', at: Date.now(), pois: [{ id: 'x' }] }
    installWx()

    const { lots } = await fetchNearbyLots(CENTER)

    expect(searchCalls).toBe(1)
    expect(lots.length).toBe(5)
  })

  it('缓存时钟被回拨过（age 为负）时按失效处理', async () => {
    installWx()
    const t0 = new Date('2026-09-12T10:00:00Z').getTime()
    await fetchNearbyLots(CENTER, undefined, undefined, t0)

    installWx()
    await fetchNearbyLots(CENTER, undefined, undefined, t0 - 60_000)

    expect(searchCalls).toBe(1)
  })
})
