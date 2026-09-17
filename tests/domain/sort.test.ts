import { sortLots } from '../../miniprogram/domain/sort'
import type { ParkingLot, Recommendation, SortKey } from '../../miniprogram/domain/types'

function rec(id: string, score: number, distanceM: number, firstHour: number, freeSpots: number): Recommendation {
  const lot: ParkingLot = {
    id,
    poiId: id,
    signed: true,
    name: id,
    address: '',
    location: { lat: 0, lng: 0 },
    distanceM,
    walkMinutes: 1,
    distanceSource: 'estimated',
    pricing: { firstHour, perHourAfter: firstHour, stepMinutes: 15, capPerDay: 40, source: 'ops' },
    availability: { freeSpots, totalSpots: 500, source: 'ops' },
    ratingSummary: null,
    facilities: [],
  }
  return {
    lot,
    score,
    factors: { fee: 0, distance: 0, availability: 0, infra: 0, reputation: 0 },
    reasons: [],
    tone: 'plain',
  }
}

/** 未签约车场：价格/余位/额度全无，只有距离能参与排序 */
function unsignedRec(id: string, distanceM: number): Recommendation {
  const lot: ParkingLot = {
    id,
    poiId: id,
    signed: false,
    name: id,
    address: '',
    location: { lat: 0, lng: 0 },
    distanceM,
    walkMinutes: 1,
    distanceSource: 'estimated',
    pricing: null,
    availability: null,
    ratingSummary: null,
    facilities: [],
  }
  return {
    lot,
    score: distanceM, // 与排序无关，这里只是占位
    factors: { fee: null, distance: 0, availability: null, infra: 0, reputation: null },
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

  it('签约车场固定在前，未签约无论得分多高都排在签约后面', () => {
    // 未签约这条距离最近、评分也高，但任何排序键下都必须落在签约车场之后
    const mixed = [unsignedRec('U', 50), ...input]
    for (const key of ['composite', 'distance', 'fee', 'availability'] as SortKey[]) {
      const ids = sortLots(mixed, key).map(r => r.lot.id)
      expect(ids.indexOf('U')).toBe(3)
    }
  })

  it('费用档下未签约没有价格，落在所有签约车场之后', () => {
    // 3 家签约各有价格，U 无价格 → fee 升序里 U 必须在最后，而不是被当成 0 元排最前
    const mixed = [unsignedRec('U', 50), ...input]
    expect(sortLots(mixed, 'fee').map(r => r.lot.id)).toEqual(['C', 'B', 'A', 'U'])
  })
})
