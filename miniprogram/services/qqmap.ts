import { QQMAP_KEY, REQUEST_TIMEOUT_MS } from '../config'
import type { GeoPoint } from '../domain/types'

const BASE = 'https://apis.map.qq.com'
const SEARCH_PATH = '/ws/place/v1/search'
const MATRIX_PATH = '/ws/distance/v1/matrix'

/** 步行速度约 80 米/分钟（约 4.8 km/h），与 lot.ts 的降级估算同口径 */
const WALK_METERS_PER_MINUTE = 80

/**
 * 腾讯各接口的信封**不一致**：地点搜索把结果放在顶层 `data`，路径矩阵放在顶层 `result`。
 * 只认 `data` 的话矩阵接口永远拿到 undefined，表现为步行距离静默全走降级分支。
 */
interface QQMapEnvelope<T> {
  status: number
  message: string
  data?: T
  result?: T
}

type FailureKind = 'network' | 'business'

export class QQMapError extends Error {
  constructor(
    public code: number,
    message: string,
    /** network 才会重试：业务错误（Key 错、参数错）重试只是白烧配额 */
    public kind: FailureKind = 'business',
  ) {
    super(message)
    this.name = 'QQMapError'
  }
}

function payloadOf<T>(body: QQMapEnvelope<T>): T | undefined {
  return body.data !== undefined ? body.data : body.result
}

/**
 * 带超时与一次重试的 GET。失败抛 QQMapError。
 *
 * status 为 0 却没有载荷时同样按错误处理：形状变了要说出来，
 * 不能悄悄降级成「附近没有车场」—— 那是在拿假结论糊弄用户
 */
function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const query = Object.keys(params)
    .map(k => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join('&')
  const url = `${BASE}${path}?${query}&key=${QQMAP_KEY}`

  const attempt = (): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      wx.request({
        url,
        timeout: REQUEST_TIMEOUT_MS,
        success: res => {
          const body = res.data as QQMapEnvelope<T>
          const payload = body ? payloadOf(body) : undefined
          if (body && body.status === 0 && payload !== undefined) {
            resolve(payload)
          } else {
            reject(new QQMapError(body?.status ?? -1, body?.message ?? 'unknown'))
          }
        },
        fail: err => reject(new QQMapError(-2, err.errMsg || 'request failed', 'network')),
      })
    })

  return attempt().catch((err: unknown) => {
    if (err instanceof QQMapError && err.kind === 'network') return attempt()
    throw err
  })
}

export interface PoiItem {
  id: string
  title: string
  address: string
  location: GeoPoint
  /** 与检索中心的直线距离（米）。接口未返回时为 0 */
  distanceM: number
}

interface RawPoi {
  id: string
  title: string
  address: string
  location: { lat: number; lng: number }
  /** 仅在 boundary 为 nearby 且按距离排序时返回 */
  _distance?: number
}

function toPoi(item: RawPoi): PoiItem {
  return {
    id: item.id,
    title: item.title,
    address: item.address,
    location: { lat: item.location.lat, lng: item.location.lng },
    distanceM: item._distance ?? 0,
  }
}

/**
 * 关键词周边检索，返回半径内按距离升序的 POI。
 *
 * 半径是**本地过滤**的：实测接口的 `nearby(...,r)` 半径不生效 ——
 * r 取 300 / 1000 / 3000 并配上 auto_extend=0/1，返回的都是同一批「最近 20 条」。
 * 想靠接口自己限半径，首页会把 3 公里外的车场也列进来。排序同理：
 * 按 `_distance` 排一次不贵，且不依赖服务端的排序口径
 */
export async function searchNearby(keyword: string, center: GeoPoint, radiusM: number): Promise<PoiItem[]> {
  const raw = await get<RawPoi[]>(SEARCH_PATH, {
    keyword,
    boundary: `nearby(${center.lat},${center.lng},${radiusM})`,
    // 按距离排序请求，让接口把最近的排在前面（_distance 也随之下发）
    orderby: '_distance',
    page_size: 20,
    page_index: 1,
  })
  return (raw ?? [])
    .map(toPoi)
    .filter(poi => poi.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
}

/** 关键词城市级检索，用于搜索页输入目的地/车场名 */
export async function searchByKeyword(keyword: string, region: string): Promise<PoiItem[]> {
  const raw = await get<RawPoi[]>(SEARCH_PATH, {
    keyword,
    boundary: `region(${region},0)`,
    page_size: 20,
    page_index: 1,
  })
  return (raw ?? []).map(toPoi)
}

interface MatrixRaw {
  rows?: Array<{ elements?: Array<{ distance: number; duration: number }> }>
}

/** 步行距离与时长。失败返回 null，调用方降级为直线距离 */
export async function walkingDistance(
  from: GeoPoint,
  to: GeoPoint,
): Promise<{ distanceM: number; durationMin: number } | null> {
  try {
    const raw = await get<MatrixRaw>(MATRIX_PATH, {
      mode: 'walking',
      from: `${from.lat},${from.lng}`,
      to: `${to.lat},${to.lng}`,
    })
    const el = raw?.rows?.[0]?.elements?.[0]
    if (!el) return null
    return {
      distanceM: el.distance,
      // 优先用接口耗时：它是**路线**距离对应的步行时间，比拿直线距离硬除要准得多
      //（实测 1747 米直线约 1.1 公里，路线 1747 米 / 1588 秒）。
      // 文档说步行方式不计算耗时，实测该接口给了真实值 —— 万一某个配额档位或
      // 版本真的返回 0，再按步行速度从距离兜底，不能让用户看到「步行 0 分钟」
      durationMin: el.duration > 0
        ? Math.max(1, Math.round(el.duration / 60))
        : Math.max(1, Math.round(el.distance / WALK_METERS_PER_MINUTE)),
    }
  } catch {
    return null
  }
}
