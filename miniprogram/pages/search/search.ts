import { DEFAULT_RADIUS_M, FALLBACK_PLACE, SEARCH_BIAS_RADIUS_M } from '../../config'
import { SORT_LABELS, formatDistance, formatSpots, searchLocationNotice, sourceNote } from '../../domain/format'
import { availabilityLevel, freeRate, topRecommendations } from '../../domain/scoring'
import type { AvailabilityLevel } from '../../domain/scoring'
import { sortLots } from '../../domain/sort'
import type { ParkingLot, ReasonTone, Recommendation, SortKey } from '../../domain/types'
import { fetchNearbyLots } from '../../services/lot'
import { getCurrentPoint, openNavigation } from '../../services/location'
import { searchDestination } from '../../services/qqmap'
import { getSearchHistory, pushSearchHistory } from '../../services/storage'

type ViewState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

/** 面板至少占窗口的这么多，剩下的才留给地图（矮屏上地图先让路） */
const MIN_SHEET_RATIO = 0.42

/** map 组件的 marker.id 必须是数字，用数组下标做 id，再靠 pins 反查车场（同首页） */
function toMarkers(pins: Pin[]) {
  return pins.map((p, i) => ({
    id: i,
    latitude: p.latitude,
    longitude: p.longitude,
    width: 1,
    height: 1,
    label: {
      content: p.label,
      fontSize: 12,
      color: p.recommended ? '#ffffff' : '#0f172a',
      bgColor: p.recommended ? '#2563eb' : '#ffffff',
      borderRadius: 11,
      padding: 6,
      textAlign: 'center',
    },
  }))
}

interface Pin {
  id: string
  latitude: number
  longitude: number
  label: string
  /** 综合得分最高者：UI 稿 §5.2「推荐结果 pin 用主色高亮并带 ★ 推荐 前缀」 */
  recommended: boolean
}

interface CardVM {
  lot: ParkingLot
  score: number
  reasons: string[]
  tone: ReasonTone
  distanceText: string
  walkText: string
  spotsText: string
  freeClass: AvailabilityLevel
  estimateText: string
}

function toVM(rec: Recommendation): CardVM {
  const free = rec.lot.availability.freeSpots
  const total = rec.lot.availability.totalSpots
  // 空闲率的派生（除零、NaN 兜底）只在领域层一处，页面不再自己算
  const rate = freeRate(rec.lot.availability)
  return {
    lot: rec.lot,
    score: rec.score,
    reasons: rec.reasons,
    tone: rec.tone,
    distanceText: formatDistance(rec.lot.distanceM),
    walkText: `${rec.lot.walkMinutes} 分钟`,
    spotsText: formatSpots(free, total),
    freeClass: availabilityLevel(rate),
    estimateText: sourceNote(rec.lot),
  }
}

Page({
  data: {
    keyword: '',
    history: [] as string[],
    state: 'idle' as ViewState,
    sortKey: 'composite' as SortKey,
    sortLabel: SORT_LABELS.composite.short,
    cards: [] as CardVM[],
    /** 定位不可用时为空串，非空则面板顶部出兜底提示（同首页口径） */
    fallbackText: '',
    centerLat: FALLBACK_PLACE.point.lat,
    centerLng: FALLBACK_PLACE.point.lng,
    pins: [] as Pin[],
    markers: [] as unknown[],

    // 几何一律 px、由窗口尺寸算出，不写 rpx / vh：顶部高度写死会钻进胶囊下面，
    // 地图写死高度在大屏上会留一大块空白（首页同一套算法）
    searchTop: 100,
    mapTop: 0,
    mapHeight: 0,
    chipsTop: 0,
    sheetTop: 0,
    /** 安全区高度（px）：面板底部的呼吸空间让给 home indicator */
    safeBottom: 0,
  },

  recommendations: [] as Recommendation[],
  /** 综合得分最高的车场 id，★ 标记跟着它走，不跟排序走 */
  topLotId: '',
  /**
   * 检索序号。**加载中再点一次搜索**（回车 / 点历史词）会让两次检索交错，
   * 后 resolve 的旧请求会把新结果覆盖掉；旧请求若失败还会把新请求的 ready
   * 改写成 error，而 recommendations 里留着新数据 —— 面板显示报错、数据却是好的。
   * 每次检索领一个号，回来时号对不上就整批丢弃
   */
  searchSeq: 0,

  onLoad() {
    const info = wx.getWindowInfo()
    const rpx = info.windowWidth / 750
    // safeArea 在极少数环境下缺字段，缺了就当没有安全区
    const safeBottom = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0
    const rect = wx.getMenuButtonBoundingClientRect()
    const searchTop = rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100
    const barH = Math.round(80 * rpx)
    // chips 行连它的下留白一起算，面板正好接在它下面
    const chipsH = Math.round(64 * rpx)
    const gap = Math.round(16 * rpx)

    const mapTop = searchTop + barH + gap
    const minSheet = Math.round(info.windowHeight * MIN_SHEET_RATIO)
    // 面板先占够 MIN_SHEET_RATIO，余下的才是地图高度；矮屏上算出来不够就按窗口的两成兜底
    const room = info.windowHeight - mapTop - chipsH - gap * 3 - minSheet
    const mapHeight = Math.max(Math.round(info.windowHeight * 0.2), room)
    const chipsTop = mapTop + mapHeight + gap

    this.setData({
      history: getSearchHistory(),
      searchTop,
      mapTop,
      mapHeight,
      chipsTop,
      sheetTop: chipsTop + chipsH,
      safeBottom,
    })
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
  },

  onHistoryTap(e: WechatMiniprogram.TouchEvent) {
    const kw = e.currentTarget.dataset.kw as string
    this.setData({ keyword: kw })
    this.search()
  },

  onSearch() {
    this.search()
  },

  async search() {
    const keyword = this.data.keyword.trim()
    if (!keyword) {
      wx.showToast({ title: '请输入目的地或车场名', icon: 'none' })
      return
    }

    // 上一轮的兜底提示先清掉：重试后可能已经拿到真定位，留着就是假话
    this.setData({ history: pushSearchHistory(keyword), state: 'loading', fallbackText: '' })
    const seq = ++this.searchSeq

    const loc = await getCurrentPoint()
    if (seq !== this.searchSeq) return
    // 定位拿不到就用兜底点当排序中心，并明说。文案与首页那句不同：这里显示的
    // 始终是目的地的周边，定位只影响同名地点的先后
    const center = loc.ok ? loc.point : FALLBACK_PLACE.point
    const fallbackText = loc.ok ? '' : searchLocationNotice(loc.reason)

    try {
      // 两次检索，各吃一次搜索配额：先按相关度找目的地，再拉它周边 3 公里的车场
      //（后者有 10 分钟缓存，同关键词反复搜不会再打接口）
      const pois = await searchDestination(keyword, center, SEARCH_BIAS_RADIUS_M)
      if (seq !== this.searchSeq) return
      if (pois.length === 0) {
        this.setData({ state: 'empty', fallbackText })
        return
      }
      const target = pois[0].location

      const { lots } = await fetchNearbyLots(target, DEFAULT_RADIUS_M)
      if (seq !== this.searchSeq) return
      if (lots.length === 0) {
        this.setData({ state: 'empty', fallbackText })
        return
      }

      this.recommendations = topRecommendations(lots, { userNeedsCharging: false }, lots.length)
      // 推荐身份按**综合得分最高**定，与当前排序无关。跟着排序跑的话，切到「距离最近」
      // 时 ★ 会落到最近的那个车场头上，而它未必是推荐的那个
      this.topLotId = this.recommendations.length > 0 ? this.recommendations[0].lot.id : ''

      this.setData({ centerLat: target.lat, centerLng: target.lng, state: 'ready', fallbackText })
      this.applySort(this.data.sortKey)
    } catch {
      if (seq !== this.searchSeq) return
      this.setData({ state: 'error', fallbackText })
    }
  },

  applySort(key: SortKey) {
    const sorted = sortLots(this.recommendations, key)
    const pins: Pin[] = sorted.map(r => {
      const recommended = r.lot.id === this.topLotId
      return {
        id: r.lot.id,
        latitude: r.lot.location.lat,
        longitude: r.lot.location.lng,
        label: `${recommended ? '★ 推荐 · ' : ''}${r.lot.name} ¥${r.lot.pricing.firstHour}`,
        recommended,
      }
    })
    this.setData({
      sortKey: key,
      sortLabel: SORT_LABELS[key].short,
      cards: sorted.map(toVM),
      pins,
      markers: toMarkers(pins),
    })
  },

  onSortChange(e: WechatMiniprogram.CustomEvent<{ key: SortKey }>) {
    this.applySort(e.detail.key)
  },

  onCardTap(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    wx.navigateTo({ url: `/pages/lot-detail/lot-detail?id=${e.detail.id}` })
  },

  onNavigate(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const rec = this.recommendations.find(r => r.lot.id === e.detail.id)
    if (!rec) return
    openNavigation(rec.lot.location, rec.lot.name, rec.lot.address)
  },

  onReserve(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    wx.navigateTo({ url: `/pages/lot-detail/lot-detail?id=${e.detail.id}&intent=reserve` })
  },

  onRetry() {
    this.search()
  },

  onBack() {
    wx.navigateBack()
  },
})
