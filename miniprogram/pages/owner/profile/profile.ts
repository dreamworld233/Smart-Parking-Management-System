import { fetchAdminLot } from '../../../services/cloud'
import { clearRole } from '../../../services/storage'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

Page({
  data: {
    state: 'loading' as ViewState,
    lotName: '',
    identityText: '车场管理员',
  },

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(3)
    void this.load()
  },

  async load() {
    this.setData({ state: 'loading' })
    const r = await fetchAdminLot()
    if (!r.ok) {
      if (r.code === 'NO_AUTH') {
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.role !== 'lot_admin') {
      this.setData({ state: 'no_role' })
      return
    }
    this.setData({
      state: 'ready',
      lotName: r.data.lot ? r.data.lot.name : '尚未绑定车场',
    })
  },

  /** 切换身份：先清 role，否则 role-select onLoad 会 reLaunch 回本端首页，进不了选择页 */
  onPickRole() {
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  onRetry() {
    this.load()
  },
})
