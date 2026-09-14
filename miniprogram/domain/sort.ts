import type { Recommendation, SortKey } from './types'

/**
 * 余位排序的比较值。未上报（null）取 -1：落在所有有数据的车场之后，
 * 但不删除 —— 「没数据」不该把车场从列表里挤出去
 */
function spotsOf(r: Recommendation): number {
  const f = r.lot.availability.freeSpots
  return typeof f === 'number' && Number.isFinite(f) ? f : -1
}

/**
 * 对推荐结果排序。综合 = 评分降序；其余三个维度各自降序/升序。
 * 返回新数组，不修改入参。
 */
const COMPARATORS: Record<SortKey, (a: Recommendation, b: Recommendation) => number> = {
  composite: (a, b) => b.score - a.score,
  distance: (a, b) => a.lot.distanceM - b.lot.distanceM,
  fee: (a, b) => a.lot.pricing.firstHour - b.lot.pricing.firstHour,
  availability: (a, b) => spotsOf(b) - spotsOf(a),
}

export function sortLots(recs: Recommendation[], key: SortKey): Recommendation[] {
  // 未知 key（例如从本地缓存读回的旧排序状态）回落到综合排序。
  // 必须显式兜底：sort(undefined) 不抛错，而是把元素转成字符串比较后原样返回，
  // 于是「排序坏了」看起来跟「排序生效但恰好没变」一模一样
  const compare = COMPARATORS[key] ?? COMPARATORS.composite
  return recs.slice().sort(compare)
}
