import type { Recommendation, SortKey } from './types'

/**
 * 余位排序的比较值。未上报（null）或未签约（availability null）取 -1：
 * 落在所有有数据的车场之后，但不删除 —— 「没数据」不该把车场从列表里挤出去
 */
function spotsOf(r: Recommendation): number {
  const f = r.lot.availability?.freeSpots
  return typeof f === 'number' && Number.isFinite(f) ? f : -1
}

/**
 * 对推荐结果排序。**签约车场固定在前**（用户 2026-09-15 拍板：可预约的优先，
 * 不会被没有预约能力的车场干扰），组内再按各自维度排。返回新数组，不修改入参。
 */
const COMPARATORS: Record<SortKey, (a: Recommendation, b: Recommendation) => number> = {
  composite: (a, b) => b.score - a.score,
  distance: (a, b) => a.lot.distanceM - b.lot.distanceM,
  // 未签约没有价格，价格比较值取正无穷：落在所有签约车场之后
  fee: (a, b) => (a.lot.pricing?.firstHour ?? Infinity) - (b.lot.pricing?.firstHour ?? Infinity),
  availability: (a, b) => spotsOf(b) - spotsOf(a),
}

function signedFirst(a: Recommendation, b: Recommendation): number {
  if (a.lot.signed !== b.lot.signed) return a.lot.signed ? -1 : 1
  return 0
}

export function sortLots(recs: Recommendation[], key: SortKey): Recommendation[] {
  // 未知 key（例如从本地缓存读回的旧排序状态）回落到综合排序。
  // 必须显式兜底：sort(undefined) 不抛错，而是把元素转成字符串比较后原样返回，
  // 于是「排序坏了」看起来跟「排序生效但恰好没变」一模一样
  const compare = COMPARATORS[key] ?? COMPARATORS.composite
  return recs.slice().sort((a, b) => signedFirst(a, b) || compare(a, b))
}
