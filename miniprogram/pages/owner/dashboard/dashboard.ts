import { fetchAdminLot } from '../../../services/cloud'
import type { AdminLot } from '../../../services/cloud'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

Page({
  data: {
    state: 'loading' as ViewState,
    lot: null as AdminLot | null,
  },

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(0)
    // 切回时重新拉：身份/绑定可能在「我的」里变过
    void this.load()
  },

  async load() {
    this.setData({ state: 'loading' })
    const r = await fetchAdminLot()
    if (!r.ok) {
      // 云函数返回 NO_AUTH（非 lot_admin）和网络错误不好区分，这里统一进错误态 + 重试
      this.setData({ state: 'error' })
      return
    }
    if (r.data.role !== 'lot_admin') {
      // 普通车主切进了车场端 tab：回角色页重新选
      this.setData({ state: 'no_role' })
      return
    }
    if (!r.data.lot) {
      this.setData({ state: 'no_lot' })
      return
    }
    this.setData({ state: 'ready', lot: r.data.lot })
  },

  onPickRole() {
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  onRetry() {
    this.load()
  },
})
