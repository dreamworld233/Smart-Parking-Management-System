/** 平台服务费（元）。平台唯一收入来源，改签时不退还 */
export const PLATFORM_SERVICE_FEE = 2

/**
 * 预留小时数 = 到达时刻 − 当前时刻，向上取整，最小 1。
 * 到达时间早于或等于当前时间时返回 1。
 */
export function leadHours(now: Date, arrive: Date): number {
  const diffMs = arrive.getTime() - now.getTime()
  // 故意写成 !(diffMs > 0) 而不是 diffMs <= 0：
  // 后者对 NaN 求值为 false，会让 Invalid Date 一路算成 NaN 费用。
  // 取反这一层是承重的，别"简化"掉。
  if (!(diffMs > 0)) return 1
  return Math.ceil(diffMs / (60 * 60 * 1000))
}

/**
 * 预支停车费 = 预留小时数 × 该车场首小时标准价。
 * 由平台代收后转付车场；出场时车场闸机按实际停放时长计费并抵扣。
 */
export function prepaidParkingFee(now: Date, arrive: Date, firstHourRate: number): number {
  return leadHours(now, arrive) * firstHourRate
}

export interface Quote {
  leadHours: number
  prepaidParkingFee: number
  serviceFee: number
  totalAmount: number
}

export function quoteTotal(now: Date, arrive: Date, firstHourRate: number): Quote {
  const prepaid = prepaidParkingFee(now, arrive, firstHourRate)
  return {
    leadHours: leadHours(now, arrive),
    prepaidParkingFee: prepaid,
    serviceFee: PLATFORM_SERVICE_FEE,
    totalAmount: prepaid + PLATFORM_SERVICE_FEE,
  }
}
