import { QQMAP_KEY, REQUEST_TIMEOUT_MS, SEARCH_CACHE_TTL_MS, WALK_METERS_PER_MINUTE } from '../config'
import type { GeoPoint } from '../domain/types'

const BASE = 'https://apis.map.qq.com'
const SEARCH_PATH = '/ws/place/v1/search'
const SUGGEST_PATH = '/ws/place/v1/suggestion'
const MATRIX_PATH = '/ws/distance/v1/matrix'

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
  /**
   * 与检索中心的直线距离。`nearby` 边界下即会下发，**与 orderby 无关**
   * （2026-09-13 实测；早前「必须传 orderby=_distance」的说法不成立 ——
   * 传它只是为了排序，别为了拿到这个字段给 `searchDestination` 加回去，
   * 那会让相关度排序变成距离优先）
   */
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
 * suggestion 联想接口的返回条目。与 search 的 POI 形状基本一致，但 `id` 不保证下发
 * （探针见过只有 title/address/location 的条目），单独映射而不复用 `toPoi`，
 * 免得把 undefined id 写进类型契约
 */
interface RawSuggestion {
  id?: string
  title: string
  address: string
  location: { lat: number; lng: number }
  _distance?: number
}

function toSuggestion(item: RawSuggestion): PoiItem {
  return {
    id: item.id ?? '',
    title: item.title,
    address: item.address,
    location: { lat: item.location.lat, lng: item.location.lng },
    distanceM: item._distance ?? 0,
  }
}

/**
 * 关键词语料联想（`/ws/place/v1/suggestion`）。
 *
 * 页面用它做目的地检索（用户 2026-09-15 拍板）：
 * - **`region` 是硬限定，不是偏好**（2026-09-15 实测）：`南大&region=合肥&region_fix=1`
 *   只出合肥内的南大街/南大郢；不传 region 则全国联想、直接出南京大学。项目以合肥为
 *   中心，跨城检索有意关掉，所以固定 `region_fix=1`
 * - **返回值不带距离**：候选只有 title/address/location，页面不排序、按接口顺序展示，
 *   用户点选哪条就用哪条的坐标
 * - 联想接口的配额与 place search **分开计**（用户确认），所以输入时每敲一组字打一次
 *   也打得起 —— 页面仍要防抖，别把键盘当机关枪
 *
 * 为什么换掉 `searchDestination`：nearby 检索对目的地是否返回结果**取决于腾讯侧的关键词
 * 索引，页面无法预测**（同城同距同类的南京理工出 20 条、南京大学出 0 条，2026-09-15 实测）。
 * 联想接口让用户显式点选，把「接口猜不中」变成「用户自己选」，模糊输入也不再丢
 */
export async function suggestPlaces(keyword: string, region: string): Promise<PoiItem[]> {
  const raw = await get<RawSuggestion[]>(SUGGEST_PATH, {
    keyword,
    region,
    region_fix: 1,
    page_size: 10,
  })
  return (raw ?? []).map(toSuggestion)
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
  const cacheKey = `qqmap.nearby.${keyword}.${center.lat.toFixed(3)}.${center.lng.toFixed(3)}.${radiusM}`
  // 缓存是纯优化，不许它影响正确性：存储不可用（测试环境、隐私模式）时跳过即可
  try {
    const cached = wx.getStorageSync(cacheKey) as { t?: number; data?: PoiItem[] } | ''
    if (cached && typeof cached.t === 'number' && Date.now() - cached.t < SEARCH_CACHE_TTL_MS) {
      return cached.data ?? []
    }
  } catch {
    // 忽略：拿不到缓存就直查
  }
  const raw = await get<RawPoi[]>(SEARCH_PATH, {
    keyword,
    boundary: `nearby(${center.lat},${center.lng},${radiusM})`,
    // 按距离排序请求，让接口把最近的排在前面（这里只是为了顺序 ——
    // _distance 在 nearby 边界下不传 orderby 也照样下发）
    orderby: '_distance',
    page_size: 20,
    page_index: 1,
  })
  const result = (raw ?? [])
    .map(toPoi)
    .filter(poi => poi.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
  try {
    wx.setStorageSync(cacheKey, { t: Date.now(), data: result })
  } catch {
    // 同上：缓存写不进就不写
  }
  return result
}

/**
 * 关键词城市级检索。
 *
 * ⚠️ **页面不要用它**：它的 `region` 一旦与关键词的真实所在城市不符，接口会
 * 跨城模糊兜底 —— 实测 `keyword=合肥大学&boundary=region(济南,0)` 返回的是
 * **山东大学、济南大学**，页面会一本正经地列出一批错误的车场，且没有任何
 * 迹象表明搜错了。目的地检索请用 `searchDestination`。留在这里是因为知道
 * 城市、也接受同名地点混入时它仍有意义（live 测试拿它当接口探针）
 */
export async function searchByKeyword(keyword: string, region: string): Promise<PoiItem[]> {
  const raw = await get<RawPoi[]>(SEARCH_PATH, {
    keyword,
    boundary: `region(${region},0)`,
    page_size: 20,
    page_index: 1,
  })
  return (raw ?? []).map(toPoi)
}

/**
 * 目的地检索：把关键词当**地点名**搜，返回按相关度排序的候选，供搜索页取首个
 * 匹配当下车点。
 *
 * 三点与 `searchNearby` 不同，都是 2026-09-13 实测逼出来的：
 * - **不传 `orderby`**：默认是相关度排序。传 `_distance` 会变成距离优先 ——
 *   实测搜「万象城」的头条成了 4.6 公里外的「XX民宿(万象城店)」，真正要去的
 *   合肥万象城反而排在第 3 位之后
 * - **不按半径过滤**：接口的半径是摆设（实测 r=50000 照样返回 545 公里外的
 *   结果），而这正是目的地检索想要的 —— 用户在外地也能搜到老家的目的地，
 *   本地过滤等于把跨城检索全砍了
 * - **`center` 只影响排序**，不构成范围限制：同样搜「万象城」，以合肥为心返回
 *   合肥万象城、以济南为心返回济南万象城。所以不需要「当前城市」这种概念，
 *   定位拿不到时传兜底点即可
 */
export async function searchDestination(
  keyword: string,
  center: GeoPoint,
  biasRadiusM: number,
): Promise<PoiItem[]> {
  const raw = await get<RawPoi[]>(SEARCH_PATH, {
    keyword,
    // 半径只是语法上必填（`boundary` 不能省，少了直接 348），接口不按它筛
    boundary: `nearby(${center.lat},${center.lng},${biasRadiusM})`,
    page_size: 20,
    page_index: 1,
  })
  return (raw ?? []).map(toPoi)
}

interface MatrixRaw {
  rows?: Array<{ elements?: Array<{ distance: number; duration: number }> }>
}

export interface WalkResult {
  distanceM: number
  durationMin: number
}

/**
 * 单次矩阵请求的目的地上限。
 *
 * 实测（2026-09-12）**每个目的地计 1 点，每秒约 5 点**：
 * 单发 5 点成功、6 点立刻返回 status 120（每秒请求量已达到上限）；
 * 同一秒内「3 点 + 3 点」也会让第二发失败，而「2 点 + 2 点」两发都过。
 * 所以一批最多 5 个，且批次之间必须留间隔 ——
 * 20 个车场并发查询（每个一次请求）会有大半被限流，静默退回估算值
 */
const MATRIX_MAX_POINTS_PER_CALL = 5
/** 批次间隔要盖过「每秒」这个窗口，取 1.1 秒 */
const MATRIX_CHUNK_GAP_MS = 1100

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toWalkResult(el: { distance: number; duration: number }): WalkResult {
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
}

async function matrixChunk(from: GeoPoint, tos: GeoPoint[]): Promise<Array<WalkResult | null>> {
  const empty = tos.map(() => null)
  if (tos.length === 0) return empty
  try {
    const raw = await get<MatrixRaw>(MATRIX_PATH, {
      mode: 'walking',
      from: `${from.lat},${from.lng}`,
      to: tos.map(t => `${t.lat},${t.lng}`).join(';'),
    })
    const elements = raw?.rows?.[0]?.elements ?? []
    // elements 与入参坐标同序（实测 1×3 的顺序与传入一致）。
    // 数量不足时按缺失补 null 而不是错位补齐：错位会把 A 车场的距离安到 B 头上
    return tos.map((_, i) => {
      const el = elements[i]
      return el ? toWalkResult(el) : null
    })
  } catch {
    return empty
  }
}

/**
 * 批量步行距离与时长，返回数组与 `tos` **同序**；某一项查不到为 null，
 * 调用方据此降级为直线距离估算。失败不抛异常。
 */
export async function walkingDistances(
  from: GeoPoint,
  tos: GeoPoint[],
  chunkGapMs: number = MATRIX_CHUNK_GAP_MS,
): Promise<Array<WalkResult | null>> {
  const out: Array<WalkResult | null> = []
  for (let i = 0; i < tos.length; i += MATRIX_MAX_POINTS_PER_CALL) {
    if (i > 0 && chunkGapMs > 0) await delay(chunkGapMs)
    out.push(...(await matrixChunk(from, tos.slice(i, i + MATRIX_MAX_POINTS_PER_CALL))))
  }
  return out
}

/** 单个目的地的步行距离与时长。失败返回 null，调用方降级为直线距离 */
export async function walkingDistance(from: GeoPoint, to: GeoPoint): Promise<WalkResult | null> {
  const [only] = await walkingDistances(from, [to], 0)
  return only ?? null
}
