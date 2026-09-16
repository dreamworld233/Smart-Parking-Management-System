import { fetchAdminLot } from '../../../services/cloud'
import { clearRole } from '../../../services/storage'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

/** 个人信息渲染快照（低频：身份与车场名不会每次切 tab 都变），TTL 放长 */
interface ProfileCache {
  lotName: string
}

/** 个人信息低频变：10 分钟内切 tab 直接用旧渲染，超过才重拉 */
const CACHE_TTL_MS = 10 * 60 * 1000

Page({
  data: {
    state: 'loading' as ViewState,
    navTop: 100,
    lotName: '',
    identityText: '车场管理员',
  },

  /** 上次成功渲染的快照（缓存命中先显示它，不闪 loading） */
  lastData: null as ProfileCache | null,
  /** 缓存落库时刻（毫秒时间戳），超 CACHE_TTL_MS 视为过期 */
  lastLoadedAt: 0,

  onLoad() {
    const rect = wx.getMenuButtonBoundingClientRect()
    this.setData({ navTop: rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100 })
  },

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(3)
    void this.load()
  },

  /**
   * 加载个人信息。缓存有效时先用缓存渲染（不闪 loading）再后台静默刷新；
   * 缓存过期或无缓存走原 loading 流程。
   */
  async load(force = false) {
    const cached = this.lastData
    if (cached && !force && Date.now() - this.lastLoadedAt < CACHE_TTL_MS) {
      this.setData({ state: 'ready', lotName: cached.lotName })
      void this.refresh(true)
      return
    }
    this.setData({ state: 'loading' })
    await this.refresh(false)
  },

  /** 拉取个人信息并更新缓存。silent 后台刷新失败静默保留缓存 */
  async refresh(silent: boolean) {
    const r = await fetchAdminLot()
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
    if (r.data.role !== 'lot_admin') {
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_role' })
      return
    }
    const lotName = r.data.lot ? r.data.lot.name : '尚未绑定车场'
    this.lastData = { lotName }
    this.lastLoadedAt = Date.now()
    this.setData({ state: 'ready', lotName })
  },

  /** 切换身份：先清 role，否则 role-select onLoad 会 reLaunch 回本端首页，进不了选择页 */
  onPickRole() {
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  onBindLot() {
    // 绑定会改车场归属，先失效缓存，回来时强制重拉
    this.lastLoadedAt = 0
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load(true)
  },
})
