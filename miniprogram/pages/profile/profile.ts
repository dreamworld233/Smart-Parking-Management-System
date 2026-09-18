import { formatPlate, isValidPlate } from '../../domain/format'
import { addVehicle, clearRole, getDefaultPlate, getVehicles, removeVehicle } from '../../services/storage'

Page({
  data: {
    plateText: '',
    identityText: '车主',
    navTop: 100,
    vehicles: [] as string[],
    adding: false,
    plateInput: '',
    plateInputValid: false,
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
    this.setData({
      plateText: plate ? formatPlate(plate) : '未设置',
      vehicles: getVehicles(),
    })
  },

  onToggleAdd() {
    this.setData({ adding: !this.data.adding, plateInput: '', plateInputValid: false })
  },

  onVehicleInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value
    this.setData({ plateInput: v, plateInputValid: isValidPlate(v) })
  },

  onConfirmAdd() {
    const v = this.data.plateInput.trim()
    if (!isValidPlate(v)) {
      this.setData({ plateInputValid: false })
      wx.showToast({ title: '车牌格式不正确', icon: 'none' })
      return
    }
    const list = addVehicle(v)
    this.setData({ vehicles: list, adding: false, plateInput: '', plateText: formatPlate(getDefaultPlate()) })
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  onRemoveVehicle(e: WechatMiniprogram.TouchEvent) {
    const plate = String(e.currentTarget.dataset.plate)
    wx.showModal({
      title: '删除车辆',
      content: `确定删除 ${plate}？`,
      confirmColor: '#dc2626',
      success: res => {
        if (!res.confirm) return
        const list = removeVehicle(plate)
        // 删到最后一辆时 getDefaultPlate() 回空串，与 onShow 的兜底一致显示「未设置」
        const nextPlate = getDefaultPlate()
        this.setData({ vehicles: list, plateText: nextPlate ? formatPlate(nextPlate) : '未设置' })
      },
    })
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
