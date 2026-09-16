import { bindLot, listAllLots } from '../../../services/cloud'

type ViewState = 'loading' | 'ready' | 'error'

Page({
  data: {
    state: 'loading' as ViewState,
    /** 车场列表（已被别人绑的标记出来） */
    lots: [] as { id: string; name: string; address: string; boundByOther: boolean }[],
    binding: false,
    navTop: 100,
  },

  onLoad() {
    const rect = wx.getMenuButtonBoundingClientRect()
    this.setData({ navTop: rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100 })
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
