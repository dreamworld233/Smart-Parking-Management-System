import { formatDistance } from './format'
import type { ParkingLot, Recommendation } from './types'

/**
 * 地图图钉标签。
 *
 * **车场名不进图钉**，两页统一成这一套短口径。名字动辄 8~10 字，20 条这样的
 * 标签塞进高约 200px 的地图里必然互相压死（2026-09-13 真机踩到）；名字交给
 * 卡片列表，图钉只承担「哪儿有、多少钱」。`★ 推荐` 前缀见 UI 稿 §5.2
 */
export function pinLabel(lot: ParkingLot, recommended = false): string {
  return `${recommended ? '★ 推荐 · ' : ''}¥${lot.pricing.firstHour} · ${formatDistance(lot.distanceM)}`
}

/**
 * 地图上真正画出来的图钉：已排序数组的前 `max` 个，外加「必须在场」的那一个。
 *
 * 为什么要补：两页各有「点卡片与点图钉联动」的要求 —— 首页高亮**选中项**、
 * 搜索页高亮 **★ 推荐**。这两个身份都不随排序跑，切换排序就可能掉出前 max 个，
 * 于是「卡片点了地图上没反应」「★ 不见了」。补回来最多 max + 1 个。
 *
 * 入参要求**已排序**（调用方本来就要用同一份排序结果渲染卡片列表），
 * 所以这里不再自己排一次 —— 排两遍难免有一遍忘了改。
 * `mustIncludeId` 传空串或已不在本批数据里时，不补任何东西
 */
export function pickPins(sorted: Recommendation[], mustIncludeId: string, max: number): Recommendation[] {
  const shown = sorted.slice(0, Math.max(0, max))
  if (!mustIncludeId || shown.some(r => r.lot.id === mustIncludeId)) return shown
  const must = sorted.find(r => r.lot.id === mustIncludeId)
  // concat 而非 push：不修改 slice 出来的数组语义上无所谓，但保持与 sortLots 一致的「返回新数组」约定
  return must ? shown.concat(must) : shown
}
