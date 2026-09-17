import {
  DEFAULT_RADIUS_M,
  NEARBY_DEDUP_M,
  WALK_DETOUR_FACTOR,
  WALK_LOOKUP_TOP_N,
  WALK_METERS_PER_MINUTE,
} from '../config'
import { haversineM } from '../domain/geo'
import type { GeoPoint, ParkingLot } from '../domain/types'
import { getCloudApi } from './cloud'
import { searchNearby, walkingDistances } from './qqmap'
import type { PoiItem } from './qqmap'

/**
 * lots 集合文档 → ParkingLot。
 *
 * **逐条校验、坏一条丢一条**，与 format/cache 各处对存储污染的口径一致：
 * 手工在控制台改文档是常态，一条脏数据不该让整个面板白屏。
 * 字段缺失返回 null，调用方过滤 —— 宁可少显示一家，不显示半个「--」怪胎
 */
function toParkingLot(id: string, doc: Record<string, unknown>): ParkingLot | null {
  const loc = doc.location as { lat?: unknown; lng?: unknown } | undefined
  const pricing = doc.pricing as Record<string, unknown> | undefined
  const availability = doc.availability as Record<string, unknown> | undefined
  const summary = doc.ratingSummary as Record<string, unknown> | null | undefined
  if (typeof doc.name !== 'string' || typeof doc.address !== 'string') return null
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null
  if (!pricing || typeof pricing.firstHour !== 'number') return null
  if (!availability || typeof availability.totalSpots !== 'number') return null
  const freeSpots = availability.freeSpots
  if (freeSpots !== null && typeof freeSpots !== 'number') return null
  const pricingSource = pricing.source
  if (
    pricingSource !== 'public' &&
    pricingSource !== 'ops' &&
    pricingSource !== 'estimated' &&
    pricingSource !== 'placeholder'
  ) {
    return null
  }
  const spotsSource = availability.source
  // 'reported' = 车场端上报的实时余位（reportAvailability 写入），是真实数据必须放行；
  // 漏掉它会导致上报过余位的车场被前端判成坏文档 → 首页过滤 + 确认页不可预约
  if (
    spotsSource !== 'public' &&
    spotsSource !== 'ops' &&
    spotsSource !== 'placeholder' &&
    spotsSource !== 'reported'
  ) {
    return null
  }

  return {
    id,
    poiId: typeof doc.poiId === 'string' ? doc.poiId : '',
    signed: true,
    name: doc.name,
    address: doc.address,
    location: { lat: loc.lat, lng: loc.lng },
    // 距离先按 0 占位，distanceM 在 fetchSignedLots 里统一计算
    distanceM: 0,
    walkMinutes: 0,
    distanceSource: 'estimated',
    pricing: {
      firstHour: pricing.firstHour,
      perHourAfter: typeof pricing.perHourAfter === 'number' ? pricing.perHourAfter : pricing.firstHour,
      stepMinutes: pricing.stepMinutes === 15 || pricing.stepMinutes === 30 ? pricing.stepMinutes : 60,
      capPerDay: typeof pricing.capPerDay === 'number' ? pricing.capPerDay : 0,
      nightRate: typeof pricing.nightRate === 'number' ? pricing.nightRate : undefined,
      source: pricingSource,
    },
    availability: {
      freeSpots,
      totalSpots: availability.totalSpots,
      source: spotsSource,
    },
    ratingSummary:
      summary && typeof summary.score === 'number' && typeof summary.count === 'number'
        ? { score: summary.score, count: summary.count }
        : null,
    facilities: Array.isArray(doc.facilities)
      ? (doc.facilities as unknown[]).filter((f): f is string => typeof f === 'string')
      : [],
  }
}

function withDistance(lot: ParkingLot, center: GeoPoint): ParkingLot {
  // 直线 × 绕行系数，与退役前 POI 兜底同口径；Top N 车场随后被真实路线覆盖
  const straight = haversineM(center, lot.location)
  const estimatedM = Math.max(0, Math.round(straight * WALK_DETOUR_FACTOR))
  return {
    ...lot,
    distanceM: estimatedM,
    walkMinutes: Math.max(1, Math.round(estimatedM / WALK_METERS_PER_MINUTE)),
    distanceSource: 'estimated',
  }
}

/**
 * 拉取周边**签约**车场（数据模型 §4：库里只存已签约、可预约的车场）。
 *
 * 普通查询全量拉（签约车场个位数，limit 20 是自保护的帽），本地算直线距离、
 * 按半径过滤、距离升序；**距离最近的 Top N 再查真实步行路线覆盖**
 * （路径矩阵按目的地计费的约束没有变）。查不到路线保留估算值并如实标注。
 *
 * 库里没有签约车场时返回空数组，由面板的空态文案负责解释 —— 「附近还没有
 * 签约车场」是正常业务状态，不该表现成错误。**环境未配置则不在此列**：那是
 * 配置错误，抛明确错误让调用方进错误态，不伪装成空态把问题藏起来
 */
export async function fetchSignedLots(
  center: GeoPoint,
  radiusM: number = DEFAULT_RADIUS_M,
): Promise<ParkingLot[]> {
  const db = getCloudApi()?.database()
  if (!db) throw new Error('云开发未初始化：请检查 config.local.ts 的 CLOUD_ENV')

  const res = await db.collection('lots').where({ 'contract.status': 'signed' }).limit(20).get()
  const byDistance = (a: ParkingLot, b: ParkingLot) => a.distanceM - b.distanceM
  const lots = res.data
    .map(doc => toParkingLot(String(doc._id ?? ''), doc))
    .filter((l): l is ParkingLot => l !== null)
    .filter(l => haversineM(center, l.location) <= radiusM)
    .map(l => withDistance(l, center))
    .sort(byDistance)

  // Top N 的选取必须基于**覆盖前**的估算距离：「离我最近」由直线距离判定，
  // 而不是等查完路线才知道谁近（那时已经花掉配额了）
  const top = lots.slice(0, WALK_LOOKUP_TOP_N)
  if (top.length === 0) return lots
  const walked = await walkingDistances(center, top.map(l => l.location))
  walked.forEach((w, i) => {
    const lot = top[i]
    // 查不到就保留估算值，不把 null 写进去（与退役前同一口径）
    if (!lot || !w) return
    lot.distanceM = w.distanceM
    lot.walkMinutes = w.durationMin
    lot.distanceSource = 'route'
  })
  // 真实路线可能比估算更长也可能更短（绕街区、绕河道），覆盖后必须重排一次 ——
  // 否则「按距离升序」只是覆盖前的性质，调用方按返回顺序取最近那条会取错
  lots.sort(byDistance)
  return lots
}

/**
 * 按 id 拉单个**签约**车场（预约确认页用）。
 *
 * 复用 toParkingLot 的逐条校验：文档形状坏了返回 null，确认页据此给「车场不可用」提示。
 * 走 where(_id) + limit(1) 而非 doc().get()：doc().get() 对不存在文档会 reject，
 * where 对空结果静默返回空数组，调用方统一按 null 处理，省一层 try/catch。
 * 距离字段对单场无意义，置 0 占位（确认页不展示距离）
 */
export async function fetchLotById(id: string): Promise<ParkingLot | null> {
  const db = getCloudApi()?.database()
  if (!db) throw new Error('云开发未初始化：请检查 config.local.ts 的 CLOUD_ENV')

  const res = await db.collection('lots').where({ _id: id }).limit(1).get()
  const doc = res.data[0]
  if (!doc) return null
  return toParkingLot(String(doc._id ?? ''), doc)
}

/** POI 检索结果 → 未签约车场。只有名称/位置/距离是真实数据，价格/余位/额度如实置 null */
function poiToUnsignedLot(poi: PoiItem): ParkingLot {
  return {
    id: poi.id,
    poiId: poi.id,
    signed: false,
    name: poi.title,
    address: poi.address,
    location: poi.location,
    distanceM: 0,
    walkMinutes: 0,
    distanceSource: 'estimated',
    pricing: null,
    availability: null,
    ratingSummary: null,
    facilities: [],
  }
}

/**
 * 拉「周边所有展示车场」：签约库（可预约）+ 周边 POI 停车场（未签约，仅导航）。
 *
 * 合并去重口径（2026-09-15）：
 * - **poiId 精确去重**：签约车场的 poiId 与 POI 的 id 同源（都是腾讯 POI id），
 *   同名同址的签约车场不会再以未签约身份出现一次
 * - **150 米近邻去重**：同一片物理车位在腾讯库里常有两条相邻 POI（如改名前后的
 *   两个校名入口），靠坐标兜一层。150 米是「同一栋建筑」的经验值，宁漏不误杀
 *
 * 未签约车场不做步行路线覆盖（省路径矩阵配额），距离保持估算并如实标注；
 * 顺序上签约在前 —— 展示/排序由页面按「签约固定在前」处理，这里只合并
 */
export async function fetchLotsAround(
  center: GeoPoint,
  radiusM: number = DEFAULT_RADIUS_M,
): Promise<ParkingLot[]> {
  const signed = await fetchSignedLots(center, radiusM)
  const pois = await searchNearby('停车场', center, radiusM)

  const unsigned = pois
    .filter(
      p =>
        !signed.some(
          s => s.poiId === p.id || haversineM(s.location, p.location) < NEARBY_DEDUP_M,
        ),
    )
    .map(p => withDistance(poiToUnsignedLot(p), center))

  return [...signed, ...unsigned]
}
