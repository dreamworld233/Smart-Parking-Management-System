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

/**
 * 预约列表渲染快照缓存（内存，data 外的实例字段）。
 * 切 tab 回来先显示这份旧数据、后台静默刷新；不落 wx.setStorageSync —— 车场端要新鲜
 */
interface ReservationCache {
  lotId: string
  cards: CardVM[]
}

/** 缓存有效期：60 秒内的旧数据允许先渲染，超过则走完整 loading。
 *  预约列表高频变（核销/取消/超时释放），一分钟拉一次足够新 */
const CACHE_TTL_MS = 60 * 1000

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
    navTop: 100,
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
  /** 上次成功渲染的列表快照（缓存命中时先显示它，不闪 loading） */
  lastData: null as ReservationCache | null,
  /** 缓存落库时刻（毫秒时间戳），超 CACHE_TTL_MS 视为过期 */
  lastLoadedAt: 0,

  onLoad() {
    const rect = wx.getMenuButtonBoundingClientRect()
    this.setData({ navTop: rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100 })
  },

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(1)
    // 从看板「待核销」跳来、核销完返回：缓存命中先渲染旧数据，后台静默刷新
    void this.load()
  },

  /**
   * 加载预约列表。缓存有效且非强制时：先用缓存渲染（state='ready'，不闪 loading），
   * 再后台静默刷新；缓存过期或无缓存走原 loading 流程。
   * force=true 用于核销成功等数据已变的操作——跳过缓存强制重拉
   */
  async load(force = false) {
    const cached = this.lastData
    if (cached && !force && Date.now() - this.lastLoadedAt < CACHE_TTL_MS) {
      this.applyCache(cached)
      void this.refresh(true)
      return
    }
    this.setData({ state: 'loading' })
    await this.refresh(false)
  },

  /**
   * 拉取预约列表并更新缓存。
   * silent=true（缓存命中后的后台刷新）：失败静默保留缓存、不 toast；
   * silent=false：走原 loading 的错误 / no_role / no_lot 分支
   */
  async refresh(silent: boolean) {
    const r = await fetchAdminReservations()
    if (!r.ok) {
      if (silent) return
      if (r.code === 'NO_AUTH') {
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.lot === null) {
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_lot' })
      return
    }
    const now = new Date()
    const cache: ReservationCache = {
      lotId: r.data.lot._id,
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
    }
    this.lastData = cache
    this.lastLoadedAt = Date.now()
    this.applyCache(cache)
  },

  /** 把（缓存的）渲染快照落到 data。lotId 依赖 load 成功赋值，缓存命中分支也要正确设置 */
  applyCache(c: ReservationCache) {
    this.lotId = c.lotId
    this.setData({ state: 'ready', cards: c.cards })
  },

  onPickRole() {
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  onBindLot() {
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load(true)
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
    this.load(true)
  },

  noop() {},
})
