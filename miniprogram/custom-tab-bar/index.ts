import { getRole, type Role } from '../services/storage'

interface TabItem {
  pagePath: string
  text: string
  icon: string
}

const TABS: Record<Role, TabItem[]> = {
  driver: [
    { pagePath: '/pages/home/home', text: '首页', icon: '◉' },
    { pagePath: '/pages/orders/orders', text: '订单', icon: '▤' },
    { pagePath: '/pages/profile/profile', text: '我的', icon: '◍' },
  ],
  owner: [
    { pagePath: '/pages/owner/dashboard/dashboard', text: '看板', icon: '◉' },
    { pagePath: '/pages/owner/reservations/reservations', text: '预约', icon: '▤' },
    { pagePath: '/pages/owner/lot/lot', text: '车场', icon: '▦' },
    { pagePath: '/pages/owner/profile/profile', text: '我的', icon: '◍' },
  ],
}

Component({
  data: {
    role: 'driver' as Role,
    list: TABS.driver,
    selected: 0,
  },

  attached() {
    const role = getRole() ?? 'driver'
    this.setData({ role, list: TABS[role] })
  },

  methods: {
    /** 由页面在 onShow 中调用，同步高亮项 */
    setSelected(index: number) {
      this.setData({ selected: index })
    },

    onTap(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index)
      const url = this.data.list[index].pagePath
      if (index === this.data.selected) return
      wx.switchTab({ url })
    },
  },
})
