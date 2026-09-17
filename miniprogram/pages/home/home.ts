import { DEFAULT_RADIUS_M, FALLBACK_PLACE, MAX_PINS } from '../../config'
import { toDetailVM } from '../../domain/detail'
import type { LotDetailVM } from '../../domain/detail'
import { fallbackNotice, formatDistance, formatSpots, sourceNotes } from '../../domain/format'
import { pickPins, pinOf, toMarkers } from '../../domain/pins'
import type { MapMarker, MapPin } from '../../domain/pins'
import { availabilityLevel, freeRate, topRecommendations } from '../../domain/scoring'
import type { AvailabilityLevel } from '../../domain/scoring'
import { sortLots } from '../../domain/sort'
import type { ParkingLot, ReasonTone, Recommendation, SortKey } from '../../domain/types'
import { fetchLotsAround } from '../../services/lot'
import { getCurrentPoint, openNavigation } from '../../services/location'
import { consumeLotDataDirty } from '../../services/storage'

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
  sourceNotes: string[]
}

function toVM(rec: Recommendation): CardVM {
  const { lot } = rec
  // 未签约：没有余位数据，「待上报」是签约车场的状态词，这里该显示「--」
  const spotsText =
    lot.signed && lot.availability
      ? formatSpots(lot.availability.freeSpots, lot.availability.totalSpots)
      : '--'
  // 空闲率的派生（除零、NaN 兜底）只在领域层一处，页面不再自己算
  const rate = lot.availability ? freeRate(lot.availability) : NaN
  return {
    lot,
    score: rec.score,
    reasons: rec.reasons,
    tone: rec.tone,
    distanceText: formatDistance(lot.distanceM),
    walkText: `${lot.walkMinutes} 分钟`,
    spotsText,
    freeClass: availabilityLevel(rate),
    sourceNotes: sourceNotes(lot),
  }
}

Page({
  data: {
    state: 'loading' as ViewState,
    sortKey: 'composite' as SortKey,
    cards: [] as CardVM[],
    selectedId: '',
    /**
     * 非空 = 面板正在显示该车场的详情。**面板高度不变**，只有面板里的内容切换
     * （2026-09-14 决定：详情在固定面板内滚，不做「进详情临时加高」）
     */
    detail: null as LotDetailVM | null,
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
    // 只在首次进入时拉取；从详情页返回时保留原有列表与排序，避免闪一下。
    // 预约/取消后余位变了，脏标志由 confirm 置位、这里消费并强制重拉
    if (!this.loaded || consumeLotDataDirty()) {
      this.loaded = true
      this.load()
    }
  },

  async load() {
    // 上一轮的兜底提示先清掉：重试后可能已经拿到真定位，留着就是假话。
    // 详情同理：重试会换一批车场，留着上一批的详情也是在说假话
    this.setData({ state: 'loading', fallbackText: '', detail: null })

    const loc = await getCurrentPoint()
    // 定位拿不到就用兜底点继续拉数据，而不是甩一个空面板：用户至少能看到
    // 一个真实城市的真实车场，面板上的提示负责说清「这不是你的位置」
    const point = loc.ok ? loc.point : FALLBACK_PLACE.point
    const fallbackText = loc.ok ? '' : fallbackNotice(loc.reason, FALLBACK_PLACE.name)

    try {
      // 签约 + 未签约 POI 一起拉：可预约的在前，其余只提供导航（排序由 applySort 处理）
      const lots = await fetchLotsAround(point, DEFAULT_RADIUS_M)
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

  /**
   * `selectedId` 由调用方显式传入，不从 `this.data` 里读：真机上同一次 setData 批里
   * 「改 selectedId + 重建卡片」时，`this.data.selectedId` 取到的可能还是上一屏的值，
   * 于是高亮留在旧的那张卡上（2026-09-14 真机反馈「定位了但没有蓝框」）
   */
  applySort(key: SortKey, nextSelectedId?: string) {
    const selectedId = nextSelectedId ?? this.data.selectedId
    const sorted = sortLots(this.recommendations, key)
    // 图钉只画前 MAX_PINS 个（标签会互相压），列表仍是全部；
    // 选中的那条被 pickPins 补回来，所以「点卡片 ↔ 点图钉」联动不会断
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
    // 详情态下点图钉 = 回列表看那张卡片：详情是「这个车场」的独占视图，
    // 图钉联动要看到卡片才有意义。
    const leavingDetail = !!this.data.detail
    // 面板切回列表时卡片是**新创建**的：选中态与「切回列表」不能挤在同一次 setData 里，
    // 否则卡片拿到的是上一屏的 selectedId、没有蓝框（2026-09-14 真机反馈）
    if (leavingDetail) this.setData({ detail: null })
    const land = () => {
      this.setData({ selectedId: pin.id })
      this.applySort(this.data.sortKey, pin.id)
      // 联动的另一半：把卡片滚进视野，用户不用自己翻找
      this.scrollToCard(pin.id)
    }
    if (leavingDetail) wx.nextTick(land)
    else land()
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
   * 进详情 = 选中它 + 把地图移到它上面 + 面板内容切成详情（UI 稿 §5.1 / §5.3）。
   *
   * 面板固定不动：它始终占下半屏，上半屏的地图一直露着，所以居中效果直接看得见
   * （早先面板会吸附收起，点一下卡片就弹回去，2026-09-13 真机反馈「很突兀」）。
   * **点整张卡片与点卡片上的「预约车位」走同一条路** —— 详情已不再是独立页面，
   * 付费层的「预约确认」屏仍留在计划 2
   */
  openDetail(id: string) {
    const rec = this.recommendations.find(r => r.lot.id === id)
    if (!rec) return
    this.setData({
      selectedId: rec.lot.id,
      centerLat: rec.lot.location.lat,
      centerLng: rec.lot.location.lng,
      detail: toDetailVM(rec),
    })
    this.applySort(this.data.sortKey, rec.lot.id)
  },

  /**
   * 返回列表：卡片还留着选中态，但面板停在列表顶部 —— 用户得自己往下翻才找得到
   * 刚才看的那家（2026-09-14 真机反馈）。列表是这一屏新渲染出来的，
   * 所以滚到那张卡要等渲染完
   */
  onDetailBack() {
    this.setData({ detail: null })
    wx.nextTick(() => this.scrollToCard(this.data.selectedId))
  },

  onCardTap(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    this.openDetail(e.detail.id)
  },

  onReserve(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    this.openDetail(e.detail.id)
  },

  /** 详情里的「预约车位」→ 预约确认页（lot-detail 的 reserve 事件带 lotId） */
  onDetailReserve(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const id = e.detail.id
    if (!id) return
    wx.navigateTo({ url: `/pages/confirm/confirm?lotId=${id}` })
  },

  onNavigate(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const rec = this.recommendations.find(r => r.lot.id === e.detail.id)
    if (!rec) return
    openNavigation(rec.lot.location, rec.lot.name, rec.lot.address)
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  onRetry() {
    this.load()
  },

})
