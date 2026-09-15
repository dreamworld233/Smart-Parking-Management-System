import { DEFAULT_RADIUS_M, FALLBACK_PLACE, MAX_PINS, SEARCH_BIAS_RADIUS_M, SEARCH_REGION } from '../../config'
import { toDetailVM } from '../../domain/detail'
import type { LotDetailVM } from '../../domain/detail'
import { formatDistance, formatSpots, searchLocationNotice, sourceNotes } from '../../domain/format'
import { pickPins, pinOf, toMarkers } from '../../domain/pins'
import type { MapMarker, MapPin } from '../../domain/pins'
import { availabilityLevel, freeRate, topRecommendations } from '../../domain/scoring'
import type { AvailabilityLevel } from '../../domain/scoring'
import { sortLots } from '../../domain/sort'
import type { ParkingLot, ReasonTone, Recommendation, SortKey } from '../../domain/types'
import { fetchLotsAround } from '../../services/lot'
import { getCurrentPoint, openNavigation } from '../../services/location'
import { searchDestination, suggestPlaces } from '../../services/qqmap'
import type { PoiItem } from '../../services/qqmap'
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
    keyword: '',
    /** 输入时的联想候选（suggestion）。空数组 = 候选区隐藏，展示历史或地图 */
    candidates: [] as PoiItem[],
    /** 临时调试：联想结果/错误透出到页面（黄色条），定位后删 */
    suggestDebug: '',
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
  /** 联想防抖的计时器句柄（number 是 wx 环境里 setTimeout 的返回类型） */
  suggestTimer: 0,

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
    const keyword = e.detail.value
    this.setData({ keyword })
    this.scheduleSuggest(keyword)
  },

  /**
   * 联想防抖：每敲一组字打一次 suggestion。联想接口配额与 place search 分开计
   * （用户确认），但键盘连打也不该每次都打 —— 300ms 内取最后一次
   */
  scheduleSuggest(keyword: string) {
    if (this.suggestTimer) clearTimeout(this.suggestTimer)
    this.suggestTimer = 0
    const kw = keyword.trim()
    if (kw.length < 2) {
      this.setData({ candidates: [] })
      return
    }
    this.suggestTimer = setTimeout(async () => {
      this.suggestTimer = 0
      try {
        const pois = await suggestPlaces(kw, SEARCH_REGION)
        // 联想是异步的，结果回来时输入可能已经变了：按当前输入对不上就整批丢弃
        if (this.data.keyword.trim() !== kw) return
        this.setData({ candidates: pois, suggestDebug: `ok:${pois.length}` })
      } catch (e) {
        // 失败不能静默：真机上「无联想」既可能是渲染问题也可能是接口问题，
        // 调试行把错误透出来再决定怎么修（定位后去掉这里的 debug 行为）
        this.setData({ suggestDebug: `err:${(e as Error).message}` })
      }
    }, 300)
  },

  onHistoryTap(e: WechatMiniprogram.TouchEvent) {
    const kw = e.currentTarget.dataset.kw as string
    this.setData({ keyword: kw, candidates: [] })
    this.search()
  },

  onSearch() {
    // 键盘确认键：候选开着就取第一条（最相关的那条，用户看得见），而不是静默拿接口首条。
    // 候选没开（没触发联想）才走兜底检索
    const first = this.data.candidates[0]
    if (first) this.search(first)
    else this.search()
  },

  onCandidateTap(e: WechatMiniprogram.TouchEvent) {
    const cand = this.data.candidates[e.currentTarget.dataset.idx as number]
    if (!cand) return
    // 把关键词补成用户选中的那家，历史记录里存的也是它，回点能还原这次选择
    this.setData({ keyword: cand.title })
    this.search(cand)
  },

  /**
   * 目的地检索 + 拉周边车场。
   * `candidate` 由候选点选/确认键给出 —— 用户**显式选过**，坐标就是它；
   * 没候选（历史回点、或没触发联想直接搜索）才走 searchDestination 兜底。
   */
  async search(candidate?: PoiItem) {
    const keyword = this.data.keyword.trim()
    if (!keyword) {
      wx.showToast({ title: '请输入目的地或车场名', icon: 'none' })
      return
    }

    // 上一轮的兜底提示先清掉：重试后可能已经拿到真定位，留着就是假话。
    // 详情同理：重新检索会换一批车场，留着上一批的详情也是在说假话
    this.setData({
      history: pushSearchHistory(keyword),
      candidates: [],
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
      let target: { lat: number; lng: number }
      if (candidate) {
        target = candidate.location
      } else {
        // 兜底检索：suggestion 没触发（历史回点等）时才走。nearby 对目的地是否出结果
        // 取决于腾讯侧关键词索引、页面无法预测（南京理工出、南京大学出 0），所以它
        // 只是兜底，主路径是 suggestion 候选点选。跨城目的地在这里可能搜不到，
        // 要走候选点选那一路（region_fix=0 保留全国候选）
        const pois = await searchDestination(keyword, center, SEARCH_BIAS_RADIUS_M)
        if (seq !== this.searchSeq) return
        if (pois.length === 0) {
          this.setData({ state: 'empty', fallbackText })
          return
        }
        target = pois[0].location
      }

      const lots = await fetchLotsAround(target, DEFAULT_RADIUS_M)
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

  /**
   * `selectedId` 由调用方显式传入，不从 `this.data` 里读：真机上同一次 setData 批里
   * 「改 selectedId + 重建卡片」时，`this.data.selectedId` 取到的可能还是上一屏的值，
   * 于是高亮留在旧的那张卡上（2026-09-14 真机反馈「定位了但没有蓝框」）
   */
  applySort(key: SortKey, nextSelectedId?: string) {
    const selectedId = nextSelectedId ?? this.data.selectedId
    const sorted = sortLots(this.recommendations, key)
    // 图钉只画前 MAX_PINS 个，标签走与首页同一套短口径（车场名不进图钉，名字在卡片里）。
    // 选中项不随排序跑，切一次排序就可能掉出前 MAX_PINS，靠 pickPins 补回来
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
    this.applySort(this.data.sortKey, rec.lot.id)
  },

  /**
   * 返回列表：卡片还留着选中态，但面板停在列表顶部 —— 用户得自己往下翻才找得到
   * 刚才看的那家（2026-09-14 真机反馈）。列表是这一屏新渲染出来的，所以等渲染完再滚
   */
  onDetailBack() {
    this.setData({ detail: null })
    wx.nextTick(() => this.scrollToCard(this.data.selectedId))
  },

  onCardTap(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    this.openDetail(e.detail.id)
  },

  onPinTap(e: WechatMiniprogram.CustomEvent<{ markerId: number }>) {
    const pin = this.data.pins[e.detail.markerId]
    if (!pin) return
    // 详情态下点图钉 = 回列表看那张卡片（与首页同一套）
    const leavingDetail = !!this.data.detail
    // 面板切回列表时卡片是**新创建**的：选中态不能与「切回列表」挤在同一次 setData 里，
    // 否则卡片拿到的还是上一屏的 selectedId、没有蓝框（2026-09-14 真机反馈）
    if (leavingDetail) this.setData({ detail: null })
    const land = () => {
      this.setData({ selectedId: pin.id })
      this.applySort(this.data.sortKey, pin.id)
      this.scrollToCard(pin.id)
    }
    if (leavingDetail) wx.nextTick(land)
    else land()
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

  onRetry() {
    this.search()
  },

  onBack() {
    wx.navigateBack()
  },
})
