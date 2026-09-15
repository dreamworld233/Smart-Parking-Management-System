import { formatAmount, formatDistance, formatRatingSummary, formatSpots, sourceNotes } from './format'
import { availabilityLevel, freeRate } from './scoring'
import type { AvailabilityLevel } from './scoring'
import type { ParkingLot, ReasonTone, Recommendation } from './types'

/**
 * 详情视图的全部展示字段。与 `LotCardItem` 同一套路：组件不格式化、不读时钟，
 * 只渲染页面预先算好的字符串 —— 详情与卡片住在同一个面板里，两处各算一遍
 * 必然出现「卡片写 6.00、详情写 6」这种同一笔钱两种写法
 */
export interface LotDetailVM {
  lot: ParkingLot
  score: number
  reasons: string[]
  tone: ReasonTone
  /** 未签约车场 = true。价格/余位/额度卡不渲染，换成「未签约」提示 + 导航 */
  unsigned: boolean
  distanceText: string
  walkText: string
  spotsText: string
  /** 余位配色档位，由 `availabilityLevel(freeRate)` 产出，与列表卡片同一函数 */
  freeClass: AvailabilityLevel
  firstHourText: string
  nextHourText: string
  stepText: string
  capText: string
  /** 整串自带单位，如 `¥3.00/时`；缺夜间价时为 `--` */
  nightText: string
  quotaText: string
  /** 评分聚合展示，如 `★ 4.8（12 条）`；无评价时为「暂无评分」 */
  ratingText: string
  /** 数据来源标注；空数组则调用方不渲染标签区 */
  sourceNotes: string[]
}

/** 数据缺失时的统一占位，与 format.ts 的 UNKNOWN 同口径（0 与「未知」语义不同） */
const UNKNOWN = '--'

export function toDetailVM(rec: Recommendation): LotDetailVM {
  const { lot } = rec
  // 未签约（或签约数据损坏）时只有名称/位置/距离是真实数据，收费/余位/额度一概没有。
  // 页面用 unsigned 分支渲染提示，价格/余位/额度卡整个不出现 —— 比一排「--」诚实。
  // 守卫合并在这里而不是拆两处：让 TS 知道 `!unsigned` 分支里 pricing/availability 非空
  if (!lot.signed || !lot.pricing || !lot.availability) {
    return {
      lot,
      score: rec.score,
      reasons: rec.reasons,
      tone: rec.tone,
      unsigned: true,
      distanceText: formatDistance(lot.distanceM),
      walkText: `${lot.walkMinutes} 分钟`,
      spotsText: UNKNOWN,
      freeClass: 'unknown',
      firstHourText: UNKNOWN,
      nextHourText: UNKNOWN,
      stepText: UNKNOWN,
      capText: UNKNOWN,
      nightText: UNKNOWN,
      quotaText:
        typeof lot.reservableQuota === 'number' && Number.isFinite(lot.reservableQuota)
          ? String(Math.max(0, lot.reservableQuota))
          : UNKNOWN,
      ratingText: formatRatingSummary(lot.ratingSummary),
      sourceNotes: sourceNotes(lot),
    }
  }
  const pricing = lot.pricing
  const availability = lot.availability
  const nightRate = pricing.nightRate
  return {
    lot,
    score: rec.score,
    reasons: rec.reasons,
    tone: rec.tone,
    unsigned: false,
    distanceText: formatDistance(lot.distanceM),
    walkText: `${lot.walkMinutes} 分钟`,
    spotsText: formatSpots(availability.freeSpots, availability.totalSpots),
    // 档位只由领域层判：页面自定 0.1 / 0.25 会让色条与评分对同一车场给出相反结论
    freeClass: availabilityLevel(freeRate(availability)),
    firstHourText: formatAmount(pricing.firstHour),
    nextHourText: formatAmount(pricing.perHourAfter),
    stepText: `${pricing.stepMinutes} 分钟`,
    capText: formatAmount(pricing.capPerDay),
    // 这一格自带单位，与其他几个纯金额字段不同：夜间价可缺省，
    // 分成「¥{{nightText}}/时」渲染时缺值会出来「¥--/时」这种半句话
    nightText: typeof nightRate === 'number' ? `¥${formatAmount(nightRate)}/时` : UNKNOWN,
    // Math.max(0, NaN) 还是 NaN，不挡会在详情里渲染成「已开放 NaN 个预约车位」
    quotaText:
      typeof lot.reservableQuota === 'number' && Number.isFinite(lot.reservableQuota)
        ? String(Math.max(0, lot.reservableQuota))
        : UNKNOWN,
    ratingText: formatRatingSummary(lot.ratingSummary),
    sourceNotes: sourceNotes(lot),
  }
}
