import {
  formatAmount,
  formatCountdown,
  formatDistance,
  formatPlate,
  formatSpots,
  formatTimeRangeLabel,
} from '../../miniprogram/domain/format'

describe('formatDistance', () => {
  it('小于 1 公里用米', () => {
    expect(formatDistance(320)).toBe('320m')
  })

  it('1 公里及以上用公里，保留 1 位小数', () => {
    expect(formatDistance(1200)).toBe('1.2km')
  })

  it('刚好 1000 米为 1.0km', () => {
    expect(formatDistance(1000)).toBe('1.0km')
  })

  it('负数按 0 处理', () => {
    expect(formatDistance(-5)).toBe('0m')
  })

  it('距离缺失显示 --，不显示 NaNkm', () => {
    expect(formatDistance(NaN)).toBe('--')
  })
})

describe('formatSpots', () => {
  it('正常值显示 余位/总数', () => {
    expect(formatSpots(46, 500)).toBe('46/500')
  })

  it('余位缺失显示 --，不显示 0', () => {
    expect(formatSpots(null, 500)).toBe('--/500')
  })

  it('总数缺失显示 --', () => {
    expect(formatSpots(46, null)).toBe('46/--')
  })

  it('余位为 NaN 同样显示 --', () => {
    expect(formatSpots(NaN, 500)).toBe('--/500')
  })
})

describe('formatAmount', () => {
  it('保留两位小数', () => {
    expect(formatAmount(8)).toBe('8.00')
  })

  it('四舍五入到分', () => {
    expect(formatAmount(8.005)).toBe('8.01')
  })

  it('乘 100 落到半格下方的值也能进位', () => {
    // 1.005 * 100 === 100.49999999999999，朴素取整会得 1.00。
    // 这条是那个 1e-6 偏移的唯一把关者，删掉偏移它就会挂
    expect(formatAmount(1.005)).toBe('1.01')
    expect(formatAmount(4.475)).toBe('4.48')
  })

  it('金额缺失显示 --', () => {
    expect(formatAmount(NaN)).toBe('--')
  })
})

describe('formatCountdown', () => {
  const now = new Date('2026-09-11T13:40:00')

  it('剩余 14 分钟', () => {
    expect(formatCountdown(now, new Date('2026-09-11T13:54:30'))).toBe('剩 14 分钟')
  })

  it('超过 1 小时显示小时', () => {
    expect(formatCountdown(now, new Date('2026-09-11T15:10:00'))).toBe('剩 1 小时 30 分')
  })

  it('已过期返回空字符串', () => {
    expect(formatCountdown(now, new Date('2026-09-11T13:39:00'))).toBe('')
  })

  it('时间无效时返回空字符串', () => {
    expect(formatCountdown(now, new Date('无效'))).toBe('')
  })
})

describe('formatTimeRangeLabel', () => {
  it('当天显示「今天 HH:mm」', () => {
    const now = new Date('2026-09-11T10:00:00')
    expect(formatTimeRangeLabel(new Date('2026-09-11T13:40:00'), now)).toBe('今天 13:40')
  })

  it('次日显示「明天 HH:mm」', () => {
    const now = new Date('2026-09-11T23:00:00')
    expect(formatTimeRangeLabel(new Date('2026-09-12T00:30:00'), now)).toBe('明天 00:30')
  })

  it('更远的日期显示「M月D日 HH:mm」', () => {
    const now = new Date('2026-09-11T10:00:00')
    expect(formatTimeRangeLabel(new Date('2026-09-13T08:05:00'), now)).toBe('9月13日 08:05')
  })

  it('时间无效时返回空字符串', () => {
    expect(formatTimeRangeLabel(new Date('无效'), new Date('2026-09-11T10:00:00'))).toBe('')
  })
})

describe('formatPlate', () => {
  it('保留完整车牌用于本人订单展示', () => {
    expect(formatPlate('京A8F2K9')).toBe('京A·8F2K9')
  })

  it('已带分隔符时不重复插入', () => {
    expect(formatPlate('京A·8F2K9')).toBe('京A·8F2K9')
  })

  it('长度不足时原样返回', () => {
    expect(formatPlate('京A8')).toBe('京A8')
  })
})
