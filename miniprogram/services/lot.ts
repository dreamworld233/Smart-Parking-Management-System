import {
  DEFAULT_RADIUS_M,
  SEARCH_CACHE_TTL_MS,
  WALK_DETOUR_FACTOR,
  WALK_LOOKUP_TOP_N,
  WALK_METERS_PER_MINUTE,
} from '../config'
import { topRecommendations } from '../domain/scoring'
import type { GeoPoint, ParkingLot } from '../domain/types'
import { searchNearby, walkingDistances, type PoiItem } from './qqmap'

const CACHE_KEY = 'qnt.poiCache'

/**
 * 由 POI id 稳定派生估算字段。
 *
 * 用 id 做种子而不是随机数：同一车场每次进 App 看到的估算值必须一致，
 * 否则列表一刷新数字就跳，既不像真实数据，也没法在演示时对同一车场讲第二遍
 */
function seedOf(poiId: string): number {
  let h = 2166136261
  for (let i = 0; i < poiId.length; i++) {
    h ^= poiId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function pick(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1))
}

/** 名称里能看出业态的，按业态给一套更像样的估算值 */
const NAME_HINTS: Array<{ match: string; firstHour: number; totalSpots: number }> = [
  { match: '医院', firstHour: 4, totalSpots: 800 },
  { match: '商城', firstHour: 5, totalSpots: 300 },
  { match: '广场', firstHour: 5, totalSpots: 420 },
  { match: '万象', firstHour: 6, totalSpots: 500 },
]

const DEFAULT_HINT = { firstHour: 5, totalSpots: 260 }

function pricingHint(title: string): { firstHour: number; totalSpots: number } {
  return NAME_HINTS.find(h => title.indexOf(h.match) >= 0) ?? DEFAULT_HINT
}

function walkMinutesFor(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / WALK_METERS_PER_MINUTE))
}

/**
 * POI → ParkingLot。POI 只有名称、地址、坐标、直线距离，
 * 其余（车位、收费、评分、可预约额度）都是本地估算，**一律标 'estimated'**，
 * 页面上要如实标注来源 —— 拿估算值冒充真实数据是课程红线
 */
function toParkingLot(poi: PoiItem): ParkingLot {
  const seed = seedOf(poi.id)
  const hint = pricingHint(poi.title)
  const isHospital = poi.title.indexOf('医院') >= 0
  // 空闲率 3%–57%：下限留几个空位，上限不封满，免得整片列表都是「空位充足」
  const estimatedFreeRate = 0.03 + (seed % 55) / 100
  const freeSpots = Math.max(0, Math.round(hint.totalSpots * estimatedFreeRate))
  // 直线距离先按绕行系数折算，等拿到真实路线再覆盖（只覆盖得起少数几个）
  const estimatedM = Math.max(0, Math.round(poi.distanceM * WALK_DETOUR_FACTOR))

  return {
    id: poi.id,
    name: poi.title,
    address: poi.address,
    location: poi.location,
    distanceM: estimatedM,
    walkMinutes: walkMinutesFor(estimatedM),
    distanceSource: 'estimated',
    pricing: {
      firstHour: hint.firstHour,
      perHourAfter: Math.max(1, hint.firstHour - 1),
      stepMinutes: 15,
      capPerDay: isHospital ? 30 : 40,
      nightRate: 3,
      source: 'estimated',
    },
    availability: {
      freeSpots,
      totalSpots: hint.totalSpots,
      source: 'estimated',
    },
    reservableQuota: pick(seed, 40, 160),
    rating: 4.0 + (seed % 9) / 10,
    tags: seed % 3 === 0 ? ['充电桩'] : [],
  }
}

interface CacheEntry {
  key: string
  at: number
  pois: PoiItem[]
}

function cacheKeyOf(keyword: string, center: GeoPoint, radiusM: number): string {
  // 坐标保留 3 位小数（约 100 米）：GPS 微动不该让整次搜索重来。
  // 地点搜索的每日额度很小，缓存是配额保护而不是性能优化
  return `${keyword}|${center.lat.toFixed(3)},${center.lng.toFixed(3)}|${radiusM}`
}

/**
 * 读缓存。存储可能被旧版本或手工改动污染，形状不对就当没缓存 ——
 * 宁可多花一次配额，也不能把脏数据喂进列表
 */
function readCache(key: string, nowMs: number): PoiItem[] | null {
  const raw: unknown = wx.getStorageSync(CACHE_KEY)
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Partial<CacheEntry>
  if (entry.key !== key || typeof entry.at !== 'number' || !Array.isArray(entry.pois)) return null
  const age = nowMs - entry.at
  // age 为负说明时钟被回拨过，同样按失效处理
  if (!Number.isFinite(age) || age < 0 || age > SEARCH_CACHE_TTL_MS) return null
  return entry.pois as PoiItem[]
}

function writeCache(key: string, pois: PoiItem[], nowMs: number): void {
  wx.setStorageSync(CACHE_KEY, { key, at: nowMs, pois } satisfies CacheEntry)
}

/** 带缓存的周边检索。缓存只认「同关键词 + 同位置 + 同半径」 */
async function searchNearbyCached(
  keyword: string,
  center: GeoPoint,
  radiusM: number,
  nowMs: number,
): Promise<PoiItem[]> {
  const key = cacheKeyOf(keyword, center, radiusM)
  const cached = readCache(key, nowMs)
  if (cached) return cached

  const pois = await searchNearby(keyword, center, radiusM)
  writeCache(key, pois, nowMs)
  return pois
}

export interface NearbyResult {
  lots: ParkingLot[]
  /** 是否有车场用的是估算距离（页面据此决定要不要整体提示「距离为估算」） */
  hasEstimatedDistance: boolean
}

/**
 * 取周边车场：真实 POI 打底，估算字段补齐，再给**推荐靠前的少数几个**
 * 查真实步行路线。
 *
 * 只查 Top N 不是偷懒：路径矩阵按目的地计费，实测每秒约 5 点、单次最多 5 点。
 * 20 个车场逐个并发查询会有大半吃限流（status 120）而静默退回估算，
 * 结果是「花的配额更多、拿到的真实数据更少」。其余车场标 estimated 由页面如实展示。
 */
export async function fetchNearbyLots(
  center: GeoPoint,
  radiusM: number = DEFAULT_RADIUS_M,
  keyword = '停车场',
  nowMs: number = Date.now(),
): Promise<NearbyResult> {
  const pois = await searchNearbyCached(keyword, center, radiusM, nowMs)
  const lots = pois.map(toParkingLot)

  const topIds = topRecommendations(lots, { userNeedsCharging: false }, WALK_LOOKUP_TOP_N).map(
    r => r.lot.id,
  )
  const topLots = lots.filter(l => topIds.indexOf(l.id) >= 0)

  const walked = await walkingDistances(center, topLots.map(l => l.location))
  walked.forEach((w, i) => {
    const lot = topLots[i]
    // 查不到就保留估算值，不把 null 写进去
    if (!lot || !w) return
    lot.distanceM = w.distanceM
    lot.walkMinutes = w.durationMin
    lot.distanceSource = 'route'
  })

  return {
    lots,
    hasEstimatedDistance: lots.some(l => l.distanceSource === 'estimated'),
  }
}
