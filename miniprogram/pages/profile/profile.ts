import { formatPlate } from '../../domain/format'
import { clearRole, getDefaultPlate } from '../../services/storage'

Page({
  data: {
    plateText: '',
    identityText: '车主',
    navTop: 100,
  },

  onLoad() {
    const rect = wx.getMenuButtonBoundingClientRect()
    this.setData({ navTop: rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100 })
  },

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(2)
    // 车牌可能刚预约存过，每次切回重读
    const plate = getDefaultPlate()
    this.setData({ plateText: plate ? formatPlate(plate) : '未设置' })
  },

  /**
   * 切换身份 → 角色选择页。
   * 必须先清 role：role-select 的 onLoad 发现已有角色会直接 reLaunch 回原首页，
   * 不清就永远进不了选择页（从「我的」navigateTo 进去被弹回）
   */
  onSwitchRole() {
    clearRole()
    wx.navigateTo({ url: '/pages/role-select/role-select' })
  },
})
