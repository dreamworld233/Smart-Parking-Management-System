const SHEET_MIN = 0
const SHEET_MAX = 420

Page({
  data: {
    lat: 36.6512,
    lng: 117.1201,
    sheetY: SHEET_MAX,
    startY: 0,
    startSheetY: SHEET_MAX,
  },

  onSheetTouchStart(e: WechatMiniprogram.TouchEvent) {
    this.setData({ startY: e.touches[0].clientY, startSheetY: this.data.sheetY })
  },

  onSheetTouchMove(e: WechatMiniprogram.TouchEvent) {
    const delta = e.touches[0].clientY - this.data.startY
    const next = Math.min(SHEET_MAX, Math.max(SHEET_MIN, this.data.startSheetY + delta))
    this.setData({ sheetY: next })
  },

  onSheetTouchEnd() {
    // 吸附：过半则展开
    this.setData({ sheetY: this.data.sheetY < SHEET_MAX / 2 ? SHEET_MIN : SHEET_MAX })
  },
})
