import {
  formatAmount,
  formatCountdown,
  formatDistance,
  formatPlate,
  formatSpots,
  formatTimeRangeLabel,
  sourceNote,
} from '../../miniprogram/domain/format'
import type { ParkingLot } from '../../miniprogram/domain/types'

describe('formatDistance', () => {
  // 分界线画在**四舍五入之后**的米数上，不是入参上：
  // 999.6 先变成 1000 再判档，于是显示 1.0km 而不是「1000m」
  it('四舍五入后不足 1000 米用米', () => {
    expect(formatDistance(320)).toBe('320m')
    expect(formatDistance(999.4)).toBe('999m')
  })

  it('四舍五入后达到 1000 米按公里显示', () => {
    expect(formatDistance(999.6)).toBe('1.0km')
    expect(formatDistance(1000)).toBe('1.0km')
  })

  it('1 公里以上用公里，保留 1 位小数', () => {
    expect(formatDistance(1200)).toBe('1.2km')
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

  it('负数车位按 0 处理，不把脏数据当数字渲染', () => {
    // 与 freeRate 的兜底同向：坏数据宁可说「没空位」，也不要说成「空位充足」。
    // 注意这与「缺失显示 --」不冲突 —— 一个是数据脏，一个是数据没有
    expect(formatSpots(-1, 500)).toBe('0/500')
    expect(formatSpots(46, -500)).toBe('46/0')
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
  // 参数序与 formatCountdown / time.ts 的 isWithinWindow 对齐：now 在前。
  // 两位都是 Date，写反了类型检查抓不到，只会静默把「现在」渲染成到达时间
  it('当天显示「今天 HH:mm」', () => {
    const now = new Date('2026-09-11T10:00:00')
    expect(formatTimeRangeLabel(now, new Date('2026-09-11T13:40:00'))).toBe('今天 13:40')
  })

  it('次日显示「明天 HH:mm」', () => {
    const now = new Date('2026-09-11T23:00:00')
    expect(formatTimeRangeLabel(now, new Date('2026-09-12T00:30:00'))).toBe('明天 00:30')
  })

  it('更远的日期显示「M月D日 HH:mm」', () => {
    const now = new Date('2026-09-11T10:00:00')
    expect(formatTimeRangeLabel(now, new Date('2026-09-13T08:05:00'))).toBe('9月13日 08:05')
  })

  it('时间无效时返回空字符串', () => {
    expect(formatTimeRangeLabel(new Date('2026-09-11T10:00:00'), new Date('无效'))).toBe('')
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

  it('清掉全部已有分隔符，不只第一个', () => {
    // 用户手输或上游存了「京·A8·K9」时，只删首个分隔符会重排成「京A·8·K9」——
    // 看着像车牌，其实是错的
    expect(formatPlate('京·A8·K9')).toBe('京A·8K9')
  })
})

describe('sourceNote', () => {
  function lot(over: Partial<ParkingLot> = {}): ParkingLot {
    return {
      id: 'L1',
      name: '万象城地下停车场',
      address: '历下区经十路 1234 号',
      location: { lat: 36.65, lng: 117.12 },
      distanceM: 320,
      walkMinutes: 4,
      distanceSource: 'estimated',
      pricing: { firstHour: 6, perHourAfter: 5, stepMinutes: 15, capPerDay: 40, source: 'estimated' },
      availability: { freeSpots: 200, totalSpots: 500, source: 'estimated' },
      reservableQuota: 120,
      rating: 4.8,
      tags: [],
      ...over,
    }
  }

  it('全为估算时逐项列出', () => {
    expect(sourceNote(lot())).toBe('距离、收费、余位为估算')
  })

  it('只有距离是估算时不牵连收费与余位', () => {
    // 首页只给 Top3 查真实步行路线，所以这条是常态：
    // 整批标「估算」会把真实的收费规则也一起说成估算
    const mixed = lot({
      distanceSource: 'estimated',
      pricing: { firstHour: 6, perHourAfter: 5, stepMinutes: 15, capPerDay: 40, source: 'rule' },
      availability: { freeSpots: 200, totalSpots: 500, source: 'poi' },
    })
    expect(sourceNote(mixed)).toBe('距离为估算')
  })

  it('全部来自真实来源时返回空串，调用方不渲染标签', () => {
    const real = lot({
      distanceSource: 'route',
      pricing: { firstHour: 6, perHourAfter: 5, stepMinutes: 15, capPerDay: 40, source: 'rule' },
      availability: { freeSpots: 200, totalSpots: 500, source: 'poi' },
    })
    expect(sourceNote(real)).toBe('')
  })
})
