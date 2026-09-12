function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
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

/** 余位展示，形如 `46/500` */
export function formatSpots(free: number | null, total: number | null): string {
  return `${formatSpotCount(free)}/${formatSpotCount(total)}`
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
