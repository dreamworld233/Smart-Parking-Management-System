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
  statusLabel: string
  /** 状态标签配色档位 */
  statusClass: string
  totalText: string
  orderNo: string
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
  },

  userId: '',

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
        this.setData({ state: 'empty', cards: [] })
        return
      }
      const now = new Date()
      this.setData({ state: 'ready', cards: list.map(r => toCard(r, now)) })
    } catch {
      this.setData({ state: 'error' })
    }
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
