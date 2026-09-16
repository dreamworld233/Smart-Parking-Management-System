import { formatAmount, formatTimeRangeLabel } from '../../../domain/format'
import { fetchAdminDashboard, reportAvailability, updateLot } from '../../../services/cloud'
import type { AdminDashboardData } from '../../../services/cloud'
import { clearRole } from '../../../services/storage'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

interface StatVM {
  todayReservations: string
  pendingEntry: string
  todayIncome: string
}

interface QuotaVM {
  reserved: number
  total: number
  /** 剩余可预约数（total - reserved，负数钳 0） */
  left: number
  /** 额度条百分比（0–100），total 为 0 时是 0 */
  percent: number
}

Page({
  data: {
    state: 'loading' as ViewState,
    lotName: '',
    lotAddress: '',
    stat: { todayReservations: '0', pendingEntry: '0', todayIncome: '¥0' } as StatVM,
    quota: { reserved: 0, total: 0, left: 0, percent: 0 } as QuotaVM,
    spotsText: '待上报',
    /** 待核销列表（只显示车牌 + 到达 + 核销码） */
    pendingList: [] as { id: string; plateText: string; arriveText: string; verifyCode: string }[],
    // 调整额度弹窗
    quotaDialog: false,
    quotaInput: '',
    // 余位上报弹窗
    reportDialog: false,
    reportInput: '',
    submitting: false,
    /** 弹窗输入非法态 */
    inputInvalid: false,
  },

  /** 当前车场 id（load 成功后赋值，data 外的实例字段） */
  lotId: '',

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(0)
    void this.load()
  },

  async load() {
    this.setData({ state: 'loading' })
    const r = await fetchAdminDashboard()
    if (!r.ok) {
      // NO_AUTH = 当前身份不是 lot_admin（DB 里 role 还没标，或本就是个普通车主）：
      // 归 no_role 态给「选择身份」入口，别归 error —— error 态切不回角色页
      if (r.code === 'NO_AUTH') {
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.lot === null) {
      // adminDashboard 里未绑定车场返回 lot: null（与 adminGetLot 的 no_lot 同一语义）
      this.setData({ state: 'no_lot' })
      return
    }
    const d: AdminDashboardData = r.data
    // 上面 lot === null 已返回；这里类型系统收窄不了跨闭包的赋值，显式非空
    const lot = d.lot!
    const total = typeof lot.reservableQuota === 'number' ? Math.max(0, lot.reservableQuota) : 0
    const reserved = typeof lot.reservedCount === 'number' ? Math.max(0, lot.reservedCount) : 0
    const left = Math.max(0, total - reserved)

    const avail = lot.availability
    const spotsText =
      avail && typeof avail.freeSpots === 'number' && typeof avail.totalSpots === 'number'
        ? `${avail.freeSpots} / ${avail.totalSpots}`
        : '待上报'

    this.lotId = lot._id
    this.setData({
      state: 'ready',
      lotName: lot.name,
      lotAddress: lot.address,
      stat: {
        todayReservations: String(d.todayReservations),
        pendingEntry: String(d.pendingEntry),
        todayIncome: formatAmount(d.todayIncome),
      },
      quota: { reserved, total, left, percent: total > 0 ? Math.round((reserved / total) * 100) : 0 },
      spotsText,
      pendingList: d.pendingList.map(x => ({
        id: x._id,
        plateText: String(x.plateNo || '--'),
        arriveText: formatTimeRangeLabel(new Date(), new Date(x.arriveTime)),
        verifyCode: String(x.verifyCode || '--'),
      })),
    })
  },

  onPickRole() {
    // 必须清 role：role-select onLoad 发现已有角色会直接 reLaunch 回本端，死循环
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  /** 未绑定车场 → 跳绑定页选车场 */
  onBindLot() {
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load()
  },

  /** 待核销列表 → 跳到预约核销页 */
  onPendingTap() {
    wx.switchTab({ url: '/pages/owner/reservations/reservations' })
  },

  // ---- 额度调整弹窗 ----
  onOpenQuota() {
    this.setData({ quotaDialog: true, quotaInput: String(this.data.quota.total), inputInvalid: false })
  },

  onQuotaInput(e: WechatMiniprogram.Input) {
    this.setData({ quotaInput: e.detail.value, inputInvalid: false })
  },

  onCloseQuota() {
    this.setData({ quotaDialog: false })
  },

  /** 弹窗内容区点击：阻止冒泡到 mask（catchtap），本身无动作 */
  noop() {},

  async onConfirmQuota() {
    if (this.data.submitting) return
    const n = Number(this.data.quotaInput)
    if (!Number.isInteger(n) || n < 0) {
      this.setData({ inputInvalid: true })
      return
    }
    this.setData({ submitting: true })
    const r = await updateLot(this.lotId, { reservableQuota: n })
    this.setData({ submitting: false })
    if (!r.ok) {
      wx.showToast({ title: r.message || '更新失败', icon: 'none' })
      return
    }
    this.setData({ quotaDialog: false })
    wx.showToast({ title: '额度已更新', icon: 'success' })
    this.load()
  },

  // ---- 余位上报弹窗 ----
  onOpenReport() {
    this.setData({ reportDialog: true, reportInput: '', inputInvalid: false })
  },

  onReportInput(e: WechatMiniprogram.Input) {
    this.setData({ reportInput: e.detail.value, inputInvalid: false })
  },

  onCloseReport() {
    this.setData({ reportDialog: false })
  },

  async onConfirmReport() {
    if (this.data.submitting) return
    const n = Number(this.data.reportInput)
    if (!Number.isInteger(n) || n < 0) {
      this.setData({ inputInvalid: true })
      return
    }
    this.setData({ submitting: true })
    const r = await reportAvailability(this.lotId, n)
    this.setData({ submitting: false })
    if (!r.ok) {
      wx.showToast({ title: r.message || '上报失败', icon: 'none' })
      return
    }
    this.setData({ reportDialog: false })
    wx.showToast({ title: '余位已上报', icon: 'success' })
    this.load()
  },
})
