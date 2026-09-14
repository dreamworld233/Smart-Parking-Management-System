// spike-map.ts
/** 收起时露出的高度（px），保证拖拽把手可见可拖 */
const HANDLE_PEEK = 96
const SHEET_HEIGHT_RATIO = 0.6

Page({
  data: {
    lat: 36.6512,
    lng: 117.1201,
    /** 面板高度（px），由窗口高度算出，避免 vh 与硬编码偏移量对不上 */
    sheetHeight: 0,
    /** 收起状态下的 translateY（px） */
    collapsedY: 0,
    sheetY: 0,
    cardTaps: 0,
  },

  dragStartY: 0,
  dragStartSheetY: 0,

  onLoad() {
    const windowHeight = wx.getWindowInfo().windowHeight
    const sheetHeight = Math.round(windowHeight * SHEET_HEIGHT_RATIO)
    const collapsedY = Math.max(0, sheetHeight - HANDLE_PEEK)
    // 启动即为收起态，但把手露出 HANDLE_PEEK 高度
    this.setData({ sheetHeight, collapsedY, sheetY: collapsedY })
  },

  onSheetTouchStart(e: WechatMiniprogram.TouchEvent) {
    this.dragStartY = e.touches[0].clientY
    this.dragStartSheetY = this.data.sheetY
  },

  onSheetTouchMove(e: WechatMiniprogram.TouchEvent) {
    const delta = e.touches[0].clientY - this.dragStartY
    const next = Math.min(this.data.collapsedY, Math.max(0, this.dragStartSheetY + delta))
    this.setData({ sheetY: next })
  },

  onSheetTouchEnd() {
    this.snapSheet()
  },

  /** 触摸被系统取消时同样吸附，避免面板卡在半途 */
  onSheetTouchCancel() {
    this.snapSheet()
  },

  snapSheet() {
    const halfway = this.data.collapsedY / 2
    this.setData({ sheetY: this.data.sheetY < halfway ? 0 : this.data.collapsedY })
  },

  onCardTap() {
    // 验证点 4：面板上的卡片能否收到点击
    this.setData({ cardTaps: this.data.cardTaps + 1 })
  },
})
