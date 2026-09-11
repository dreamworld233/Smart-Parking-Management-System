import { PLATFORM_SERVICE_FEE, leadHours, prepaidParkingFee, quoteTotal } from '../pricing'

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
