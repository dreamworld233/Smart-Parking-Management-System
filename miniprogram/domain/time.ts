/** 预约窗口上限（小时）。超出不给约 */
export const MAX_LEAD_HOURS = 2

/** 入场宽限期（分钟）。超过则车位自动释放并记违约一次（PM BR-01） */
export const ENTRY_GRACE_MINUTES = 15

const MINUTE_MS = 60 * 1000

export interface ArrivalOption {
  offsetMinutes: number
  time: Date
  /** 展示标签：「现在」/「30 分」/「1 时」/「1.5 时」/「2 时」 */
  label: string
}

const OFFSETS = [0, 30, 60, 90, 120]

function labelFor(offsetMinutes: number): string {
  if (offsetMinutes === 0) return '现在'
  if (offsetMinutes < 60) return `${offsetMinutes} 分`
  const hours = offsetMinutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 时`
}

/** 生成预约确认页的到达时间选项 */
export function buildArrivalOptions(now: Date): ArrivalOption[] {
  return OFFSETS.map(offsetMinutes => ({
    offsetMinutes,
    time: new Date(now.getTime() + offsetMinutes * MINUTE_MS),
    label: labelFor(offsetMinutes),
  }))
}

/** 到达时间是否落在 [now, now + MAX_LEAD_HOURS] 窗口内 */
export function isWithinWindow(now: Date, arrive: Date): boolean {
  const diff = arrive.getTime() - now.getTime()
  return diff >= 0 && diff <= MAX_LEAD_HOURS * 60 * MINUTE_MS
}

/** 入场截止时刻 = 到达时间 + 入场宽限期 */
export function enterDeadline(arrive: Date): Date {
  return new Date(arrive.getTime() + ENTRY_GRACE_MINUTES * MINUTE_MS)
}
