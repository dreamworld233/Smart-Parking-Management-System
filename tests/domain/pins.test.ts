import { pickPins, pinLabel } from '../../miniprogram/domain/pins'
import type { ParkingLot, Recommendation } from '../../miniprogram/domain/types'

function lot(id: string, distanceM: number, firstHour: number): ParkingLot {
  return {
    id,
    name: `${id}地下停车场`,
    address: '',
    location: { lat: 0, lng: 0 },
    distanceM,
    walkMinutes: 1,
    distanceSource: 'estimated',
    pricing: { firstHour, perHourAfter: firstHour, stepMinutes: 15, capPerDay: 40, source: 'estimated' },
    availability: { freeSpots: 10, totalSpots: 500, source: 'estimated' },
    reservableQuota: 10,
    rating: 4.5,
    tags: [],
  }
}

function rec(id: string, score: number, distanceM = 100, firstHour = 6): Recommendation {
  return {
    lot: lot(id, distanceM, firstHour),
    score,
    factors: { fee: 0, distance: 0, availability: 0, infra: 0, reputation: 0 },
    reasons: [],
    tone: 'plain',
  }
}

describe('pinLabel', () => {
  it('不带推荐前缀时只有价格与距离', () => {
    expect(pinLabel(lot('A', 320, 6))).toBe('¥6 · 320m')
  })

  it('推荐的那条带 ★ 推荐 前缀（UI 稿 §5.2）', () => {
    expect(pinLabel(lot('A', 320, 6), true)).toBe('★ 推荐 · ¥6 · 320m')
  })

  it('车场名不进图钉 —— 名字长了必然互相压死，名字交给卡片', () => {
    expect(pinLabel(lot('A', 320, 6))).not.toContain('地下停车场')
  })

  it('距离走 formatDistance，超 1 公里换成 km', () => {
    expect(pinLabel(lot('A', 1400, 6))).toBe('¥6 · 1.4km')
  })

  it('距离缺失时不渲染 NaN', () => {
    expect(pinLabel(lot('A', Number.NaN, 6))).toBe('¥6 · --')
  })
})

describe('pickPins', () => {
  const sorted = [rec('A', 92), rec('B', 88), rec('C', 71), rec('D', 60), rec('E', 55)]

  it('只取前 max 个', () => {
    expect(pickPins(sorted, '', 3).map(r => r.lot.id)).toEqual(['A', 'B', 'C'])
  })

  it('max 大于总数时全给', () => {
    expect(pickPins(sorted, '', 99).map(r => r.lot.id)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('必须在场的那条掉出前 max 个时补回来', () => {
    // ★ 推荐 / 选中项都不随排序跑，排序一切换就可能落到 8 名开外
    expect(pickPins(sorted, 'D', 2).map(r => r.lot.id)).toEqual(['A', 'B', 'D'])
  })

  it('必须在场的那条本来就在前 max 个里时不重复', () => {
    expect(pickPins(sorted, 'B', 3).map(r => r.lot.id)).toEqual(['A', 'B', 'C'])
  })

  it('id 为空或已不在本批数据里时不补任何东西', () => {
    expect(pickPins(sorted, '', 2).map(r => r.lot.id)).toEqual(['A', 'B'])
    expect(pickPins(sorted, 'GONE', 2).map(r => r.lot.id)).toEqual(['A', 'B'])
  })

  it('max 为 0 时只剩必须在场的那条', () => {
    expect(pickPins(sorted, 'C', 0).map(r => r.lot.id)).toEqual(['C'])
  })

  it('不修改入参数组', () => {
    const before = sorted.map(r => r.lot.id)
    pickPins(sorted, 'E', 2)
    expect(sorted.map(r => r.lot.id)).toEqual(before)
  })
})
