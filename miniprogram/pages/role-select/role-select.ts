import { getRole, setRole, type Role } from '../../services/storage'
import { switchRole } from '../../services/cloud'

const HOME: Record<Role, string> = {
  driver: '/pages/home/home',
  lot_admin: '/pages/owner/dashboard/dashboard',
}

Page({
  data: {
    role: '' as Role | '',
    /** 写 DB 角色进行中：防连点 */
    entering: false,
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

  async onEnter() {
    const role = this.data.role
    if (!role || this.data.entering) {
      wx.showToast({ title: '请先选择身份', icon: 'none' })
      return
    }
    this.setData({ entering: true })
    // 身份切换要写 DB（用户 2026-09-16 拍板：不能只改本地 storage）。
    // 失败不阻塞进入对应端：本地 role 先落，DB 写失败靠后续操作自愈，
    // 但提示一声（否则 DB 一直 driver，车场端云函数会判 NO_AUTH）
    const r = await switchRole(role)
    this.setData({ entering: false })
    setRole(role)
    if (!r.ok) {
      wx.showToast({ title: '身份写入云端失败，已本地切换', icon: 'none' })
    }
    wx.reLaunch({ url: HOME[role] })
  },
})
