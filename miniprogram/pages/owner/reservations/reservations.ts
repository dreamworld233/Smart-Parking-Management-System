import { formatPlate, formatTimeRangeLabel, RESERVATION_STATUS_LABELS } from '../../../domain/format'
import { fetchAdminReservations, verifyReservation } from '../../../services/cloud'
import type { AdminReservationItem } from '../../../services/cloud'
import type { ReservationStatus } from '../../../domain/types'
import { clearRole } from '../../../services/storage'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

interface CardVM {
  id: string
  plateText: string
  /** 原始车牌（手动核销传云端的值，格式化的 plateText 可能带空格） */
  rawPlate: string
  arriveText: string
  statusLabel: string
  statusClass: string
  /** 待入场才显示核销码与操作 */
  pending: boolean
  verifyCode: string
}

function statusClass(status: string): string {
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
    default:
      return 'tag--muted'
  }
}

Page({
  data: {
    state: 'loading' as ViewState,
    cards: [] as CardVM[],
    // 核销弹窗
    verifyDialog: false,
    target: null as { id: string; plateText: string; rawPlate: string } | null,
    mode: 'code' as 'code' | 'manual',
    codeInput: '',
    submitting: false,
    codeInvalid: false,
  },

  /** 当前车场 id（data 外实例字段） */
  lotId: '',

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(1)
    // 从看板「待核销」跳来、核销完返回都要刷新
    void this.load()
  },

  async load() {
    this.setData({ state: 'loading' })
    const r = await fetchAdminReservations()
    if (!r.ok) {
      if (r.code === 'NO_AUTH') {
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.lot === null) {
      this.setData({ state: 'no_lot' })
      return
    }
    this.lotId = r.data.lot._id
    const now = new Date()
    this.setData({
      state: 'ready',
      cards: r.data.list.map((x: AdminReservationItem) => ({
        id: x._id,
        plateText: formatPlate(x.plateNo),
        rawPlate: String(x.plateNo || ''),
        arriveText: formatTimeRangeLabel(now, new Date(x.arriveTime)),
        statusLabel: RESERVATION_STATUS_LABELS[x.status as ReservationStatus] ?? x.status,
        statusClass: statusClass(x.status),
        pending: x.status === 'pending_entry',
        verifyCode: String(x.verifyCode || ''),
      })),
    })
  },

  onPickRole() {
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  onBindLot() {
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load()
  },

  /** 点待入场单 → 打开核销弹窗 */
  onCardTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    const card = this.data.cards.find(c => c.id === id)
    if (!card || !card.pending) return
    this.setData({
      verifyDialog: true,
      target: { id: card.id, plateText: card.plateText, rawPlate: card.rawPlate },
      mode: 'code',
      codeInput: '',
      codeInvalid: false,
    })
  },

  onCloseVerify() {
    this.setData({ verifyDialog: false })
  },

  onModeCode() {
    this.setData({ mode: 'code', codeInvalid: false })
  },

  onModeManual() {
    this.setData({ mode: 'manual', codeInvalid: false })
  },

  onCodeInput(e: WechatMiniprogram.Input) {
    this.setData({ codeInput: e.detail.value, codeInvalid: false })
  },

  async onConfirmVerify() {
    if (this.data.submitting || !this.data.target) return
    const { target, mode, codeInput } = this.data
    if (mode === 'code' && !/^\d{6}$/.test(codeInput)) {
      this.setData({ codeInvalid: true })
      return
    }
    this.setData({ submitting: true })
    const r = await verifyReservation(
      mode === 'code'
        ? { lotId: this.lotId, method: 'code', verifyCode: codeInput }
        : { lotId: this.lotId, method: 'manual', plateNo: target.rawPlate },
    )
    this.setData({ submitting: false })
    if (!r.ok) {
      wx.showToast({ title: r.message || '核销失败', icon: 'none' })
      return
    }
    this.setData({ verifyDialog: false })
    wx.showToast({ title: '已核销入场', icon: 'success' })
    this.load()
  },

  noop() {},
})
