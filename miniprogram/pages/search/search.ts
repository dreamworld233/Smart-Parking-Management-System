import { DEFAULT_RADIUS_M, FALLBACK_PLACE, MAX_PINS, SEARCH_BIAS_RADIUS_M } from '../../config'
import { toDetailVM } from '../../domain/detail'
import type { LotDetailVM } from '../../domain/detail'
import { formatDistance, formatSpots, searchLocationNotice, sourceNote } from '../../domain/format'
import { pickPins, pinOf, toMarkers } from '../../domain/pins'
import type { MapMarker, MapPin } from '../../domain/pins'
import { availabilityLevel, freeRate, topRecommendations } from '../../domain/scoring'
import type { AvailabilityLevel } from '../../domain/scoring'
import { sortLots } from '../../domain/sort'
import type { ParkingLot, ReasonTone, Recommendation, SortKey } from '../../domain/types'
import { fetchNearbyLots } from '../../services/lot'
import { getCurrentPoint, openNavigation } from '../../services/location'
import { searchDestination } from '../../services/qqmap'
import { getSearchHistory, pushSearchHistory } from '../../services/storage'

type ViewState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

/**
 * 面板占窗口的这么多，剩下的才留给地图（矮屏上地图先让路）。
 * **面板固定停在这一位，不拖拽、不收起**（2026-09-13 用户拍板，与首页一致）：
 * 收起态会在地图下沿与面板之间露出一条底色，看着像空白
 */
const MIN_SHEET_RATIO = 0.42

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
    cards: [] as CardVM[],
    /** 定位不可用时为空串，非空则面板顶部出兜底提示（同首页口径） */
    fallbackText: '',
    /** 地图中心：检索成功后是目的地，点卡片时会移到该车场 */
    centerLat: FALLBACK_PLACE.point.lat,
    centerLng: FALLBACK_PLACE.point.lng,
    /** 联动用的选中项。检索完成后自动落在第一条上（不再有单独的「推荐」标记） */
    selectedId: '',
    /** 非空 = 面板正在显示该车场的详情；面板高度不变，只有内容切换（同首页） */
    detail: null as LotDetailVM | null,
    /** 点图钉时把对应卡片滚进视野；scroll-into-view 只在值变化时才动，用完要清 */
    intoView: '',
    pins: [] as MapPin[],
    markers: [] as MapMarker[],

    // 几何一律 px、由窗口尺寸算出，不写 rpx / vh：顶部高度写死会钻进胶囊下面，
    // 地图写死高度在大屏上会留一大块空白（首页同一套算法）
    searchTop: 100,
    mapTop: 0,
    mapHeight: 0,
    /** 面板高度（px）。面板固定，没有位移 */
    sheetHeight: 0,
    /** 安全区高度（px）：面板底部的呼吸空间让给 home indicator */
    safeBottom: 0,
  },

  recommendations: [] as Recommendation[],
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
    const gap = Math.round(16 * rpx)

    const mapTop = searchTop + barH + gap
    const minSheet = Math.round(info.windowHeight * MIN_SHEET_RATIO)
    // 面板先占够 MIN_SHEET_RATIO，余下的才是地图高度；矮屏上算出来不够就按窗口的两成兜底。
    // chips 搬进面板后，地图头上那一整条（chipsH + gap）也归地图了
    const room = info.windowHeight - mapTop - gap * 2 - minSheet
    const mapHeight = Math.max(Math.round(info.windowHeight * 0.2), room)
    // 面板顶到地图下沿，剩下的整块都是面板（首页那份 SHEET_HEIGHT_RATIO 就是照这个比例定的）。
    // 面板是 bottom: 0 + padding-bottom: safeBottom 的贴底盒子，而 rendererOptions 里
    // defaultContentBox 是 true —— padding 会加在 height 之外，所以这里要把安全区一起算进来，
    // 否则面板顶会比预期高出一个安全区，压住地图下沿
    const sheetHeight = info.windowHeight - mapTop - mapHeight - gap - safeBottom

    this.setData({
      history: getSearchHistory(),
      searchTop,
      mapTop,
      mapHeight,
      sheetHeight,
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

    // 上一轮的兜底提示先清掉：重试后可能已经拿到真定位，留着就是假话。
    // 详情同理：重新检索会换一批车场，留着上一批的详情也是在说假话
    this.setData({
      history: pushSearchHistory(keyword),
      state: 'loading',
      fallbackText: '',
      detail: null,
    })
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

      // 检索完**自动选中第一条**（2026-09-13 用户要求：取代原先那条单独的「★ 推荐」）。
      // 按当前排序取首条 —— 用户看到的第一张卡片就是被选中的那张，两者对得上
      const first = sortLots(this.recommendations, this.data.sortKey)[0]

      this.setData({
        centerLat: target.lat,
        centerLng: target.lng,
        selectedId: first ? first.lot.id : '',
        state: 'ready',
        fallbackText,
      })
      this.applySort(this.data.sortKey)
    } catch {
      if (seq !== this.searchSeq) return
      this.setData({ state: 'error', fallbackText })
    }
  },

  applySort(key: SortKey) {
    const sorted = sortLots(this.recommendations, key)
    // 图钉只画前 MAX_PINS 个，标签走与首页同一套短口径（车场名不进图钉，名字在卡片里）。
    // 选中项不随排序跑，切一次排序就可能掉出前 MAX_PINS，靠 pickPins 补回来
    const { selectedId } = this.data
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

  /**
   * 进详情 = 选中它 + 把地图移到它上面 + 面板内容切成详情（与首页同一套）。
   * 点整张卡片与点卡片上的「预约车位」走同一条路：详情不再是独立页面，
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
    this.applySort(this.data.sortKey)
  },

  onCardTap(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    this.openDetail(e.detail.id)
  },

  onPinTap(e: WechatMiniprogram.CustomEvent<{ markerId: number }>) {
    const pin = this.data.pins[e.detail.markerId]
    if (!pin) return
    // 详情态下点图钉 = 回列表看那张卡片：先退出详情，列表渲染出来 scroll-into-view 才有目标
    this.setData({ selectedId: pin.id, detail: null })
    this.applySort(this.data.sortKey)
    this.scrollToCard(pin.id)
  },

  /** 把对应卡片滚进视野 */
  scrollToCard(lotId: string) {
    const index = this.data.cards.findIndex(c => c.lot.id === lotId)
    if (index < 0) return
    // scroll-into-view 只在**值变化**时才滚动，所以先清空、下一帧再设上
    this.setData({ intoView: '' })
    wx.nextTick(() => this.setData({ intoView: `card${index}` }))
  },

  onNavigate(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const rec = this.recommendations.find(r => r.lot.id === e.detail.id)
    if (!rec) return
    openNavigation(rec.lot.location, rec.lot.name, rec.lot.address)
  },

  onReserve(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    this.openDetail(e.detail.id)
  },

  /** 详情里的「预约车位」：付费链路在计划 2，这里先给出提示 */
  onDetailReserve() {
    wx.showToast({ title: '预约流程将在下一阶段接入', icon: 'none' })
  },

  onDetailBack() {
    this.setData({ detail: null })
  },

  onRetry() {
    this.search()
  },

  onBack() {
    wx.navigateBack()
  },
})
