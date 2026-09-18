import { fetchAdminLot } from '../../../services/cloud'
import { clearRole, getCurrentLotId, setCurrentLotId } from '../../../services/storage'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

/** 个人信息渲染快照（低频：身份与车场名不会每次切 tab 都变），TTL 放长 */
interface ProfileCache {
  lotName: string
  lotList: { id: string; name: string }[]
  currentLotId: string
}

/** 个人信息低频变：10 分钟内切 tab 直接用旧渲染，超过才重拉 */
const CACHE_TTL_MS = 10 * 60 * 1000

Page({
  data: {
    state: 'loading' as ViewState,
    navTop: 100,
    lotName: '',
    /** 名下全部车场（>1 才显示切换卡） */
    lotList: [] as { id: string; name: string }[],
    /** 当前选中的车场 id（高亮用） */
    currentLotId: '',
    /** 切换车场弹窗 */
    lotDialog: false,
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
      this.setData({ state: 'ready', lotName: cached.lotName, lotList: cached.lotList, currentLotId: cached.currentLotId })
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
      if (r.code === 'NO_AUTH') {
        this.lastData = null
        this.lastLoadedAt = 0
        if (!silent) this.setData({ state: 'no_role' })
        return
      }
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'error' })
      return
    }
    if (r.data.role !== 'lot_admin') {
      this.lastData = null
      this.lastLoadedAt = 0
      if (!silent) this.setData({ state: 'no_role' })
      return
    }
    const lots = r.data.lots
    const lotList = lots.map(l => ({ id: l._id, name: l.name }))
    // 1:N：当前车场 = storage 值，失效回退首条
    const stored = getCurrentLotId()
    const current = lots.find(l => l._id === stored) ?? lots[0] ?? null
    const lotName = current ? current.name : '尚未绑定车场'
    if (current && current._id !== stored) setCurrentLotId(current._id)
    this.lastData = { lotName, lotList, currentLotId: current ? current._id : '' }
    this.lastLoadedAt = Date.now()
    this.setData({ state: 'ready', lotName, lotList, currentLotId: current ? current._id : '' })
  },

  /** 切换身份：先清 role，否则 role-select onLoad 会 reLaunch 回本端首页，进不了选择页 */
  onPickRole() {
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  /** 打开切换车场弹窗（名下多车场才显示入口） */
  onShowLots() {
    this.setData({ lotDialog: true })
  },

  onCloseLots() {
    this.setData({ lotDialog: false })
  },

  onPickLot(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    if (id === this.data.currentLotId) {
      this.setData({ lotDialog: false })
      return
    }
    setCurrentLotId(id)
    const picked = this.data.lotList.find(l => l.id === id)
    // 同步 lastData，防下次 onShow 缓存命中回显旧车场/旧高亮
    this.lastData = { lotName: picked ? picked.name : '尚未绑定车场', lotList: this.data.lotList, currentLotId: id }
    this.setData({ lotDialog: false, currentLotId: id, lotName: picked ? picked.name : '尚未绑定车场' })
    wx.showToast({ title: '已切换车场', icon: 'success' })
  },

  noop() {},

  onBindLot() {
    // 绑定会改车场归属，先失效缓存，回来时强制重拉
    this.lastLoadedAt = 0
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load(true)
  },
})
