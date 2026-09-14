import { getRole, setRole, type Role } from '../../services/storage'

const HOME: Record<Role, string> = {
  driver: '/pages/home/home',
  owner: '/pages/owner/dashboard/dashboard',
}

Page({
  data: {
    role: '' as Role | '',
  },

  onLoad() {
    // 已在别处选过身份时直接进各自首页（走 getRole 而不是裸读 storage，
    // 脏数据会被 getRole 挡成 null，这里就不会跳错端）
    const existing = getRole()
    if (existing) {
      wx.reLaunch({ url: HOME[existing] })
    }
  },

  onPick(e: WechatMiniprogram.TouchEvent) {
    this.setData({ role: e.currentTarget.dataset.role as Role })
  },

  onEnter() {
    const role = this.data.role
    if (!role) {
      wx.showToast({ title: '请先选择身份', icon: 'none' })
      return
    }
    setRole(role)
    wx.reLaunch({ url: HOME[role] })
  },
})
