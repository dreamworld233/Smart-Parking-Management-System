import type { Recommendation, SortKey } from './types'

/**
 * 对推荐结果排序。综合 = 评分降序；其余三个维度各自降序/升序。
 * 返回新数组，不修改入参。
 */
const COMPARATORS: Record<SortKey, (a: Recommendation, b: Recommendation) => number> = {
  composite: (a, b) => b.score - a.score,
  distance: (a, b) => a.lot.distanceM - b.lot.distanceM,
  fee: (a, b) => a.lot.pricing.firstHour - b.lot.pricing.firstHour,
  availability: (a, b) => b.lot.availability.freeSpots - a.lot.availability.freeSpots,
}

export function sortLots(recs: Recommendation[], key: SortKey): Recommendation[] {
  return recs.slice().sort(COMPARATORS[key])
}
