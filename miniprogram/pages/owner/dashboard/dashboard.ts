import { formatAmount, formatTimeRangeLabel } from '../../../domain/format'
import { fetchAdminDashboard, reportAvailability, resolveCurrentLotId } from '../../../services/cloud'
import type { AdminDashboardData } from '../../../services/cloud'
import { clearRole, getCurrentLotId, setCurrentLotId } from '../../../services/storage'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

interface StatVM {
  todayReservations: string
  pendingEntry: string
  todayIncome: string
}

interface PendingItemVM {
  id: string
  plateText: string
  arriveText: string
  verifyCode: string
}

/**
 * 看板渲染快照缓存（内存，data 外的实例字段）。
 * 切 tab 回来先显示这份旧数据、后台静默刷新；不落 wx.setStorageSync —— 车场端要新鲜
 */
interface DashboardCache {
  lotId: string
  lotName: string
  lotAddress: string
  stat: StatVM
  spotsText: string
  pendingList: PendingItemVM[]
  /** 近 7 日趋势（旧→新），canvas 折线图 */
  trend: TrendPoint[]
}

/** 趋势单点。income 单位元 */
interface TrendPoint {
  date: string
  reservations: number
  income: number
}

/** 缓存有效期：60 秒内的旧数据允许先渲染，超过则走完整 loading。
 *  看板高频变（余位/额度/待核销），一分钟拉一次足够新，别用更长 */
const CACHE_TTL_MS = 60 * 1000

Page({
  data: {
    state: 'loading' as ViewState,
    lotName: '',
    lotAddress: '',
    stat: { todayReservations: '0', pendingEntry: '0', todayIncome: '¥0' } as StatVM,
    spotsText: '待上报',
    /** 待核销列表（只显示车牌 + 到达 + 核销码） */
    pendingList: [] as PendingItemVM[],
    /** 近 7 日趋势，折线图数据源 */
    trend: [] as TrendPoint[],
    /** 折线图点击浮层（点某数据点显示该日详情），null = 不显示 */
    trendTip: null as { x: number; y: number; date: string; reservations: number; incomeText: string } | null,
    // 余位上报弹窗
    reportDialog: false,
    reportInput: '',
    submitting: false,
    /** 弹窗输入非法态 */
    inputInvalid: false,
    /** 内容顶部让位（px）：胶囊下沿 + 8，刘海屏内容不被状态栏盖住 */
    navTop: 100,
  },

  /** 当前车场 id（load 成功后赋值，data 外的实例字段） */
  lotId: '',
  /** 折线图绘制参数，点击命中检测用（drawTrend 里赋值） */
  trendGeo: null as { trend: TrendPoint[]; PAD: { l: number; r: number; t: number; b: number }; pw: number; w: number; left: number } | null,
  /** 上次成功渲染的看板快照（缓存命中时先显示它，不闪 loading） */
  lastData: null as DashboardCache | null,
  /** 缓存落库时刻（毫秒时间戳），超 CACHE_TTL_MS 视为过期 */
  lastLoadedAt: 0,

  onLoad() {
    const rect = wx.getMenuButtonBoundingClientRect()
    this.setData({ navTop: rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100 })
  },

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(0)
    void this.load()
  },

  /**
   * 加载看板。缓存有效且非强制时：先用缓存渲染（state='ready'，不闪 loading），
   * 再后台静默刷新；缓存过期或无缓存走原 loading 流程。
   * force=true 用于数据已变的操作（余位上报 / 额度调整成功后）——跳过缓存强制重拉
   */
  async load(force = false) {
    const cached = this.lastData
    // 车场已在「我的」切换：旧车场缓存作废，TTL 内也不能用旧车场数据糊弄
    const lotMismatch = !!cached && cached.lotId !== getCurrentLotId()
    if (cached && !force && !lotMismatch && Date.now() - this.lastLoadedAt < CACHE_TTL_MS) {
      this.applyCache(cached)
      void this.refresh(true)
      return
    }
    this.setData({ state: 'loading' })
    await this.refresh(false)
  },

  /**
   * 拉取看板并更新缓存。
   * silent=true（缓存命中后的后台刷新）：失败静默保留缓存、不 toast；
   * silent=false：走原 loading 的错误 / no_role / no_lot 分支
   */
  async refresh(silent: boolean) {
    let cur = await resolveCurrentLotId()
    if (!cur.ok) {
      if (cur.code === 'no_auth' || cur.code === 'no_lot') {
        // 角色被撤/车场解绑是权威态：静默刷新也要清缓存，下次 onShow 不再糊弄
        this.lastData = null
        this.lastLoadedAt = 0
        if (!silent) this.setData({ state: cur.code === 'no_auth' ? 'no_role' : 'no_lot' })
        return
      }
      // error（瞬时网络/云错）：静默保留旧缓存，非静默清缓存置错误态
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'error' })
      return
    }
    let r = await fetchAdminDashboard(cur.lotId)
    if (!r.ok && (r.code === 'FORBIDDEN' || r.code === 'NOT_FOUND')) {
      // storage 里的车场被解绑/删除：清掉重解析再试一次
      setCurrentLotId('')
      cur = await resolveCurrentLotId()
      if (!cur.ok) {
        if (cur.code === 'no_auth' || cur.code === 'no_lot') {
          // 角色被撤/车场解绑是权威态：静默刷新也要清缓存，下次 onShow 不再糊弄
          this.lastData = null
          this.lastLoadedAt = 0
          if (!silent) this.setData({ state: cur.code === 'no_auth' ? 'no_role' : 'no_lot' })
          return
        }
        // error（瞬时网络/云错）：静默保留旧缓存，非静默清缓存置错误态
        if (silent) return
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: 'error' })
        return
      }
      r = await fetchAdminDashboard(cur.lotId)
    }
    if (!r.ok) {
      if (silent) return
      if (r.code === 'NO_AUTH') {
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.lot === null) {
      // 兜底：云端不该返回 null（lotId 缺失已 BAD_REQUEST），保留防御
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_lot' })
      return
    }
    const d: AdminDashboardData = r.data
    const lot = d.lot!
    const avail = lot.availability
    const spotsText =
      avail && typeof avail.freeSpots === 'number' && typeof avail.totalSpots === 'number'
        ? `${avail.freeSpots} / ${avail.totalSpots}`
        : '待上报'

    const cache: DashboardCache = {
      lotId: lot._id,
      lotName: lot.name,
      lotAddress: lot.address,
      stat: {
        todayReservations: String(d.todayReservations),
        pendingEntry: String(d.pendingEntry),
        todayIncome: formatAmount(d.todayIncome),
      },
      spotsText,
      pendingList: d.pendingList.map(x => ({
        id: x._id,
        plateText: String(x.plateNo || '--'),
        arriveText: formatTimeRangeLabel(new Date(), new Date(x.arriveTime)),
        verifyCode: String(x.verifyCode || '--'),
      })),
      // 旧云函数没 trend：兜底空数组，折线图不画、显示「暂无趋势数据」
      trend: (d.trend || []).map(x => ({
        date: String(x.date || ''),
        reservations: Number(x.reservations) || 0,
        income: Number(x.income) || 0,
      })),
    }
    this.lastData = cache
    this.lastLoadedAt = Date.now()
    this.applyCache(cache)
  },

  /** 把（缓存的）渲染快照落到 data。lotId 依赖 load 成功赋值，缓存命中分支也要正确设置 */
  applyCache(c: DashboardCache) {
    this.lotId = c.lotId
    this.setData(
      {
        state: 'ready',
        lotName: c.lotName,
        lotAddress: c.lotAddress,
        stat: c.stat,
        spotsText: c.spotsText,
        pendingList: c.pendingList,
        trend: c.trend,
      },
      // setData 回调里 canvas 节点刚可用，此时 query 尺寸才拿得到
      () => this.drawTrend(c.trend),
    )
  },

  /**
   * 近 7 日趋势折线图（canvas 2d）。两条线各自归一化到各自最大值：
   * 预约数（个位~几十）与收入（几十~几百元）量级差太多，共用刻度会压成一条线。
   * 左侧只标收入 0/max，预约数靠图例区分颜色。
   */
  drawTrend(trend: TrendPoint[]) {
    const query = this.createSelectorQuery()
    query
      .select('#trendChart')
      .fields({ node: true, size: true, rect: true })
      .exec(res => {
        const f = res && res[0]
        const node = f && (f.node as WechatMiniprogram.Canvas | undefined)
        const w = f && (f.width as number)
        const h = f && (f.height as number)
        if (!node || !w || !h) return
        const dpr = wx.getWindowInfo().pixelRatio || 2
        node.width = w * dpr
        node.height = h * dpr
        const ctx = node.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, w, h)

        const PAD = { l: 44, r: 12, t: 16, b: 28 }
        const pw = w - PAD.l - PAD.r
        const ph = h - PAD.t - PAD.b
        if (pw <= 0 || ph <= 0) return

        // 命中检测需要同样的几何参数：存下来供 onTrendTap 用（left = canvas 相对页面左侧，clientX 换算用）
        this.trendGeo = { trend, PAD, pw, w, left: f.left || 0 }

        // 空数据：画空网格即可，文案由 wxml 的 trend__empty 盖在上面
        if (!trend.length) {
          this.drawGrid(ctx, PAD, pw, ph, [])
          return
        }

        const maxInc = Math.max(...trend.map(p => p.income), 0.0001)
        const maxRes = Math.max(...trend.map(p => p.reservations), 0.0001)
        const xAt = (i: number) => PAD.l + (trend.length === 1 ? pw / 2 : (i * pw) / (trend.length - 1))
        const yInc = (v: number) => PAD.t + ph - (v / maxInc) * ph
        const yRes = (v: number) => PAD.t + ph - (v / maxRes) * ph

        // 网格 + 收入刻度（左轴标 0 与 max）
        this.drawGrid(ctx, PAD, pw, ph, trend.map(p => p.date))
        ctx.fillStyle = '#94a3b8'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText('0', PAD.l - 6, PAD.t + ph)
        ctx.fillText(this.incomeLabel(maxInc), PAD.l - 6, PAD.t + 2)

        this.drawSeries(ctx, trend, xAt, p => p.reservations, yRes, '#2563eb')
        this.drawSeries(ctx, trend, xAt, p => p.income, yInc, '#f59e0b')

        // x 轴日期标签（只画首/中/末，7 个全画会挤）
        ctx.fillStyle = '#94a3b8'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        const labelIdx = [0, Math.floor((trend.length - 1) / 2), trend.length - 1]
        labelIdx.forEach(i => {
          ctx.fillText(trend[i].date, xAt(i), PAD.t + ph + 8)
        })
      })
  },

  /**
   * 折线图点击：命中最近数据点（水平距离 < 24px 才算），在画布上方弹浮层显示该日详情。
   * 再点空白处关闭。tip 用相对 .trend 容器的 px 定位——canvas 占满容器同宽同起点，
   * canvas 内坐标就是容器内坐标
   */
  onTrendTap(e: WechatMiniprogram.TouchEvent) {
    const geo = this.trendGeo
    if (!geo || geo.trend.length === 0) return
    // 触摸点相对页面 → 相对 canvas：TouchDetail 给 clientX（页面可视区），减 canvas 左侧偏移
    const clientX = (e.detail as { clientX: number }).clientX
    if (typeof clientX !== 'number') return
    const x = clientX - geo.left

    const { trend, PAD, pw, w } = geo
    const xAt = (i: number) => PAD.l + (trend.length === 1 ? pw / 2 : (i * pw) / (trend.length - 1))

    let best = -1
    let bestD = Infinity
    for (let i = 0; i < trend.length; i++) {
      const d = Math.abs(xAt(i) - x)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best < 0 || bestD > 24) {
      // 点空白：关闭浮层
      if (this.data.trendTip) this.setData({ trendTip: null })
      return
    }
    const p = trend[best]
    const px = xAt(best)
    const tipW = Math.min(190, w * 0.5)
    const left = Math.max(4, Math.min(px + 12, w - tipW - 4))
    this.setData({
      trendTip: {
        x: left,
        y: 4,
        date: p.date,
        reservations: p.reservations,
        incomeText: formatAmount(p.income),
      },
    })
  },

  /** 收入刻度文案：>= 100 省小数（¥120），否则一位小数（¥3.5） */
  incomeLabel(v: number): string {
    const yuan = v >= 100 ? Math.round(v) : Math.round(v * 10) / 10
    return `¥${yuan}`
  },

  /** 水平网格 + 底部 x 轴底线 */
  drawGrid(
    ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
    PAD: { l: number; r: number; t: number; b: number },
    pw: number,
    ph: number,
    labels: string[],
  ) {
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (ph * i) / 4
      ctx.beginPath()
      ctx.moveTo(PAD.l, y)
      ctx.lineTo(PAD.l + pw, y)
      ctx.stroke()
    }
    ctx.setLineDash([])
    if (labels.length > 0) {
      ctx.beginPath()
      ctx.moveTo(PAD.l, PAD.t + ph)
      ctx.lineTo(PAD.l + pw, PAD.t + ph)
      ctx.stroke()
    }
  },

  /** 画一条折线 + 数据点。valOf 取该系列的值（预约数 or 收入），yOf 做归一化 */
  drawSeries(
    ctx: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
    trend: TrendPoint[],
    xAt: (i: number) => number,
    valOf: (p: TrendPoint) => number,
    yOf: (v: number) => number,
    color: string,
  ) {
    const ys = trend.map(p => yOf(valOf(p)))
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ys.forEach((y, i) => {
      const x = xAt(i)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    // 数据点
    ys.forEach((y, i) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(xAt(i), y, 3, 0, Math.PI * 2)
      ctx.fill()
    })
  },

  onPickRole() {
    // 必须清 role：role-select onLoad 发现已有角色会直接 reLaunch 回本端，死循环
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  /** 未绑定车场 → 跳绑定页选车场。绑定会改 lot 归属，先失效缓存，回来时强制重拉 */
  onBindLot() {
    this.lastLoadedAt = 0
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load(true)
  },

  /** 待核销列表 → 跳到预约核销页 */
  onPendingTap() {
    wx.switchTab({ url: '/pages/owner/reservations/reservations' })
  },

  // ---- 额度调整弹窗 ----
  /** 弹窗内容区点击：阻止冒泡到 mask（catchtap），本身无动作 */
  noop() {},

  // ---- 余位上报弹窗 ----
  onOpenReport() {
    this.setData({ reportDialog: true, reportInput: '', inputInvalid: false })
  },

  onReportInput(e: WechatMiniprogram.Input) {
    this.setData({ reportInput: e.detail.value, inputInvalid: false })
  },

  onCloseReport() {
    this.setData({ reportDialog: false })
  },

  async onConfirmReport() {
    if (this.data.submitting) return
    const n = Number(this.data.reportInput)
    if (!Number.isInteger(n) || n < 0) {
      this.setData({ inputInvalid: true })
      return
    }
    this.setData({ submitting: true })
    const r = await reportAvailability(this.lotId, n)
    this.setData({ submitting: false })
    if (!r.ok) {
      wx.showToast({ title: r.message || '上报失败', icon: 'none' })
      return
    }
    this.setData({ reportDialog: false })
    wx.showToast({ title: '余位已上报', icon: 'success' })
    this.load(true)
  },
})
