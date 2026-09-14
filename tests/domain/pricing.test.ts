import {
  FREE_CANCEL_MS,
  MAX_LEAD_HOURS,
  PLATFORM_SERVICE_FEE,
  cancelRefund,
  isBookableArrival,
  leadHours,
  prepaidParkingFee,
  quoteTotal,
} from '../../miniprogram/domain/pricing'

describe('leadHours', () => {
  it('不足 1 小时按 1 小时计', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T10:40:00')
    expect(leadHours(now, arrive)).toBe(1)
  })

  it('整 1 小时为 1', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    expect(leadHours(now, arrive)).toBe(1)
  })

  it('整 2 小时为 2', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    expect(leadHours(now, arrive)).toBe(2)
  })

  it('1 小时零 1 分进位为 2', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:01:00')
    expect(leadHours(now, arrive)).toBe(2)
  })

  it('到达时间早于当前时间时按 1 小时兜底', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T09:30:00')
    expect(leadHours(now, arrive)).toBe(1)
  })

  it('Invalid Date 产生的 NaN 按 1 小时兜底', () => {
    const bad = new Date('garbage')
    expect(leadHours(bad, bad)).toBe(1)
  })
})

describe('prepaidParkingFee', () => {
  it('万象城首小时 ¥6，10:00 约 11:00 到 = ¥6', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    expect(prepaidParkingFee(now, arrive, 6)).toBe(6)
  })

  it('万象城首小时 ¥6，10:00 约 12:00 到 = ¥12', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    expect(prepaidParkingFee(now, arrive, 6)).toBe(12)
  })

  it('医院首小时 ¥4，预留 2 小时 = ¥8', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    expect(prepaidParkingFee(now, arrive, 4)).toBe(8)
  })
})

describe('quoteTotal', () => {
  it('预支 + 服务费', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    expect(quoteTotal(now, arrive, 6)).toEqual({
      leadHours: 1,
      prepaidParkingFee: 6,
      serviceFee: 2,
      totalAmount: 8,
    })
  })

  it('服务费常量为 2', () => {
    expect(PLATFORM_SERVICE_FEE).toBe(2)
  })
})

describe('leadHours 预约页到达选项', () => {
  it('90 分钟后到达进位为 2', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:30:00')
    expect(leadHours(now, arrive)).toBe(2)
  })
})

describe('prepaidParkingFee 过期到达兜底', () => {
  it('到达时间早于当前 30 分钟时按 1 小时计 = ¥6', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T09:30:00')
    expect(prepaidParkingFee(now, arrive, 6)).toBe(6)
  })
})

describe('常量', () => {
  it('预约窗口上限为 2 小时', () => {
    expect(MAX_LEAD_HOURS).toBe(2)
  })

  it('免费取消窗口为 10 分钟', () => {
    expect(FREE_CANCEL_MS).toBe(10 * 60 * 1000)
  })
})

describe('isBookableArrival', () => {
  const now = new Date('2026-09-11T10:00:00')

  it('30 分钟后到达在窗口内', () => {
    expect(isBookableArrival(now, new Date('2026-09-11T10:30:00'))).toBe(true)
  })

  it('整 2 小时后到达在窗口内（闭区间上界）', () => {
    expect(isBookableArrival(now, new Date('2026-09-11T12:00:00'))).toBe(true)
  })

  it('2 小时零 1 分超出窗口', () => {
    expect(isBookableArrival(now, new Date('2026-09-11T12:01:00'))).toBe(false)
  })

  it('当前时刻合法（预约页首档「现在」，锁位 0 小时也按 1 小时计）', () => {
    expect(isBookableArrival(now, now)).toBe(true)
  })

  it('过去时刻不合法', () => {
    expect(isBookableArrival(now, new Date('2026-09-11T09:30:00'))).toBe(false)
  })

  it('Invalid Date 不合法', () => {
    const bad = new Date('garbage')
    expect(isBookableArrival(bad, bad)).toBe(false)
  })
})

describe('cancelRefund 免费取消窗口', () => {
  it('下单 5 分钟后取消，全额退还（含服务费）', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    const cancelAt = new Date('2026-09-11T10:05:00')
    expect(cancelRefund(orderAt, arrive, cancelAt, 5)).toEqual({
      usedHours: 0,
      parkingRefund: 10,
      refundServiceFee: true,
      totalRefund: 12,
      isBreach: false,
    })
  })

  it('整 10 分钟取消仍在免费窗口内（闭区间）', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    const cancelAt = new Date('2026-09-11T10:10:00')
    expect(cancelRefund(orderAt, arrive, cancelAt, 6).totalRefund).toBe(8)
  })

  it('取消时间戳损坏时走免费窗口，不吞用户的钱', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    const bad = new Date('garbage')
    const refund = cancelRefund(orderAt, arrive, bad, 6)
    expect(refund.totalRefund).toBe(8)
    expect(refund.refundServiceFee).toBe(true)
  })
})

describe('cancelRefund 逾窗口按占用时长退', () => {
  it('预约 2 小时、1 小时后取消：退 1 小时车场费，服务费不退（¥5 例）', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    const cancelAt = new Date('2026-09-11T11:00:00')
    expect(cancelRefund(orderAt, arrive, cancelAt, 5)).toEqual({
      usedHours: 1,
      parkingRefund: 5,
      refundServiceFee: false,
      totalRefund: 5,
      isBreach: false,
    })
  })

  it('万象城 ¥6：预约 2 小时、1 小时后取消退 ¥6', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    const cancelAt = new Date('2026-09-11T11:00:00')
    expect(cancelRefund(orderAt, arrive, cancelAt, 6).parkingRefund).toBe(6)
  })

  it('预约 1 小时、1 小时后取消：退款为 0，构成违约', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    const cancelAt = new Date('2026-09-11T11:00:00')
    expect(cancelRefund(orderAt, arrive, cancelAt, 5)).toEqual({
      usedHours: 1,
      parkingRefund: 0,
      refundServiceFee: false,
      totalRefund: 0,
      isBreach: true,
    })
  })

  it('预约 1 小时、1 小时 15 分后取消：clamp 到 0，不追缴', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    const cancelAt = new Date('2026-09-11T11:15:00')
    const refund = cancelRefund(orderAt, arrive, cancelAt, 5)
    expect(refund.parkingRefund).toBe(0)
    expect(refund.totalRefund).toBe(0)
    expect(refund.isBreach).toBe(true)
  })

  it('预约 2 小时、2 小时 30 分后取消：已占用 3 小时，退款 0', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    const cancelAt = new Date('2026-09-11T12:30:00')
    const refund = cancelRefund(orderAt, arrive, cancelAt, 5)
    expect(refund.usedHours).toBe(3)
    expect(refund.totalRefund).toBe(0)
    expect(refund.isBreach).toBe(true)
  })

  it('预约 1 小时、11 分钟后取消：退款 0 但不算违约（向上取整的代价）', () => {
    const orderAt = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    const cancelAt = new Date('2026-09-11T10:11:00')
    const refund = cancelRefund(orderAt, arrive, cancelAt, 5)
    expect(refund.usedHours).toBe(1)
    expect(refund.totalRefund).toBe(0)
    expect(refund.isBreach).toBe(false)
  })
})

describe('quoteTotal 预支金额与 prepaidParkingFee 同源', () => {
  const cases: Array<[string, number]> = [
    ['2026-09-11T11:00:00', 6],
    ['2026-09-11T12:30:00', 4],
    ['2026-09-11T09:30:00', 6],
  ]

  it.each(cases)('到达 %s、首小时 ¥%i 时两者一致', (arriveIso, rate) => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date(arriveIso)
    expect(quoteTotal(now, arrive, rate).prepaidParkingFee).toBe(prepaidParkingFee(now, arrive, rate))
  })
})
