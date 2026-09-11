import type { ParkingLot, ReasonTone, Recommendation, ScoreFactors } from './types'

/** 占用率警戒线：占用率超过该值即为饱和，推荐时降权或剔除（PM 2.2） */
export const SATURATION_THRESHOLD = 0.85

/**
 * 饱和对应的「空闲率」下限 = 1 - 占用率警戒线。
 * 方向很容易搞反：PM 的 0.85 约束的是**占用率**上限，不是空闲率下限。
 * 直接拿 0.85 去和 freeRate 比，会把空位充足的车场也判成饱和，
 * 而且会让归一化落到负区间（空闲率 0.8 时算出 -0.33）。
 */
export const FREE_FLOOR = 1 - SATURATION_THRESHOLD

export interface ScoreWeights {
  fee: number
  distance: number
  availability: number
  infra: number
  reputation: number
}

/** PM 表 5 的默认权重 */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  fee: 0.3,
  distance: 0.15,
  availability: 0.25,
  infra: 0.2,
  reputation: 0.1,
}

/** 就医场景：可用性权重上调、费用下调（PM 2.2） */
export const MEDICAL_WEIGHTS: ScoreWeights = { ...DEFAULT_WEIGHTS, availability: 0.35, fee: 0.2 }

/**
 * 通勤场景：费用权重上调（PM 2.2）。
 * 抬 fee 的同时必须砍 distance —— 权重合计恒为 1 是评分落在 0–100 的前提，
 * 只加不减会让满分变成 110。
 */
export const COMMUTE_WEIGHTS: ScoreWeights = { ...DEFAULT_WEIGHTS, fee: 0.4, distance: 0.05 }

export interface ScoreContext {
  /** 同一批候选车场，用于归一化 */
  allLots: ParkingLot[]
  /** 该车场是否有充电桩 */
  hasCharging: boolean
  /** 用户车辆是否需要充电（纯电 / 插混） */
  userNeedsCharging: boolean
  weights?: ScoreWeights
}

/**
 * 在候选集合内把「越小越优」的指标（费用、距离）归一化到 0–1：
 * 最小的得 1，最大的得 0。集合内所有值相同时一律得 1（无从比较，不给惩罚）。
 */
function lowerIsBetter(value: number, all: number[]): number {
  const min = Math.min(...all)
  const max = Math.max(...all)
  if (max === min) return 1
  return 1 - (value - min) / (max - min)
}

export function scoreLot(lot: ParkingLot, ctx: ScoreContext): Recommendation {
  const weights = ctx.weights ?? DEFAULT_WEIGHTS

  const feeFactor = lowerIsBetter(lot.pricing.firstHour, ctx.allLots.map(l => l.pricing.firstHour))
  const distanceFactor = lowerIsBetter(lot.distanceM, ctx.allLots.map(l => l.distanceM))

  // 可用性：空闲率低于饱和下限直接归零；高于下限则从下限到满位线性映射到 0–1
  const freeRate = lot.availability.totalSpots === 0
    ? 0
    : lot.availability.freeSpots / lot.availability.totalSpots
  const availabilityFactor = freeRate <= FREE_FLOOR ? 0 : (freeRate - FREE_FLOOR) / (1 - FREE_FLOOR)

  // 基础设施：仅纯电/插混车受充电桩影响
  const infraFactor = ctx.userNeedsCharging ? (ctx.hasCharging ? 1 : 0) : 1

  // 口碑：4.0 分以下按 0 计
  const reputationFactor = Math.max(0, Math.min(1, (lot.rating - 4.0) / 1.0))

  const factors: ScoreFactors = {
    fee: feeFactor,
    distance: distanceFactor,
    availability: availabilityFactor,
    infra: infraFactor,
    reputation: reputationFactor,
  }

  const raw =
    weights.fee * factors.fee +
    weights.distance * factors.distance +
    weights.availability * factors.availability +
    weights.infra * factors.infra +
    weights.reputation * factors.reputation

  return {
    lot,
    score: Math.round(raw * 100),
    factors,
    reasons: buildReasons(lot, ctx, factors, freeRate),
    tone: toneFor(freeRate, factors),
  }
}

/**
 * 推荐理由的整体基调，由领域层判定，页面只管渲染。
 * 页面不得用 reasons 里的中文文案做字符串比较来选颜色。
 */
function toneFor(freeRate: number, factors: ScoreFactors): ReasonTone {
  if (freeRate <= FREE_FLOOR) return 'bad'
  return factors.availability >= 0.6 || factors.fee >= 0.8 || factors.distance >= 0.8 ? 'good' : 'plain'
}

function buildReasons(
  lot: ParkingLot,
  ctx: ScoreContext,
  factors: ScoreFactors,
  freeRate: number,
): string[] {
  const reasons: string[] = []

  if (freeRate <= FREE_FLOOR) {
    reasons.push('高峰紧张')
  } else if (factors.availability >= 0.6) {
    reasons.push('空位充足')
  }

  if (factors.fee >= 0.8) {
    const cheapest = Math.min(...ctx.allLots.map(l => l.pricing.firstHour))
    const diff = lot.pricing.firstHour - cheapest
    if (diff > 0) reasons.push(`比最低价贵 ¥${diff}`)
    else reasons.push('单价最低')
  }

  if (factors.distance >= 0.8) reasons.push('距目的地最近')

  if (ctx.userNeedsCharging && ctx.hasCharging) reasons.push('有充电桩')

  return reasons.slice(0, 3)
}

/**
 * 按评分降序取 Top N（PM FR-U06 要求 Top3）。
 *
 * 注意 hasCharging 是按**每个车场自己的** tags 推出来的，会覆盖 ctx 里传进来的同名值 ——
 * 「车场有没有充电桩」本来就是车场自身的属性，不应由调用方统一指定。
 * ctx.hasCharging 只在直接调用 scoreLot 时才需要调用方自己填对。
 */
export function topRecommendations(lots: ParkingLot[], ctx: Omit<ScoreContext, 'allLots'>, n = 3): Recommendation[] {
  const scored = lots.map(l =>
    scoreLot(l, { ...ctx, allLots: lots, hasCharging: l.tags.includes('充电桩') }),
  )
  return scored.sort((a, b) => b.score - a.score).slice(0, n)
}
