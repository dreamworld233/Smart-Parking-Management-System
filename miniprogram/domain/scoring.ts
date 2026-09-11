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

/** 把因子夹到 0–1。types.ts 承诺各因子都在 0–1，越界值会把综合分顶出 0–100 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

/**
 * 在候选集合内把「越小越优」的指标（费用、距离）归一化到 0–1：
 * 最小的得 1，最大的得 0。集合内所有值相同时一律得 1（无从比较，不给惩罚）。
 *
 * 必须夹紧：调用方可能传入**不在 allLots 里**的车场（单独高亮某条推荐就是这种用法），
 * 此时 value 落在 [min, max] 之外，原式会算出 1.99 这类越界因子。
 * 空集合同样得 1 —— 否则 Math.min(...[]) 的 ±Infinity 会一路渗进综合分变成 NaN。
 */
function lowerIsBetter(value: number, all: number[]): number {
  const min = Math.min(...all)
  const max = Math.max(...all)
  if (all.length === 0 || max === min) return 1
  return clamp01(1 - (value - min) / (max - min))
}

export function scoreLot(lot: ParkingLot, ctx: ScoreContext): Recommendation {
  const weights = ctx.weights ?? DEFAULT_WEIGHTS

  // 费用基准只求一次并往下传：归一化与「单价最低」判定必须共用同一份，
  // 各处自己再算一遍 Math.min，会在归一化口径调整时悄悄失配
  const fees = ctx.allLots.map(l => l.pricing.firstHour)
  const minFee = Math.min(...fees)
  const maxFee = Math.max(...fees)

  const feeFactor = lowerIsBetter(lot.pricing.firstHour, fees)
  const distanceFactor = lowerIsBetter(lot.distanceM, ctx.allLots.map(l => l.distanceM))

  // 可用性：空闲率低于饱和下限直接归零；高于下限则从下限到满位线性映射到 0–1。
  // totalSpots 为 0 时按空闲率 0 处理以免除零；非有限值（数据缺失算成 NaN）同样按 0
  const rawFreeRate = lot.availability.totalSpots === 0
    ? 0
    : lot.availability.freeSpots / lot.availability.totalSpots
  const freeRate = Number.isFinite(rawFreeRate) ? rawFreeRate : 0
  // 饱和只在这里判一次，再传给 toneFor / buildReasons。
  // 三处各写一遍 freeRate <= FREE_FLOOR，改一处漏两处就会出现
  // 「可用性因子 > 0 却标红写「高峰紧张」」的自相矛盾产物
  const saturated = freeRate <= FREE_FLOOR
  const availabilityFactor = saturated ? 0 : clamp01((freeRate - FREE_FLOOR) / (1 - FREE_FLOOR))

  // 基础设施：仅纯电/插混车受充电桩影响
  const infraFactor = ctx.userNeedsCharging ? (ctx.hasCharging ? 1 : 0) : 1

  // 口碑：4.0 分以下按 0 计；评分缺失（NaN）同样不给分，避免把整个综合分污染成 NaN
  const reputationFactor = Number.isFinite(lot.rating) ? clamp01((lot.rating - 4.0) / 1.0) : 0

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
    reasons: buildReasons(lot, ctx, factors, saturated, minFee, maxFee),
    tone: toneFor(saturated, factors),
  }
}

/**
 * 推荐理由的整体基调，由领域层判定，页面只管渲染。
 * 页面不得用 reasons 里的中文文案做字符串比较来选颜色。
 */
function toneFor(saturated: boolean, factors: ScoreFactors): ReasonTone {
  if (saturated) return 'bad'
  return factors.availability >= 0.6 || factors.fee >= 0.8 || factors.distance >= 0.8 ? 'good' : 'plain'
}

function buildReasons(
  lot: ParkingLot,
  ctx: ScoreContext,
  factors: ScoreFactors,
  saturated: boolean,
  minFee: number,
  maxFee: number,
): string[] {
  const reasons: string[] = []

  if (saturated) {
    reasons.push('高峰紧张')
  } else if (factors.availability >= 0.6) {
    reasons.push('空位充足')
  }

  if (factors.fee >= 0.8) {
    const diff = lot.pricing.firstHour - minFee
    // 差额先四舍五入到分：5.1 - 5 在浮点下是 0.09999999999999964，直接渲染很难看
    if (diff > 0) reasons.push(`比最低价贵 ¥${Math.round(diff * 100) / 100}`)
    // 候选里根本没有价差时不说「最低」——否则一组同价车场会个个都标「单价最低」
    else if (maxFee > minFee) reasons.push('单价最低')
  }

  if (factors.distance >= 0.8) reasons.push('距目的地最近')

  if (ctx.userNeedsCharging && ctx.hasCharging) reasons.push('有充电桩')

  // 按上面的 push 顺序截断：「有充电桩」排在最后，理由超过 3 条时它最先被挤掉
  return reasons.slice(0, 3)
}

/**
 * 按评分降序取 Top N（PM FR-U06 要求 Top3）。
 *
 * hasCharging 是按**每个车场自己的** tags 推出来的，所以签名里刻意不收它 ——
 * 「车场有没有充电桩」本来就是车场自身的属性，让调用方统一指定既多余又容易填错，
 * 类型上直接禁掉比靠文档约定可靠。
 */
export function topRecommendations(
  lots: ParkingLot[],
  ctx: Omit<ScoreContext, 'allLots' | 'hasCharging'>,
  n = 3,
): Recommendation[] {
  const scored = lots.map(l =>
    scoreLot(l, { ...ctx, allLots: lots, hasCharging: l.tags.includes('充电桩') }),
  )
  return scored.sort((a, b) => b.score - a.score).slice(0, n)
}
