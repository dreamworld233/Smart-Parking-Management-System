import { fetchAdminLot } from '../../../services/cloud'

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

  onPickRole() {
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  onRetry() {
    this.load()
  },
})
