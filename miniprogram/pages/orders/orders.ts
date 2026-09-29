import { formatAmount, formatPlate, formatTimeRangeLabel, RESERVATION_STATUS_LABELS } from '../../domain/format'
import type { Reservation, ReservationStatus } from '../../domain/types'
import { cancelReservation, ensureLogin } from '../../services/cloud'
import { fetchMyReservations } from '../../services/reservation'

type ViewState = 'loading' | 'ready' | 'empty' | 'error'

interface CardVM {
  id: string
  lotName: string
  plateText: string
  /** 「今天 14:30」/「9月16日 08:00」跨天正确 */
  arriveText: string
  status: ReservationStatus
  /** 原始到达时间（epoch 毫秒），日期区间筛选用 */
  arriveTime: number
  statusLabel: string
  /** 状态标签配色档位 */
  statusClass: string
  totalText: string
  orderNo: string
}

/** 状态筛选 tab。entered 组含 completed（页面同色，合并成「已入场」一个 tab） */
interface FilterTab {
  key: string
  label: string
}

const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: '全部' },
  { key: 'pending_entry', label: '待入场' },
  { key: 'entered', label: '已入场' },
  { key: 'cancelled', label: '已取消' },
  { key: 'released', label: '已释放' },
]

/** 'YYYY-MM-DD' → 当天 0 点 epoch 毫秒。new Date('YYYY-MM-DD') 按 UTC 解析会偏 8 小时，必须本地组 */
function parseLocalDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** 详情视图。展示字段全在这里算好，页面只渲染字符串 */
interface DetailVM {
  id: string
  lotName: string
  addressHint: string
  plateText: string
  orderNo: string
  status: ReservationStatus
  statusLabel: string
  statusClass: string
  arriveText: string
  deadlineText: string
  verifyCode: string
  parkingText: string
  serviceText: string
  totalText: string
  refundText: string
  /** 待入场才有「取消预约」按钮 */
  cancellable: boolean
}

function statusClass(status: ReservationStatus): string {
  switch (status) {
    case 'pending_entry':
      return 'tag--primary'
    case 'entered':
    case 'completed':
      return 'tag--success'
    case 'released':
      return 'tag--warning'
    case 'cancelled':
      return 'tag--muted'
  }
}

function toCard(r: Reservation, now: Date): CardVM {
  return {
    id: r.id,
    lotName: r.lotName,
    plateText: formatPlate(r.plateNo),
    arriveText: formatTimeRangeLabel(now, new Date(r.arriveTime)),
    arriveTime: r.arriveTime,
    status: r.status,
    statusLabel: RESERVATION_STATUS_LABELS[r.status],
    statusClass: statusClass(r.status),
    totalText: formatAmount(r.totalAmount),
    orderNo: r.orderNo,
  }
}

function toDetail(r: Reservation, now: Date): DetailVM {
  const refund = typeof r.refundTotal === 'number'
  return {
    id: r.id,
    lotName: r.lotName,
    addressHint: '',
    plateText: formatPlate(r.plateNo),
    orderNo: r.orderNo,
    status: r.status,
    statusLabel: RESERVATION_STATUS_LABELS[r.status],
    statusClass: statusClass(r.status),
    arriveText: formatTimeRangeLabel(now, new Date(r.arriveTime)),
    deadlineText: formatTimeRangeLabel(now, new Date(r.enterDeadline)),
    verifyCode: r.verifyCode ?? '--',
    parkingText: formatAmount(r.prepaidParkingFee),
    serviceText: formatAmount(r.serviceFee),
    totalText: formatAmount(r.totalAmount),
    // 已取消单显示退款合计；未取消不显示退款行
    refundText: refund ? `已退 ${formatAmount(r.refundTotal!)}` : '',
    cancellable: r.status === 'pending_entry',
  }
}

Page({
  data: {
    state: 'loading' as ViewState,
    cards: [] as CardVM[],
    detail: null as DetailVM | null,
    navTop: 100,
    /** 内容区顶部让位（px）：navTop + 顶栏高 + 间距，标题文字不压内容 */
    bodyTop: 100,
    /** 状态筛选 tab 列表 */
    filterTabs: FILTER_TABS,
    /** 当前选中 tab key */
    activeTab: 'all',
    /** 日期区间（'YYYY-MM-DD'，空 = 不限） */
    fromDate: '',
    toDate: '',
    /** 日期区间弹层开关（点时钟图标弹出） */
    datePanel: false,
  },

  userId: '',
  /** 拉回来的全量卡片，筛选在它之上做（data.cards 是被筛后的视图） */
  rawCards: [] as CardVM[],

  onLoad() {
    // 与 search 页同套路：胶囊下沿 + 8 是顶栏 top，内容区再让出顶栏自身高（80rpx）与间距（16rpx）
    const info = wx.getWindowInfo()
    const rpx = info.windowWidth / 750
    const rect = wx.getMenuButtonBoundingClientRect()
    const navTop = rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100
    const bodyTop = navTop + Math.round(80 * rpx) + Math.round(16 * rpx)
    this.setData({ navTop, bodyTop })
  },

  async onShow() {
    this.getTabBar?.()?.setSelected(1)
    // 身份拿到一次就缓存：orders 是 tab 页，每次切回都 onShow，
    // 反复调 login 云函数纯属浪费。onLaunch 已 ensureLogin 建档，这里拿不到是异常
    if (!this.userId) {
      const r = await ensureLogin()
      if (!r.ok || !r.data.userId) {
        this.setData({ state: 'error' })
        return
      }
      this.userId = r.data.userId
    }
    this.load()
  },

  async load() {
    // 切页回来刷新：取消操作在详情里做完，回列表要看到最新状态
    this.setData({ state: 'loading', detail: null })
    try {
      const list = await fetchMyReservations(this.userId)
      if (list.length === 0) {
        this.rawCards = []
        this.setData({ state: 'empty', cards: [] })
        return
      }
      const now = new Date()
      // 全量存 rawCards，筛选在它之上做（切 tab / 改日期区间不重拉）
      this.rawCards = list.map(r => toCard(r, now))
      this.setData({ state: 'ready' })
      this.applyFilter()
    } catch {
      this.setData({ state: 'error' })
    }
  },

  /** 按当前状态 tab + 日期区间筛 rawCards，结果落 data.cards */
  applyFilter() {
    const { activeTab, fromDate, toDate } = this.data
    const fromMs = fromDate ? parseLocalDay(fromDate) : 0
    const toEndMs = toDate ? parseLocalDay(toDate) + 24 * 60 * 60 * 1000 : Number.POSITIVE_INFINITY
    const cards = this.rawCards.filter(c => {
      const tabOk =
        activeTab === 'all' ||
        (activeTab === 'entered'
          ? c.status === 'entered' || c.status === 'completed'
          : c.status === activeTab)
      return tabOk && c.arriveTime >= fromMs && c.arriveTime < toEndMs
    })
    this.setData({ cards })
  },

  onTabTap(e: WechatMiniprogram.TouchEvent) {
    const key = String(e.currentTarget.dataset.key || 'all')
    if (key === this.data.activeTab) return
    this.setData({ activeTab: key })
    this.applyFilter()
  },

  onFromDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ fromDate: String(e.detail.value || '') })
    this.applyFilter()
  },

  onToDate(e: WechatMiniprogram.PickerChange) {
    this.setData({ toDate: String(e.detail.value || '') })
    this.applyFilter()
  },

  onDateTap() {
    this.setData({ datePanel: !this.data.datePanel })
  },

  onCloseDate() {
    this.setData({ datePanel: false })
  },

  onClearDate() {
    this.setData({ fromDate: '', toDate: '' })
    this.applyFilter()
  },

  onCardTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    // 从已加载的原始数据里找：card VM 不带原始 arriveTime，避免详情再格式化一遍
    void this.openDetail(id)
  },

  async openDetail(id: string) {
    try {
      // 详情要读最新状态（可能刚被超时释放/他端取消），不拿列表里的快照
      const list = await fetchMyReservations(this.userId)
      const r = list.find(x => x.id === id)
      if (!r) {
        wx.showToast({ title: '预约不存在或已删除', icon: 'none' })
        return
      }
      this.setData({ detail: toDetail(r, new Date()) })
    } catch {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onBack() {
    this.setData({ detail: null })
  },

  onCancel(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '取消预约',
      content: '取消后车位立即释放，退款按规则退回。确定取消？',
      confirmText: '取消预约',
      confirmColor: '#dc2626',
      success: res => {
        if (res.confirm) void this.doCancel(id)
      },
    })
  },

  async doCancel(id: string) {
    const r = await cancelReservation(id)
    if (!r.ok) {
      if (r.code === 'ALREADY_CANCELLED' || r.code === 'INVALID_STATUS') {
        wx.showToast({ title: '该预约已被处理', icon: 'none' })
      } else {
        wx.showToast({ title: r.message || '取消失败', icon: 'none' })
      }
      return
    }
    wx.showToast({ title: '已取消', icon: 'success' })
    // 退款明细在 r.data 里；简单起见刷新列表回列表视图（退款详情留在云，明细下次读回）
    this.load()
  },

  onRetry() {
    this.load()
  },
})
