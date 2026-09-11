import {
  COMMUTE_WEIGHTS,
  DEFAULT_WEIGHTS,
  MEDICAL_WEIGHTS,
  SATURATION_THRESHOLD,
  scoreLot,
  topRecommendations,
} from '../scoring'
import type { ParkingLot } from '../types'

function lot(over: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'L1',
    name: '万象城地下停车场',
    address: '历下区经十路 1234 号',
    location: { lat: 36.65, lng: 117.12 },
    distanceM: 320,
    walkMinutes: 4,
    pricing: { firstHour: 6, perHourAfter: 5, stepMinutes: 15, capPerDay: 40, source: 'estimated' },
    // 空闲率 0.4，明显高于饱和下限 0.15 —— 默认 fixture 必须是「不紧张」的，
    // 否则「空位充足为 good」与「高饱和为 bad」两条测试会落在同一区间里打架
    availability: { freeSpots: 200, totalSpots: 500, source: 'estimated' },
    reservableQuota: 120,
    rating: 4.8,
    tags: [],
    ...over,
  }
}

describe('DEFAULT_WEIGHTS', () => {
  it('沿用 PM 表 5 的默认权重且合计为 1', () => {
    const sum =
      DEFAULT_WEIGHTS.fee +
      DEFAULT_WEIGHTS.distance +
      DEFAULT_WEIGHTS.availability +
      DEFAULT_WEIGHTS.infra +
      DEFAULT_WEIGHTS.reputation
    expect(sum).toBeCloseTo(1, 10)
  })

  it('费用权重最高', () => {
    expect(DEFAULT_WEIGHTS.fee).toBe(0.3)
  })

  it('三个场景预设的权重都合计为 1', () => {
    for (const w of [DEFAULT_WEIGHTS, MEDICAL_WEIGHTS, COMMUTE_WEIGHTS]) {
      const sum = w.fee + w.distance + w.availability + w.infra + w.reputation
      expect(sum).toBeCloseTo(1, 10)
    }
  })
})

describe('scoreLot', () => {
  // 单候选时集合内无从比较（min === max），两个因子都走「不惩罚」的兜底分支。
  // 这条只钉兜底值，不代表费用/距离的排序方向 —— 方向分别由下面两条测试覆盖
  it('候选只有一个车场时无从比较，距离与费用因子都取 1', () => {
    const r = scoreLot(lot({ distanceM: 0 }), {
      allLots: [lot({ distanceM: 0 })],
      hasCharging: false,
      userNeedsCharging: false,
    })
    expect(r.factors.distance).toBe(1)
    expect(r.factors.fee).toBe(1)
    expect(r.score).toBeGreaterThan(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('距离越近距离因子越高', () => {
    const near = scoreLot(lot({ id: 'near', distanceM: 100 }), {
      allLots: [lot({ id: 'near', distanceM: 100 }), lot({ id: 'far', distanceM: 2000 })],
      hasCharging: false,
      userNeedsCharging: false,
    })
    const far = scoreLot(lot({ id: 'far', distanceM: 2000 }), {
      allLots: [lot({ id: 'near', distanceM: 100 }), lot({ id: 'far', distanceM: 2000 })],
      hasCharging: false,
      userNeedsCharging: false,
    })
    expect(near.factors.distance).toBeGreaterThan(far.factors.distance)
  })

  it('费用越低费用因子越高，最低价取 1、最高价取 0', () => {
    const cheap = lot({ id: 'cheap', pricing: { ...lot().pricing, firstHour: 4 } })
    const pricey = lot({ id: 'pricey', pricing: { ...lot().pricing, firstHour: 10 } })
    const allLots = [cheap, pricey]
    const ctx = { allLots, hasCharging: false, userNeedsCharging: false }

    expect(scoreLot(cheap, ctx).factors.fee).toBe(1)
    expect(scoreLot(pricey, ctx).factors.fee).toBe(0)
    expect(scoreLot(cheap, ctx).factors.fee).toBeGreaterThan(scoreLot(pricey, ctx).factors.fee)
  })

  it('得分取整且在 0–100 之间', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: false })
    expect(Number.isInteger(r.score)).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('纯电车 + 车场有充电桩时基础设施因子为 1', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: true, userNeedsCharging: true })
    expect(r.factors.infra).toBe(1)
  })

  it('纯电车 + 车场无充电桩时基础设施因子为 0', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: true })
    expect(r.factors.infra).toBe(0)
  })

  it('燃油车不受充电桩影响，基础设施因子为 1', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: false })
    expect(r.factors.infra).toBe(1)
  })

  it('空位充足时可用性因子高于空位紧张时', () => {
    const plenty = scoreLot(lot({ availability: { freeSpots: 400, totalSpots: 500, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    const scarce = scoreLot(lot({ availability: { freeSpots: 3, totalSpots: 800, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(plenty.factors.availability).toBeGreaterThan(scarce.factors.availability)
  })

  it('空闲率低于警戒线时可用性因子为 0', () => {
    const r = scoreLot(lot({ availability: { freeSpots: 10, totalSpots: 100, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.factors.availability).toBe(0)
  })

  it('评分低于饱和警戒线时产出「高峰紧张」理由', () => {
    const r = scoreLot(lot({ availability: { freeSpots: 10, totalSpots: 100, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.reasons).toContain('高峰紧张')
  })

  it('产出可解释理由，最多 3 条', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: false })
    expect(r.reasons.length).toBeGreaterThan(0)
    expect(r.reasons.length).toBeLessThanOrEqual(3)
  })

  it('基调：空位充足为 good', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: false })
    expect(r.tone).toBe('good')
  })

  it('基调：高饱和为 bad', () => {
    const r = scoreLot(lot({ availability: { freeSpots: 10, totalSpots: 100, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.tone).toBe('bad')
  })

  it('饱和警戒线为 0.85', () => {
    expect(SATURATION_THRESHOLD).toBe(0.85)
  })
})

describe('topRecommendations', () => {
  it('按评分降序返回，且不超过 n 条', () => {
    const lots = [
      lot({ id: 'a' }),
      lot({ id: 'b', distanceM: 2000 }),
      lot({ id: 'c', distanceM: 50 }),
      lot({ id: 'd', distanceM: 900 }),
    ]
    const top = topRecommendations(lots, { hasCharging: false, userNeedsCharging: false }, 2)

    expect(top.length).toBe(2)
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score)
  })

  it('充电桩按各车场自身标签判定，不受 ctx.hasCharging 影响', () => {
    // ctx.hasCharging 故意传 true：若实现直接沿用调用方的值，两个车场都会拿到 infra 1，
    // 这条断言就会挂 —— 这正是要钉住「按车场自身 tags 覆盖」的行为
    const withPile = lot({ id: 'pile', tags: ['充电桩'] })
    const withoutPile = lot({ id: 'nopile' })
    const top = topRecommendations([withPile, withoutPile], { hasCharging: true, userNeedsCharging: true }, 2)

    expect(top[0].lot.id).toBe('pile')
    expect(top[0].factors.infra).toBe(1)
    expect(top[1].factors.infra).toBe(0)
  })
})
