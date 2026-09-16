import { bindLot, listAllLots } from '../../../services/cloud'

type ViewState = 'loading' | 'ready' | 'error'

Page({
  data: {
    state: 'loading' as ViewState,
    /** 车场列表（已被别人绑的标记出来） */
    lots: [] as { id: string; name: string; address: string; boundByOther: boolean }[],
    binding: false,
    navTop: 100,
    /** 内容区顶部让位（px）：navTop + 顶栏高 + 间距，标题文字不压内容 */
    bodyTop: 100,
  },

  onLoad() {
    // 与 confirm 页同一套 px 口径：胶囊下沿 + 8 是顶栏 top，内容区再让出顶栏自身高
    const info = wx.getWindowInfo()
    const rpx = info.windowWidth / 750
    const rect = wx.getMenuButtonBoundingClientRect()
    const navTop = rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100
    this.setData({ navTop, bodyTop: navTop + Math.round(80 * rpx) + Math.round(16 * rpx) })
    this.load()
  },

  async load() {
    this.setData({ state: 'loading' })
    const r = await listAllLots()
    if (!r.ok) {
      this.setData({ state: 'error' })
      return
    }
    this.setData({
      state: 'ready',
      lots: r.data.list.map(x => ({
        id: x._id,
        name: x.name,
        address: x.address,
        boundByOther: !!x.adminUserId,
      })),
    })
  },

  onRetry() {
    this.load()
  },

  onBack() {
    wx.navigateBack()
  },

  async onBind(e: WechatMiniprogram.TouchEvent) {
    if (this.data.binding) return
    const id = e.currentTarget.dataset.id
    const lot = this.data.lots.find(l => l.id === id)
    if (!lot) return
    if (lot.boundByOther) {
      wx.showToast({ title: '该车场已被其他管理员绑定', icon: 'none' })
      return
    }
    this.setData({ binding: true })
    const r = await bindLot(id)
    this.setData({ binding: false })
    if (!r.ok) {
      wx.showToast({ title: r.message || '绑定失败', icon: 'none' })
      return
    }
    wx.showToast({ title: '已绑定', icon: 'success' })
    // 绑定成功回车场端首页
    wx.reLaunch({ url: '/pages/owner/dashboard/dashboard' })
  },
})
