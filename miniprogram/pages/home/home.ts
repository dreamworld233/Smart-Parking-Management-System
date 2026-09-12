import { DEFAULT_RADIUS_M } from '../../config'
import { SORT_LABELS, formatDistance, formatSpots, sourceNote } from '../../domain/format'
import { availabilityLevel, freeRate, topRecommendations } from '../../domain/scoring'
import type { AvailabilityLevel } from '../../domain/scoring'
import { sortLots } from '../../domain/sort'
import type { ParkingLot, ReasonTone, Recommendation, SortKey } from '../../domain/types'
import { fetchNearbyLots } from '../../services/lot'
import { getCurrentPoint, openNavigation } from '../../services/location'

type ViewState = 'loading' | 'ready' | 'empty' | 'error' | 'no-location'

/** 面板收起时露出的高度（px）：抓手 + 排序提示行 */
const SHEET_PEEK = 112
/** 面板展开态占窗口高度的比例 */
const SHEET_HEIGHT_RATIO = 0.62
/** 与 tokens.wxss 的 --tabbar-h 一致（rpx）。面板要停在 tabBar 之上，不能压在它下面 */
const TABBAR_H_RPX = 100

interface Pin {
  id: string
  latitude: number
  longitude: number
  label: string
  active: boolean
}

/** map 组件的 marker.id 必须是数字，所以用数组下标做 id，再靠 pins 反查车场 */
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
      color: p.active ? '#ffffff' : '#0f172a',
      bgColor: p.active ? '#2563eb' : '#ffffff',
      borderRadius: 11,
      padding: 6,
      textAlign: 'center',
    },
  }))
}

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
    sortLabel: SORT_LABELS.composite.short,
    cards: [] as CardVM[],
    selectedId: '',
    /** 定位被拒与定位失败的文案不同（见 services/location.ts 的 reason） */
    noLocText: '',
    noLocHint: '',

    lat: 36.6512,
    lng: 117.1201,
    pins: [] as Pin[],
    markers: [] as unknown[],

    /**
     * 浮层位置与面板几何一律用 px 由窗口尺寸算出来，不写 rpx / vh：
     * - 搜索框写死 top 会钻进右上角胶囊下面，真机上点不动
     * - 面板写 vh + 硬编码 translateY，在矮屏上会整块跑出屏幕（Task 0 验证时踩过）
     */
    searchTop: 100,
    chipsTop: 160,
    sheetHeight: 0,
    sheetBottom: 0,
    collapsedY: 0,
    sheetY: 0,
  },

  recommendations: [] as Recommendation[],
  loaded: false,
  dragStartY: 0,
  dragStartSheetY: 0,
  /** 这一次触摸是否发生了拖动：拖动抬手后系统还会补一个 tap，要吃掉它 */
  dragged: false,

  onLoad() {
    const info = wx.getWindowInfo()
    const rpx = info.windowWidth / 750
    // safeArea 在极少数环境下缺字段，缺了就当没有安全区
    const safeBottom = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0
    const sheetHeight = Math.round(info.windowHeight * SHEET_HEIGHT_RATIO)
    const collapsedY = Math.max(0, sheetHeight - SHEET_PEEK)

    // 胶囊下沿 + 8px。取不到胶囊信息时退回 100px
    const rect = wx.getMenuButtonBoundingClientRect()
    const searchTop = rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100

    this.setData({
      searchTop,
      chipsTop: searchTop + Math.round(80 * rpx) + 12,
      sheetHeight,
      sheetBottom: Math.round(TABBAR_H_RPX * rpx + safeBottom),
      collapsedY,
      sheetY: collapsedY,
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
    // 加载中/失败态要看得见，所以这段时间面板强制展开
    this.setData({ state: 'loading', sheetY: 0 })

    const loc = await getCurrentPoint()
    if (!loc.ok) {
      this.setData({
        state: 'no-location',
        noLocText: loc.reason === 'denied' ? '未获取到定位授权' : '定位失败',
        noLocHint:
          loc.reason === 'denied'
            ? '可在设置中开启定位，或直接搜索目的地'
            : '请检查手机定位是否开启，或直接搜索目的地',
      })
      return
    }

    try {
      const { lots } = await fetchNearbyLots(loc.point, DEFAULT_RADIUS_M)
      if (lots.length === 0) {
        this.setData({ state: 'empty' })
        return
      }

      this.recommendations = topRecommendations(lots, { userNeedsCharging: false }, lots.length)

      this.setData({ lat: loc.point.lat, lng: loc.point.lng, state: 'ready' })
      this.applySort(this.data.sortKey)
      this.setData({ sheetY: this.data.collapsedY })
    } catch {
      this.setData({ state: 'error' })
    }
  },

  applySort(key: SortKey) {
    const sorted = sortLots(this.recommendations, key)
    const pins: Pin[] = sorted.map(r => ({
      id: r.lot.id,
      latitude: r.lot.location.lat,
      longitude: r.lot.location.lng,
      label: `¥${r.lot.pricing.firstHour} · ${formatDistance(r.lot.distanceM)}`,
      active: r.lot.id === this.data.selectedId,
    }))
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

  onPinTap(e: WechatMiniprogram.CustomEvent<{ markerId: number }>) {
    const pin = this.data.pins[e.detail.markerId]
    if (!pin) return
    this.setData({ selectedId: pin.id })
    this.applySort(this.data.sortKey)
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
    // 付费链路在计划 2 实现，这里只把意图带到详情页
    wx.navigateTo({ url: `/pages/lot-detail/lot-detail?id=${e.detail.id}&intent=reserve` })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  onRetry() {
    this.load()
  },

  onGripTouchStart(e: WechatMiniprogram.TouchEvent) {
    this.dragged = false
    this.dragStartY = e.touches[0].clientY
    this.dragStartSheetY = this.data.sheetY
  },

  onGripTouchMove(e: WechatMiniprogram.TouchEvent) {
    const delta = e.touches[0].clientY - this.dragStartY
    if (Math.abs(delta) > 4) this.dragged = true
    const next = Math.min(this.data.collapsedY, Math.max(0, this.dragStartSheetY + delta))
    this.setData({ sheetY: next })
  },

  onGripTouchEnd() {
    this.snapSheet()
  },

  /** 触摸被系统取消时同样吸附，避免面板卡在半途 */
  onGripTouchCancel() {
    this.snapSheet()
  },

  onGripTap() {
    // 拖完抬手系统会补一个 tap，不挡掉的话「刚拖到展开」会被立刻收回
    if (this.dragged) {
      this.dragged = false
      return
    }
    this.setData({
      sheetY: this.data.sheetY < this.data.collapsedY / 2 ? this.data.collapsedY : 0,
    })
  },

  snapSheet() {
    const { sheetY, collapsedY } = this.data
    this.setData({ sheetY: sheetY < collapsedY / 2 ? 0 : collapsedY })
  },
})
