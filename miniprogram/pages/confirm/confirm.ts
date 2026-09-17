import { bookableSpots, formatAmount, formatTimeRangeLabel, isValidPlate } from '../../domain/format'
import { quoteTotal } from '../../domain/pricing'
import type { Quote } from '../../domain/pricing'
import { buildArrivalOptions, enterDeadline, isWithinWindow } from '../../domain/time'
import type { ArrivalOption } from '../../domain/time'
import { createReservation } from '../../services/cloud'
import { fetchLotById } from '../../services/lot'
import { getDefaultPlate, setDefaultPlate } from '../../services/storage'

type ViewState = 'loading' | 'ready' | 'error'

interface LotBrief {
  id: string
  name: string
  address: string
  firstHour: number
  /** 可约余位 = freeSpots − reservedCount；null = 余位未上报 */
  bookable: number | null
}

/**
 * 预约确认页。入参 lotId；到达时刻 chips + 车牌 + 试算 + 模拟支付。
 *
 * 时钟一致性约束（UI 稿 §5.4）：所有时刻计算以选中的 `ArrivalOption.builtAt`
 * 为基准，**不得重新读时钟** —— chips 生成几秒后，重新 `new Date()` 去试算
 * 会让首档「现在」被判成已过期。先 `isWithinWindow` 再计费，被拒档不进计费。
 */
Page({
  data: {
    state: 'loading' as ViewState,
    lot: null as LotBrief | null,
    options: [] as ArrivalOption[],
    selectedIdx: 0,
    plate: '',
    plateValid: false,
    quote: null as Quote | null,
    /** 入场截止时刻的展示文案（含日期，跨天不写错） */
    deadlineText: '',
    /** 首小时单价，格式化后的展示串 */
    firstHourText: '',
    /** 试算三笔 + 合计的展示串 */
    parkingText: '',
    serviceText: '',
    totalText: '',
    submitting: false,
    /** 导航栏 top（px），胶囊下沿推算，避免返回键钻进胶囊下面 */
    navTop: 100,
    /** 内容区顶部让位（px）：navTop + 顶栏高 + 间距，标题文字不压内容 */
    bodyTop: 100,
    /** 吸底确认栏 bottom（px）：tabBar 高度 + 安全区，别压在 tabBar 下面 */
    payBottom: 100,
    /** 内容区底部让位（px）：paybar 偏移 + 栏自身高，最后一张卡不被吸底栏盖住 */
    bodyBottom: 100,
  },

  lotId: '',

  onLoad(options: Record<string, string | undefined>) {
    this.lotId = options.lotId ?? ''
    // 与 home/search 同套路：胶囊下沿 + 8px，取不到时退回 100px
    const info = wx.getWindowInfo()
    const rpx = info.windowWidth / 750
    const rect = wx.getMenuButtonBoundingClientRect()
    const navTop = rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100
    // 内容区顶部 = 顶栏下沿 + 间距（与 search 页同一套 px 口径，避免标题压内容）
    const bodyTop = navTop + Math.round(80 * rpx) + Math.round(16 * rpx)
    this.setData({ navTop, bodyTop })
    const safeBottom = info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0
    // confirm 页非 tabBar 页（从详情 navigateTo 进入），吸底栏贴屏幕底 + 安全区即可
    // bodyBottom = 栏底部偏移 + 栏自身高（约 112rpx，按钮+内边距），与 wxss .paybar 高度对应
    const payBottom = Math.round(safeBottom + 16 * rpx)
    this.setData({ payBottom, bodyBottom: Math.round(payBottom + 112 * rpx) })
    if (!this.lotId) {
      this.setData({ state: 'error' })
      return
    }
    this.load()
  },

  async load() {
    this.setData({ state: 'loading' })
    try {
      const lot = await fetchLotById(this.lotId)
      if (!lot || !lot.pricing) {
        this.setData({ state: 'error' })
        return
      }
      const firstHour = lot.pricing.firstHour
      const raw = buildArrivalOptions(new Date())
      if (raw.length === 0) {
        // 极端情况：时钟坏了拿不到合法 now。不给选项页面没有意义，直接错误态
        this.setData({ state: 'error' })
        return
      }
      // 给每档补上时钟时刻展示（领域层只给偏移量与标签，不读时钟）
      const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n))
      const options = raw.map(o => ({
        ...o,
        timeLabel: `${pad2(o.time.getHours())}:${pad2(o.time.getMinutes())}`,
      }))
      this.setData({
        state: 'ready',
        lot: {
          id: lot.id,
          name: lot.name,
          address: lot.address,
          firstHour,
          // 可约余位 = 物理余位 − 待入场预约数；freeSpots 未上报 → null（页面显示「待上报」）
          bookable: lot.availability ? bookableSpots(lot.availability.freeSpots, lot.reservedCount) : null,
        },
        options,
        firstHourText: formatAmount(firstHour),
        // 预填最近一次车牌：记住功能是既有设计（storage 早就有），新用户留空
        plate: getDefaultPlate(),
        plateValid: isValidPlate(getDefaultPlate()),
      })
      this.recompute(0)
    } catch {
      this.setData({ state: 'error' })
    }
  },

  /** 重算试算结果。一切时刻以选中档的 builtAt 为基准，不重新读时钟 */
  recompute(selectedIdx: number) {
    const opt = this.data.options[selectedIdx]
    const lot = this.data.lot
    if (!opt || !lot) return
    // 顺序必须是先判窗口再计费：被拒档（理论上不该出现，生成即合法）不进计费
    if (!isWithinWindow(opt.builtAt, opt.time)) return
    const quote = quoteTotal(opt.builtAt, opt.time, lot.firstHour)
    this.setData({
      selectedIdx,
      quote,
      parkingText: formatAmount(quote.prepaidParkingFee),
      serviceText: formatAmount(quote.serviceFee),
      totalText: formatAmount(quote.totalAmount),
      // 入场截止 = 到达 + 宽限期，展示用「今天/明天 HH:mm」跨天正确
      deadlineText: formatTimeRangeLabel(opt.builtAt, enterDeadline(opt.time)),
    })
  },

  onChipTap(e: WechatMiniprogram.TouchEvent) {
    const idx = Number(e.currentTarget.dataset.idx)
    if (Number.isInteger(idx) && idx >= 0 && idx < this.data.options.length) {
      this.recompute(idx)
    }
  },

  onPlateInput(e: WechatMiniprogram.Input) {
    // 输入时实时校验；提交时再验一次（校验是纯函数，两端都有）
    const plate = e.detail.value
    this.setData({ plate, plateValid: isValidPlate(plate) })
  },

  onPay() {
    if (this.data.submitting) return
    const { lot, quote, options, selectedIdx, plateValid } = this.data
    if (!lot || !quote || !options[selectedIdx]) return
    if (!plateValid) {
      wx.showToast({ title: '请输入正确的车牌号', icon: 'none' })
      return
    }
    const totalText = formatAmount(quote.totalAmount)
    wx.showModal({
      // 模拟支付必须标注清楚：真实支付通道未接入，这里不产生任何扣款
      title: '模拟支付',
      content: `确认支付 ¥${totalText}？本次为模拟支付，不产生真实扣款。`,
      confirmText: '确认支付',
      success: res => {
        if (!res.confirm) return
        void this.submit(selectedIdx)
      },
    })
  },

  async submit(selectedIdx: number) {
    const { lot, plate } = this.data
    const opt = this.data.options[selectedIdx]
    if (!lot || !opt) return
    // 客户端预判可约余位：未上报 / 已约满直接拦下，不发单（服务端 LOT_FULL 仍兜底并发窗口）
    if (lot.bookable === null || lot.bookable <= 0) {
      wx.showToast({
        title: lot.bookable === null ? '车场余位未上报，暂不可预约' : '可预约车位已满，请换一家或稍后再试',
        icon: 'none',
      })
      return
    }
    this.setData({ submitting: true })
    const r = await createReservation({
      lotId: lot.id,
      arriveAt: opt.time.getTime(),
      plateNo: plate,
    })
    if (r.ok) {
      // 记住这次车牌，下次预约预填
      setDefaultPlate(plate)
      wx.showToast({ title: '支付成功（模拟）', icon: 'success' })
      // 跳订单页：详情视图在 Task 4 落地，先到列表
      setTimeout(() => wx.switchTab({ url: '/pages/orders/orders' }), 800)
      return
    }
    this.setData({ submitting: false })
    if (r.code === 'LOT_FULL') {
      wx.showModal({ title: '车位已满', content: '可预约车位已满，请换一家或稍后再试', showCancel: false })
      return
    }
    wx.showToast({ title: r.message || '下单失败', icon: 'none' })
  },

  onRetry() {
    this.load()
  },

  onBack() {
    wx.navigateBack()
  },
})
