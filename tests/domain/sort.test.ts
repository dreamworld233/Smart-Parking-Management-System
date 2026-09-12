import { sortLots } from '../sort'
import type { ParkingLot, Recommendation, SortKey } from '../types'

function rec(id: string, score: number, distanceM: number, firstHour: number, freeSpots: number): Recommendation {
  const lot: ParkingLot = {
    id,
    name: id,
    address: '',
    location: { lat: 0, lng: 0 },
    distanceM,
    walkMinutes: 1,
    pricing: { firstHour, perHourAfter: firstHour, stepMinutes: 15, capPerDay: 40, source: 'estimated' },
    availability: { freeSpots, totalSpots: 500, source: 'estimated' },
    reservableQuota: 10,
    rating: 4.5,
    tags: [],
  }
  return {
    lot,
    score,
    factors: { fee: 0, distance: 0, availability: 0, infra: 0, reputation: 0 },
    reasons: [],
    tone: 'plain',
  }
}

// 四个维度各自给出**互不相同**的顺序（composite A,B,C / distance C,A,B / fee C,B,A / availability B,A,C），
// 否则某个比较器退化成按评分排也会蒙混过关
const input = [
  rec('B', 88, 890, 5, 112),
  rec('A', 92, 320, 6, 46),
  rec('C', 71, 100, 4, 3),
]

describe('sortLots', () => {
  it('综合：按评分降序', () => {
    expect(sortLots(input, 'composite').map(r => r.lot.id)).toEqual(['A', 'B', 'C'])
  })

  it('距离：最近的在前', () => {
    expect(sortLots(input, 'distance').map(r => r.lot.id)).toEqual(['C', 'A', 'B'])
  })

  it('费用：最便宜的在前', () => {
    expect(sortLots(input, 'fee').map(r => r.lot.id)).toEqual(['C', 'B', 'A'])
  })

  it('空位：余位最多的在前', () => {
    expect(sortLots(input, 'availability').map(r => r.lot.id)).toEqual(['B', 'A', 'C'])
  })

  it('未知排序键回落到综合排序，而不是原样返回', () => {
    // 缓存里可能存着历史版本的排序键，此时必须仍然有序
    expect(sortLots(input, 'rating' as SortKey).map(r => r.lot.id)).toEqual(['A', 'B', 'C'])
  })

  it('不修改入参数组', () => {
    const before = input.map(r => r.lot.id)
    sortLots(input, 'fee')
    expect(input.map(r => r.lot.id)).toEqual(before)
  })
})
