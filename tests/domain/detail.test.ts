import { toDetailVM } from '../../miniprogram/domain/detail'
import type { ParkingLot, Recommendation } from '../../miniprogram/domain/types'

function lot(over: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'L1',
    name: '万象城地下停车场',
    address: '历下区经十路 1234 号',
    location: { lat: 36.65, lng: 117.12 },
    distanceM: 320,
    walkMinutes: 4,
    distanceSource: 'estimated',
    pricing: { firstHour: 6, perHourAfter: 5, stepMinutes: 15, capPerDay: 40, source: 'ops' },
    // 空闲率 0.4：高于饱和下限 0.15，也高于 warn 的上界 0.3，落 ok 档
    availability: { freeSpots: 200, totalSpots: 500, source: 'ops' },
    reservableQuota: 120,
    ratingSummary: { score: 4.8, count: 12 },
    facilities: [],
    ...over,
  }
}

function rec(over: Partial<ParkingLot> = {}): Recommendation {
  return {
    lot: lot(over),
    score: 88,
    // 详情视图不读 factors，只透传 score / reasons / tone
    factors: {} as never,
    reasons: ['空位充足'],
    tone: 'good',
  }
}

describe('toDetailVM', () => {
  it('把金额与档位转成展示串，档位与列表卡片同源', () => {
    const vm = toDetailVM(rec())
    expect(vm.firstHourText).toBe('6.00')
    expect(vm.nextHourText).toBe('5.00')
    expect(vm.capText).toBe('40.00')
    expect(vm.stepText).toBe('15 分钟')
    expect(vm.spotsText).toBe('200/500')
    expect(vm.distanceText).toBe('320m')
    expect(vm.walkText).toBe('4 分钟')
    expect(vm.freeClass).toBe('ok')
    expect(vm.quotaText).toBe('120')
  })

  it('空闲率落进饱和区间时降档到 bad，与 availabilityLevel 同一判定', () => {
    // 50/500 = 0.1，低于饱和下限 0.15
    const vm = toDetailVM(rec({ availability: { freeSpots: 50, totalSpots: 500, source: 'ops' } }))
    expect(vm.freeClass).toBe('bad')
  })

  it('缺夜间价时给占位，而不是把 undefined 拼进半句话', () => {
    expect(toDetailVM(rec()).nightText).toBe('--')
    const withNight = rec()
    withNight.lot.pricing.nightRate = 3
    expect(toDetailVM(withNight).nightText).toBe('¥3.00/时')
  })

  it('可预约额度非有限值时给占位：Math.max(0, NaN) 仍是 NaN', () => {
    expect(toDetailVM(rec({ reservableQuota: Number.NaN })).quotaText).toBe('--')
    // 脏数据里的负数按 0 报，与 formatSpots 同向
    expect(toDetailVM(rec({ reservableQuota: -5 })).quotaText).toBe('0')
  })

  it('逐条标注数据来源，公示价与估算距离各按自己的来源标', () => {
    // 默认 fixture：距离 estimated、收费 ops、余位已上报 → 距离 + 收费两条
    expect(toDetailVM(rec()).sourceNotes).toEqual(['距离为估算', '收费为运营声明'])
    const publicPriced = rec()
    publicPriced.lot.distanceSource = 'route'
    publicPriced.lot.pricing.source = 'public'
    // 距离真实（route）不标，收费公示价照标 —— 公示价是「从哪来」的诚实答案
    expect(toDetailVM(publicPriced).sourceNotes).toEqual(['收费来源于车场公示价'])
  })

  it('评分聚合展示走 formatRatingSummary，无评价显示暂无评分', () => {
    expect(toDetailVM(rec()).ratingText).toBe('★ 4.8（12 条）')
    expect(toDetailVM(rec({ ratingSummary: null })).ratingText).toBe('暂无评分')
  })
})
