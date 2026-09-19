import { formatAmount, formatTimeRangeLabel } from '../../../domain/format'
import { fetchAdminDashboard, reportAvailability, resolveCurrentLotId } from '../../../services/cloud'
import type { AdminDashboardData } from '../../../services/cloud'
import { clearRole, getCurrentLotId, setCurrentLotId } from '../../../services/storage'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

interface StatVM {
  todayReservations: string
  pendingEntry: string
  todayIncome: string
}

interface PendingItemVM {
  id: string
  plateText: string
  arriveText: string
  verifyCode: string
}

/**
 * 看板渲染快照缓存（内存，data 外的实例字段）。
 * 切 tab 回来先显示这份旧数据、后台静默刷新；不落 wx.setStorageSync —— 车场端要新鲜
 */
interface DashboardCache {
  lotId: string
  lotName: string
  lotAddress: string
  stat: StatVM
  spotsText: string
  pendingList: PendingItemVM[]
}

/** 缓存有效期：60 秒内的旧数据允许先渲染，超过则走完整 loading。
 *  看板高频变（余位/额度/待核销），一分钟拉一次足够新，别用更长 */
const CACHE_TTL_MS = 60 * 1000

Page({
  data: {
    state: 'loading' as ViewState,
    lotName: '',
    lotAddress: '',
    stat: { todayReservations: '0', pendingEntry: '0', todayIncome: '¥0' } as StatVM,
    spotsText: '待上报',
    /** 待核销列表（只显示车牌 + 到达 + 核销码） */
    pendingList: [] as PendingItemVM[],
    // 余位上报弹窗
    reportDialog: false,
    reportInput: '',
    submitting: false,
    /** 弹窗输入非法态 */
    inputInvalid: false,
    /** 内容顶部让位（px）：胶囊下沿 + 8，刘海屏内容不被状态栏盖住 */
    navTop: 100,
  },

  /** 当前车场 id（load 成功后赋值，data 外的实例字段） */
  lotId: '',
  /** 上次成功渲染的看板快照（缓存命中时先显示它，不闪 loading） */
  lastData: null as DashboardCache | null,
  /** 缓存落库时刻（毫秒时间戳），超 CACHE_TTL_MS 视为过期 */
  lastLoadedAt: 0,

  onLoad() {
    const rect = wx.getMenuButtonBoundingClientRect()
    this.setData({ navTop: rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100 })
  },

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(0)
    void this.load()
  },

  /**
   * 加载看板。缓存有效且非强制时：先用缓存渲染（state='ready'，不闪 loading），
   * 再后台静默刷新；缓存过期或无缓存走原 loading 流程。
   * force=true 用于数据已变的操作（余位上报 / 额度调整成功后）——跳过缓存强制重拉
   */
  async load(force = false) {
    const cached = this.lastData
    // 车场已在「我的」切换：旧车场缓存作废，TTL 内也不能用旧车场数据糊弄
    const lotMismatch = !!cached && cached.lotId !== getCurrentLotId()
    if (cached && !force && !lotMismatch && Date.now() - this.lastLoadedAt < CACHE_TTL_MS) {
      this.applyCache(cached)
      void this.refresh(true)
      return
    }
    this.setData({ state: 'loading' })
    await this.refresh(false)
  },

  /**
   * 拉取看板并更新缓存。
   * silent=true（缓存命中后的后台刷新）：失败静默保留缓存、不 toast；
   * silent=false：走原 loading 的错误 / no_role / no_lot 分支
   */
  async refresh(silent: boolean) {
    let cur = await resolveCurrentLotId()
    if (!cur.ok) {
      if (cur.code === 'no_auth' || cur.code === 'no_lot') {
        // 角色被撤/车场解绑是权威态：静默刷新也要清缓存，下次 onShow 不再糊弄
        this.lastData = null
        this.lastLoadedAt = 0
        if (!silent) this.setData({ state: cur.code === 'no_auth' ? 'no_role' : 'no_lot' })
        return
      }
      // error（瞬时网络/云错）：静默保留旧缓存，非静默清缓存置错误态
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'error' })
      return
    }
    let r = await fetchAdminDashboard(cur.lotId)
    if (!r.ok && (r.code === 'FORBIDDEN' || r.code === 'NOT_FOUND')) {
      // storage 里的车场被解绑/删除：清掉重解析再试一次
      setCurrentLotId('')
      cur = await resolveCurrentLotId()
      if (!cur.ok) {
        if (cur.code === 'no_auth' || cur.code === 'no_lot') {
          // 角色被撤/车场解绑是权威态：静默刷新也要清缓存，下次 onShow 不再糊弄
          this.lastData = null
          this.lastLoadedAt = 0
          if (!silent) this.setData({ state: cur.code === 'no_auth' ? 'no_role' : 'no_lot' })
          return
        }
        // error（瞬时网络/云错）：静默保留旧缓存，非静默清缓存置错误态
        if (silent) return
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: 'error' })
        return
      }
      r = await fetchAdminDashboard(cur.lotId)
    }
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
      // 兜底：云端不该返回 null（lotId 缺失已 BAD_REQUEST），保留防御
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_lot' })
      return
    }
    const d: AdminDashboardData = r.data
    const lot = d.lot!
    const avail = lot.availability
    const spotsText =
      avail && typeof avail.freeSpots === 'number' && typeof avail.totalSpots === 'number'
        ? `${avail.freeSpots} / ${avail.totalSpots}`
        : '待上报'

    const cache: DashboardCache = {
      lotId: lot._id,
      lotName: lot.name,
      lotAddress: lot.address,
      stat: {
        todayReservations: String(d.todayReservations),
        pendingEntry: String(d.pendingEntry),
        todayIncome: formatAmount(d.todayIncome),
      },
      spotsText,
      pendingList: d.pendingList.map(x => ({
        id: x._id,
        plateText: String(x.plateNo || '--'),
        arriveText: formatTimeRangeLabel(new Date(), new Date(x.arriveTime)),
        verifyCode: String(x.verifyCode || '--'),
      })),
    }
    this.lastData = cache
    this.lastLoadedAt = Date.now()
    this.applyCache(cache)
  },

  /** 把（缓存的）渲染快照落到 data。lotId 依赖 load 成功赋值，缓存命中分支也要正确设置 */
  applyCache(c: DashboardCache) {
    this.lotId = c.lotId
    this.setData({
      state: 'ready',
      lotName: c.lotName,
      lotAddress: c.lotAddress,
      stat: c.stat,
      spotsText: c.spotsText,
      pendingList: c.pendingList,
    })
  },

  onPickRole() {
    // 必须清 role：role-select onLoad 发现已有角色会直接 reLaunch 回本端，死循环
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  /** 未绑定车场 → 跳绑定页选车场。绑定会改 lot 归属，先失效缓存，回来时强制重拉 */
  onBindLot() {
    this.lastLoadedAt = 0
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load(true)
  },

  /** 待核销列表 → 跳到预约核销页 */
  onPendingTap() {
    wx.switchTab({ url: '/pages/owner/reservations/reservations' })
  },

  // ---- 额度调整弹窗 ----
  /** 弹窗内容区点击：阻止冒泡到 mask（catchtap），本身无动作 */
  noop() {},

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
    this.load(true)
  },
})
