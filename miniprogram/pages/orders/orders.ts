Page({
  data: {},
  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(1)
  },
})
