import {
  AVAILABILITY_WARN_RATIO,
  COMMUTE_WEIGHTS,
  DEFAULT_WEIGHTS,
  FREE_FLOOR,
  MEDICAL_WEIGHTS,
  SATURATION_THRESHOLD,
  availabilityLevel,
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

describe('availabilityLevel', () => {
  it('饱和线上及以下为 bad', () => {
    expect(availabilityLevel(0)).toBe('bad')
    expect(availabilityLevel(FREE_FLOOR)).toBe('bad')
  })

  it('刚过饱和线、未到警戒倍数为 warn', () => {
    expect(availabilityLevel(FREE_FLOOR + 0.001)).toBe('warn')
    expect(availabilityLevel(FREE_FLOOR * AVAILABILITY_WARN_RATIO)).toBe('warn')
  })

  it('明显宽裕为 ok', () => {
    expect(availabilityLevel(FREE_FLOOR * AVAILABILITY_WARN_RATIO + 0.001)).toBe('ok')
    expect(availabilityLevel(1)).toBe('ok')
  })

  it('非有限值按 bad 兜底', () => {
    expect(availabilityLevel(NaN)).toBe('bad')
  })

  it('档位边界与评分基调的饱和线是同一条', () => {
    // 页面不得自定 0.1 / 0.25 这类阈值 —— 那会让色条和评分对同一个车场给出相反结论。
    // 这条把两者的边界钉在一起：空闲率恰好落在饱和线上时，档位与 tone 必须同时是 bad
    const total = 1000
    const atLine = lot({
      id: 'at',
      distanceM: 100,
      pricing: { ...lot().pricing, firstHour: 6 },
      availability: { freeSpots: FREE_FLOOR * total, totalSpots: total, source: 'estimated' },
    })
    // aboveLine 刻意又远又贵：默认 fixture 两辆车场同价同距离，费用与距离因子都会取 1，
    // 于是「不是 bad」会经费用/距离的 good 捷径通过 —— 断言看着绿，实际与可用性无关。
    // 把这两项压到 0 之后，tone 才只可能由 availability 决定，挂掉时也才会指向可用性
    const aboveLine = lot({
      id: 'above',
      distanceM: 2000,
      pricing: { ...lot().pricing, firstHour: 10 },
      availability: { freeSpots: FREE_FLOOR * total + 1, totalSpots: total, source: 'estimated' },
    })
    const ctx = { allLots: [atLine, aboveLine], hasCharging: false, userNeedsCharging: false }

    expect(availabilityLevel(FREE_FLOOR)).toBe('bad')
    expect(scoreLot(atLine, ctx).tone).toBe('bad')
    expect(scoreLot(aboveLine, ctx).tone).not.toBe('bad')
  })

  it('档位与基调在整条数轴上一致，不依赖两边都引用同一个常量', () => {
    // 上面那条两侧都走 FREE_FLOOR 符号，因此只钉得住「两边同源」，钉不住「两边同值」：
    // 某一侧被写死成 0.15 而 SATURATION_THRESHOLD 后来改动时它照样绿。
    // 这里改用字面量取样，把档位与基调的关系直接钉在数轴上。
    // 注意 tone 只可能经 saturated 变 bad（toneFor 其余分支给的是 good/plain），
    // 所以这条等价式判的就是饱和线本身
    for (const rate of [0, 0.12, FREE_FLOOR, 0.16, 0.31, 1]) {
      const l = lot({ id: `r${rate}`, availability: { freeSpots: rate * 1000, totalSpots: 1000, source: 'estimated' } })
      const ctx = { allLots: [l], hasCharging: false, userNeedsCharging: false }
      expect(availabilityLevel(rate) === 'bad').toBe(scoreLot(l, ctx).tone === 'bad')
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

  it('理由多于 3 条时按优先级截断', () => {
    // 最便宜 + 最近 + 空位充足 + 有充电桩 = 4 条理由，截断后「有充电桩」应被挤掉
    const best = lot({
      id: 'best',
      distanceM: 50,
      tags: ['充电桩'],
      availability: { freeSpots: 450, totalSpots: 500, source: 'estimated' },
    })
    const other = lot({ id: 'other', distanceM: 900, pricing: { ...lot().pricing, firstHour: 9 } })
    const r = scoreLot(best, { allLots: [best, other], hasCharging: true, userNeedsCharging: true })

    expect(r.reasons).toEqual(['空位充足', '单价最低', '距目的地最近'])
  })

  it('基调：空位充足为 good', () => {
    // 目标车场是这批里最远也最贵的，费用与距离因子都贴近 0，
    // 'good' 只可能来自 availability —— 否则这条断言跟可用性无关
    const roomy = lot({
      id: 'roomy',
      distanceM: 2000,
      pricing: { ...lot().pricing, firstHour: 10 },
      availability: { freeSpots: 480, totalSpots: 500, source: 'estimated' },
    })
    const tight = lot({
      id: 'tight',
      distanceM: 100,
      pricing: { ...lot().pricing, firstHour: 4 },
      availability: { freeSpots: 400, totalSpots: 500, source: 'estimated' },
    })
    const r = scoreLot(roomy, { allLots: [roomy, tight], hasCharging: false, userNeedsCharging: false })

    expect(r.factors.availability).toBeGreaterThanOrEqual(0.6)
    expect(r.factors.fee).toBe(0)
    expect(r.tone).toBe('good')
  })

  it('基调：高饱和为 bad', () => {
    const r = scoreLot(lot({ availability: { freeSpots: 10, totalSpots: 100, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.tone).toBe('bad')
  })

  it('总车位为 0 时按空闲率 0 处理，可用性因子归零且基调为 bad', () => {
    const r = scoreLot(lot({ availability: { freeSpots: 0, totalSpots: 0, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.factors.availability).toBe(0)
    expect(r.tone).toBe('bad')
  })

  it('空闲数超过总车位时因子被夹到 1，综合分不越界', () => {
    const r = scoreLot(lot({ availability: { freeSpots: 1000, totalSpots: 500, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.factors.availability).toBe(1)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('目标车场不在候选集合内时因子仍夹在 0–1，综合分不越界', () => {
    // 单独高亮某条推荐就会这么调：目标车场的费用与距离都优于整个候选集合，
    // 不夹紧时费用、距离、可用性三个因子都会超过 1，综合分算出 174
    const orphan = lot({
      id: 'orphan',
      distanceM: 0,
      pricing: { ...lot().pricing, firstHour: 0 },
      availability: { freeSpots: 1000, totalSpots: 500, source: 'estimated' },
      rating: 5,
    })
    const r = scoreLot(orphan, {
      allLots: [
        lot({ id: 'x', distanceM: 1000, pricing: { ...lot().pricing, firstHour: 10 } }),
        lot({ id: 'y', distanceM: 2000, pricing: { ...lot().pricing, firstHour: 20 } }),
      ],
      hasCharging: false,
      userNeedsCharging: false,
    })

    expect(r.factors.fee).toBe(1)
    expect(r.factors.distance).toBe(1)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('评分缺失（NaN）时口碑因子按 0 计，综合分仍是有限数', () => {
    const r = scoreLot(lot({ rating: NaN }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.factors.reputation).toBe(0)
    expect(Number.isFinite(r.score)).toBe(true)
  })

  it('候选集合为空时综合分仍是有限数', () => {
    const r = scoreLot(lot(), { allLots: [], hasCharging: false, userNeedsCharging: false })
    expect(Number.isFinite(r.score)).toBe(true)
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
    const top = topRecommendations(lots, { userNeedsCharging: false }, 2)

    expect(top.length).toBe(2)
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score)
  })

  it('充电桩按各车场自身标签判定，调用方传什么都不影响', () => {
    // 签名已用类型禁掉 hasCharging，这里刻意绕过类型钉住运行时行为：
    // 万一有人从 JS 或旧签名调进来，调用方的值也不能盖过车场自身的 tags
    const withPile = lot({ id: 'pile', tags: ['充电桩'] })
    const withoutPile = lot({ id: 'nopile' })
    const forged = {
      hasCharging: true,
      userNeedsCharging: true,
    } as unknown as Parameters<typeof topRecommendations>[1]
    const top = topRecommendations([withPile, withoutPile], forged, 2)

    expect(top[0].lot.id).toBe('pile')
    expect(top[0].factors.infra).toBe(1)
    expect(top[1].factors.infra).toBe(0)
  })
})
