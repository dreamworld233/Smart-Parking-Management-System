import type { ParkingLot, SortKey } from './types'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * 排序维度的文案。放在领域层而不是组件里：排序 chips 与首页的
 * 「已按 X 排序」提示是同一份事实，各写一份必然有一处先漂移
 */
export const SORT_LABELS: Record<SortKey, { short: string; long: string }> = {
  composite: { short: '综合', long: '综合推荐' },
  distance: { short: '距离', long: '距离最近' },
  fee: { short: '价格', long: '费用最低' },
  availability: { short: '空位', long: '空位最多' },
}

/**
 * 数据来源标注（数据模型设计稿 §3：每个字段必须能回答「从哪来」）。
 *
 * 返回数组而不是拼好的整句：不同来源对应不同语义（实测/公示/声明/待上报），
 * 混成一句「部分数据为估算」会把公示价也说成估算。
 * 空数组 = 没有要标的，调用方不渲染标签区
 */
export function sourceNotes(lot: ParkingLot): string[] {
  const notes: string[] = []
  // 未签约：没有价格/余位/额度任何数据，只有名称位置距离是真实的（来自腾讯 POI 检索）。
  // 与其逐条标「无数据」，不如一句说清它是什么，别让用户把「未签约」看成「签约但没数据」
  if (!lot.signed) {
    notes.push('未签约，暂不开放预约，可导航前往')
    if (lot.distanceSource === 'estimated') notes.push('距离为估算')
    return notes
  }
  if (lot.distanceSource === 'estimated') notes.push('距离为估算')
  if (lot.pricing?.source === 'public') notes.push('收费来源于车场公示价')
  else if (lot.pricing?.source === 'ops') notes.push('收费为运营声明')
  else if (lot.pricing?.source === 'estimated') notes.push('收费为估算')

  // 总车位数只在是示例值时才标注：真实值标出来只是噪音，编的值不标就是骗人。
  // 与价格同为暂定时合成一条 —— 卡片上一家公司挂两行「示例数据」太挤。
  // **只在两者都是暂定时才合**：核到价格而车位还没核到时，写成「价格与车位」
  // 会把真价格说成编的，这句本身就是假话
  const pricePlaceholder = lot.pricing?.source === 'placeholder'
  const spotsPlaceholder = lot.availability?.source === 'placeholder'
  if (pricePlaceholder && spotsPlaceholder) notes.push('价格与车位为示例数据，待核实')
  else if (pricePlaceholder) notes.push('价格为示例数据，待核实')
  else if (spotsPlaceholder) notes.push('车位数为示例数据，待核实')

  if (lot.availability?.freeSpots === null) notes.push('余位待车场上报')
  return notes
}

/**
 * 定位失败 / 被拒时的兜底提示（首页把远端的兜底点当定位点用，必须说出来，
 * 否则用户会以为自己就站在那批车场旁边）。
 *
 * 两种失败分开说：被拒要去设置页开授权，定位服务失败要去查手机的定位开关，
 * 合成一句「定位不可用」两边都指不到路 —— 这正是 getCurrentPoint 要把
 * reason 分出来的原因。
 * `placeName` 由调用方传（兜底点定义在 config.ts），领域层不认具体是哪个城市
 */
export function fallbackNotice(reason: 'denied' | 'failed', placeName: string): string {
  return reason === 'denied'
    ? `未开启定位，默认显示${placeName}周边`
    : `定位失败，默认显示${placeName}周边`
}

/**
 * **搜索页**的定位提示。与 `fallbackNotice` 分家而不是复用，因为两页里定位的
 * 作用根本不同：首页没有定位就换一批数据（改成兜底点周边），搜索页显示的始终是
 * **用户输入的目的地**周边的车场，定位只参与「同名地点谁排前面」这一个排序提示。
 * 照抄首页那句「默认显示合肥大学周边」会与实际画面不符 —— 用户没搜合肥大学也照样看到它
 */
export function searchLocationNotice(reason: 'denied' | 'failed'): string {
  return reason === 'denied'
    ? '未开启定位，无法优先显示离您近的地点'
    : '定位失败，无法优先显示离您近的地点'
}

/** 数据缺失时的统一占位。0 与「未知」语义不同，不可混用 */
const UNKNOWN = '--'

export function formatDistance(meters: number): string {
  // 缺守卫时 NaN 会一路渲染成「NaNkm」
  if (!Number.isFinite(meters)) return UNKNOWN
  const m = Math.max(0, Math.round(meters))
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

/**
 * 单个车位数的展示。缺失时显示 `--`，绝不显示 0（0 与未知语义不同）；
 * 负数按 0 处理 —— 那是脏数据，与 freeRate 的兜底同向：
 * 宁可说「没空位」，也不要把坏数据说成「空位充足」。
 * typeof + Number.isFinite 一起用：前者让 TS 收窄掉 null，后者挡 NaN
 */
function formatSpotCount(v: number | null): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.max(0, v)) : UNKNOWN
}

/**
 * 余位展示。有上报时形如 `46/500`；**未上报（free 为 null）显示「待上报」**，
 * 不是 `--/500` 也不是 0 —— 「没数据」和「满了」是两句话（用户 2026-09-14 拍板）
 */
export function formatSpots(free: number | null, total: number | null): string {
  if (free === null) return '待上报'
  return `${formatSpotCount(free)}/${formatSpotCount(total)}`
}

/**
 * 评分聚合展示。无评价（null / 条数为 0 / 分数无效）显示「暂无评分」，
 * **不显示 0 分** —— 冷启动没有评价与「被评了 0 分」对车场是两种命运
 */
export function formatRatingSummary(summary: { score: number; count: number } | null): string {
  if (!summary || !(summary.count > 0) || !Number.isFinite(summary.score)) return '暂无评分'
  return `★ ${summary.score.toFixed(1)}（${summary.count} 条）`
}

/**
 * 金额展示：四舍五入到分。
 *
 * 不能直接 Math.round(yuan * 100)：乘 100 会把某些值推到半格错误的一侧 ——
 * 1.005 * 100 在双精度下是 100.49999999999999，直接取整得 1.00 而非 1.01。
 * 先补一个远小于半分（1e-6 分，即 1e-8 元）的偏移再取整，把这类表示误差推过半格。
 * 偏移量比任何真实价格粒度都小，不会把 4.4749999 这种真·不足半分的值顶上去。
 *
 * 注意 8.005 并不属于这类：它乘 100 得 800.5000000000001，本来就落在正确一侧。
 * 别拿它当这条逻辑的例证。
 */
export function formatAmount(yuan: number): string {
  if (!Number.isFinite(yuan)) return UNKNOWN
  const cents = Math.round(yuan * 100 + Math.sign(yuan) * 1e-6)
  return (cents / 100).toFixed(2)
}

/** 倒计时文案。已过期或时间无效返回空串 */
export function formatCountdown(now: Date, deadline: Date): string {
  const diffMin = Math.floor((deadline.getTime() - now.getTime()) / 60000)
  if (!Number.isFinite(diffMin) || diffMin < 0) return ''
  if (diffMin < 60) return `剩 ${diffMin} 分钟`
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return m === 0 ? `剩 ${h} 小时` : `剩 ${h} 小时 ${m} 分`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * 到达时刻文案。参数序 **now 在前**，与 formatCountdown、time.ts 的
 * isWithinWindow 一致 —— 两个入参都是 Date，写反了类型检查抓不到，
 * 只会静默把「现在」渲染成到达时间
 */
export function formatTimeRangeLabel(now: Date, time: Date): string {
  // 无效 Date 的 getHours() 是 NaN，不挡会渲染成「NaN月NaN日 NaN:NaN」
  if (!Number.isFinite(time.getTime()) || !Number.isFinite(now.getTime())) return ''
  const hhmm = `${pad2(time.getHours())}:${pad2(time.getMinutes())}`
  if (isSameDay(time, now)) return `今天 ${hhmm}`
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  if (isSameDay(time, tomorrow)) return `明天 ${hhmm}`
  return `${time.getMonth() + 1}月${time.getDate()}日 ${hhmm}`
}

/**
 * 车牌号格式校验。
 *
 * 与云函数 createReservation 的 `PLATE_RE` 同源（两端各写一份，注释互相引用）：
 * 省份汉字 + 大写字母 + 5-6 位大写字母/数字，覆盖蓝牌（6 位）与新能源（7 位）。
 * 前端在输入时拦截非法车牌，云端在下单时再校验一次 —— 前端只挡输入体验，
 * 云端才是真防线，两边都要有
 */
const PLATE_RE = /^[一-龥][A-Z][A-Z0-9]{5,6}$/

export function isValidPlate(plate: string): boolean {
  return PLATE_RE.test(plate)
}

/**
 * 车牌展示：省市简称 + 字母后插入分隔点。
 * 不足 4 位的不可能是车牌，原样返回 —— 门槛写成 3 会把「京A8」这种脏数据
 * 变成「京A·8」，看着像正常车牌，反而更难排查。
 * 分隔符要全局清：只替换首个的话，「京·A8·K9」会被重排成「京A·8·K9」，
 * 一个看着对、实际错的车牌
 */
export function formatPlate(plate: string): string {
  const raw = plate.replace(/·/g, '')
  if (raw.length < 4) return plate
  return `${raw.slice(0, 2)}·${raw.slice(2)}`
}
