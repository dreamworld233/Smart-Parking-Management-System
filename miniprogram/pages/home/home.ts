import { DEFAULT_RADIUS_M, FALLBACK_PLACE, MAX_PINS } from '../../config'
import { fallbackNotice, formatDistance, formatSpots, sourceNote } from '../../domain/format'
import { pickPins, pinOf, toMarkers } from '../../domain/pins'
import type { MapMarker, MapPin } from '../../domain/pins'
import { availabilityLevel, freeRate, topRecommendations } from '../../domain/scoring'
import type { AvailabilityLevel } from '../../domain/scoring'
import { sortLots } from '../../domain/sort'
import type { ParkingLot, ReasonTone, Recommendation, SortKey } from '../../domain/types'
import { fetchNearbyLots } from '../../services/lot'
import { getCurrentPoint, openNavigation } from '../../services/location'

type ViewState = 'loading' | 'ready' | 'empty' | 'error'

/**
 * 面板占窗口高度的比例。
 *
 * **0.43 是照着搜索页的面板比例定的**（2026-09-13 用户要求两页一致）——
 * 搜索页那边是算出来的：窗口高度减去顶部栏与地图之后剩下的那部分。
 *
 * **面板固定停在这一位，不拖拽、不收起**（同日用户拍板）：只有「居中」这一个状态，
 * 既省掉不同拉伸下的定位问题，也保证地图始终露出来看得到定位效果。
 * 早先试过两档吸附与自由拖拽，都被否了
 */
const SHEET_HEIGHT_RATIO = 0.43
/** 与 tokens.wxss 的 --tabbar-h 一致（rpx）。面板要停在 tabBar 之上，不能压在它下面 */
const TABBAR_H_RPX = 100

interface CardVM {
  lot: ParkingLot
  score: number
  reasons: string[]
  tone: ReasonTone
  distanceText: string
  walkText: string
  spotsText: string
  // 用领域类型而非 string：下次有人想在这里再写死一个阈值时，是类型错误而不是静默分叉
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
    state: 'loading' as ViewState,
    sortKey: 'composite' as SortKey,
    cards: [] as CardVM[],
    selectedId: '',
    /**
     * 定位失败/被拒时的兜底提示，正常定位下为空串。
     * 文案按 reason 分开（被拒 vs 定位服务失败），见 domain/format.ts
     */
    fallbackText: '',

    /**
     * **地图中心**，不是「我的位置」。定位有结果前先停兜底点（这里是「还没定位」，
     * 不是「已经定位到这里」）；点卡片时会被移到该车场，所以不能与定位结果共用一个字段
     */
    centerLat: FALLBACK_PLACE.point.lat,
    centerLng: FALLBACK_PLACE.point.lng,
    /** 点图钉时把对应卡片滚进视野；scroll-into-view 只在值变化时才动，用完要清 */
    intoView: '',
    pins: [] as MapPin[],
    markers: [] as MapMarker[],

    /**
     * 浮层位置与面板几何一律用 px 由窗口尺寸算出来，不写 rpx / vh：
     * - 搜索框写死 top 会钻进右上角胶囊下面，真机上点不动
     * - 面板写 vh + 硬编码 translateY，在矮屏上会整块跑出屏幕（Task 0 验证时踩过）
     */
    searchTop: 100,
    /** 地图高度（px）：只占面板上方露出来的那块，见 home.wxss 里的说明 */
    mapHeight: 0,
    sheetHeight: 0,
    sheetBottom: 0,
  },

  recommendations: [] as Recommendation[],
  loaded: false,

  onLoad() {
    const info = wx.getWindowInfo()
    const rpx = info.windowWidth / 750
    // safeArea 在极少数环境下缺字段，缺了就当没有安全区
    const safeBottom = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0
    const sheetHeight = Math.round(info.windowHeight * SHEET_HEIGHT_RATIO)
    const sheetBottom = Math.round(TABBAR_H_RPX * rpx + safeBottom)
    // 地图只铺面板上方那块。地图的几何中心是它的正中间，铺满整页时中心会被面板盖住，
    // 点卡片居中过去等于把图钉藏起来（2026-09-13 真机反馈「根本定位不到」）
    const mapHeight = info.windowHeight - sheetBottom - sheetHeight

    // 胶囊下沿 + 8px。取不到胶囊信息时退回 100px
    const rect = wx.getMenuButtonBoundingClientRect()
    const searchTop = rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100

    this.setData({
      searchTop,
      mapHeight,
      sheetHeight,
      sheetBottom,
    })
  },

  onShow() {
    this.getTabBar?.()?.setSelected(0)
    // 只在首次进入时拉取；从详情页返回时保留原有列表与排序，避免闪一下
    if (!this.loaded) {
      this.loaded = true
      this.load()
    }
  },

  async load() {
    // 上一轮的兜底提示先清掉：重试后可能已经拿到真定位，留着就是假话
    this.setData({ state: 'loading', fallbackText: '' })

    const loc = await getCurrentPoint()
    // 定位拿不到就用兜底点继续拉数据，而不是甩一个空面板：用户至少能看到
    // 一个真实城市的真实车场，面板上的提示负责说清「这不是你的位置」
    const point = loc.ok ? loc.point : FALLBACK_PLACE.point
    const fallbackText = loc.ok ? '' : fallbackNotice(loc.reason, FALLBACK_PLACE.name)

    try {
      const { lots } = await fetchNearbyLots(point, DEFAULT_RADIUS_M)
      if (lots.length === 0) {
        this.setData({ state: 'empty', fallbackText })
        return
      }

      this.recommendations = topRecommendations(lots, { userNeedsCharging: false }, lots.length)

      this.setData({ centerLat: point.lat, centerLng: point.lng, state: 'ready', fallbackText })
      this.applySort(this.data.sortKey)
    } catch {
      // 提示照样留着：兜底点这批车场也没拉到，用户更需要知道看的是哪儿
      this.setData({ state: 'error', fallbackText })
    }
  },

  applySort(key: SortKey) {
    const sorted = sortLots(this.recommendations, key)
    // 图钉只画前 MAX_PINS 个（标签会互相压），列表仍是全部；
    // 选中的那条被 pickPins 补回来，所以「点卡片 ↔ 点图钉」联动不会断
    const selectedId = this.data.selectedId
    const pins = pickPins(sorted, [selectedId], MAX_PINS).map(r =>
      pinOf(r, { selected: r.lot.id === selectedId }),
    )
    this.setData({
      sortKey: key,
      cards: sorted.map(toVM),
      pins,
      markers: toMarkers(pins),
    })
  },

  onSortChange(e: WechatMiniprogram.CustomEvent<{ key: SortKey }>) {
    this.applySort(e.detail.key)
  },

  onPinTap(e: WechatMiniprogram.CustomEvent<{ markerId: number }>) {
    const pin = this.data.pins[e.detail.markerId]
    if (!pin) return
    this.setData({ selectedId: pin.id })
    this.applySort(this.data.sortKey)
    // 联动的另一半：把卡片滚进视野，用户不用自己翻找
    this.scrollToCard(pin.id)
  },

  /** 把对应卡片滚进视野 */
  scrollToCard(lotId: string) {
    const index = this.data.cards.findIndex(c => c.lot.id === lotId)
    if (index < 0) return
    // scroll-into-view 只在**值变化**时才滚动，所以先清空、下一帧再设上 ——
    // 否则连点同一个图钉（或点完卡片再点图钉）不会重新滚
    this.setData({ intoView: '' })
    wx.nextTick(() => this.setData({ intoView: `card${index}` }))
  },

  /**
   * 点卡片 = 选中它 + 把地图移到它上面（UI 稿 §5.1「点卡片与点图钉联动」）。
   *
   * 面板固定不动：它始终占下半屏，上半屏的地图一直露着，所以居中效果直接看得见
   * （早先面板会吸附收起，点一下卡片就弹回去，2026-09-13 真机反馈「很突兀」）。
   * 进详情不在这里 —— 详情按 2026-09-13 的决定做进面板内（见计划文件）
   */
  onCardTap(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const rec = this.recommendations.find(r => r.lot.id === e.detail.id)
    if (!rec) return
    this.setData({
      selectedId: rec.lot.id,
      centerLat: rec.lot.location.lat,
      centerLng: rec.lot.location.lng,
    })
    this.applySort(this.data.sortKey)
  },

  onNavigate(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const rec = this.recommendations.find(r => r.lot.id === e.detail.id)
    if (!rec) return
    openNavigation(rec.lot.location, rec.lot.name, rec.lot.address)
  },

  onReserve(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    // 付费链路在计划 2 实现，这里只把意图带到详情页
    wx.navigateTo({ url: `/pages/lot-detail/lot-detail?id=${e.detail.id}&intent=reserve` })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  onRetry() {
    this.load()
  },

})
