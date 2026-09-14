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
    pricing: { firstHour: 6, perHourAfter: 5, stepMinutes: 15, capPerDay: 40, source: 'estimated' },
    // 空闲率 0.4：高于饱和下限 0.15，也高于 warn 的上界 0.3，落 ok 档
    availability: { freeSpots: 200, totalSpots: 500, source: 'estimated' },
    reservableQuota: 120,
    rating: 4.8,
    tags: [],
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
    const vm = toDetailVM(rec({ availability: { freeSpots: 50, totalSpots: 500, source: 'estimated' } }))
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

  it('逐条标注数据来源，字段都真实时为空串', () => {
    // fixture 三个来源都是 estimated，所以三个都进标注 —— sourceNote 是逐条判的
    expect(toDetailVM(rec()).estimateText).toBe('距离、收费、余位为估算')
    const real = rec()
    real.lot.distanceSource = 'route'
    real.lot.pricing.source = 'rule'
    real.lot.availability.source = 'poi'
    expect(toDetailVM(real).estimateText).toBe('')
  })
})
