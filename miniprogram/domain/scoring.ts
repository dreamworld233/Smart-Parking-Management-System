import { formatAmount } from './format'
import type { LotAvailability, ParkingLot, ReasonTone, Recommendation, ScoreFactors } from './types'

/** 占用率警戒线：占用率超过该值即为饱和，推荐时降权或剔除（PM 2.2） */
export const SATURATION_THRESHOLD = 0.85

/**
 * 饱和对应的「空闲率」下限 = 1 - 占用率警戒线。
 * 方向很容易搞反：PM 的 0.85 约束的是**占用率**上限，不是空闲率下限。
 * 直接拿 0.85 去和 freeRate 比，会把空位充足的车场也判成饱和，
 * 而且会让归一化落到负区间（空闲率 0.8 时算出 -0.33）。
 */
export const FREE_FLOOR = 1 - SATURATION_THRESHOLD

/** 是否达到饱和：空闲率不高于饱和下限。评分与展示档位共用这一条判定 */
export function isSaturated(freeRate: number): boolean {
  return freeRate <= FREE_FLOOR
}

/**
 * 「接近饱和」的警戒倍数：空闲率不到饱和线的这么多倍时判 warn。
 *
 * 留这段余量而不直接拿饱和线当上界，是因为车场需要一点缓冲：贴着线判 warn
 * 的话，一次普通的高峰就会把它顶进红色档，档位会在临界点附近反复横跳。
 * 仅用于展示档位，不参与评分。
 *
 * 取值必须落在 (1, 1/FREE_FLOOR)：等于 1 时 warn 档整个不可达（bad 与 ok 直接相邻），
 * 大于等于 1/FREE_FLOOR 时 ok 档不可达（空闲率拉满到 1 也还是 warn）。
 * 上界这半句以「空闲率不超过 1」为前提 —— freeRate 对 freeSpots 大于 totalSpots
 * 的脏数据并不封顶，那种输入下 ok 仍可能出现，饱和判定不受影响。
 * 这两个边界是用户可见的：调大倍数就是加宽琥珀色带。
 */
export const AVAILABILITY_WARN_RATIO = 2

export type AvailabilityLevel = 'ok' | 'warn' | 'bad' | 'unknown'

/**
 * 空位展示档位。
 *
 * NaN（未上报 / totalSpots 缺失之外的无效值）归 unknown 灰档：
 * 缺数据的失败方向是「如实说没数据」，不是「宁可显示紧张」 ——
 * 余位从未上报时显示红色「紧张」是造谣，显示灰色「待上报」才是诚实。
 * 阈值全部由 FREE_FLOOR 派生，页面不得自定 0.1 / 0.25 这类数字。
 */
export function availabilityLevel(freeRate: number): AvailabilityLevel {
  if (!Number.isFinite(freeRate)) return 'unknown'
  if (isSaturated(freeRate)) return 'bad'
  if (freeRate <= FREE_FLOOR * AVAILABILITY_WARN_RATIO) return 'warn'
  return 'ok'
}

/**
 * 空闲率。*null（未上报）返回 NaN*，把「没数据」与「满员/坏了」分开 ——
 * `null / totalSpots` 在 JS 里是 0，不先判 null 就会把「未上报」算成「满员」。
 * totalSpots 为 0（除零）按 0 处理：0 落在饱和区间，那个失败方向是安全的。
 */
export function freeRate(availability: LotAvailability): number {
  if (availability.freeSpots === null) return NaN
  const raw = availability.totalSpots === 0
    ? 0
    : availability.freeSpots / availability.totalSpots
  return Number.isFinite(raw) ? raw : 0
}

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
  // 各处自己再算一遍 Math.min，会在归一化口径调整时悄悄失配。
  // 只有签约车场有价格（未签约 pricing 为 null），价格因子缺席时权重重分配
  const signed = ctx.allLots.filter(l => l.signed)
  const fees = signed.map(l => l.pricing!.firstHour)
  const minFee = fees.length ? Math.min(...fees) : NaN
  const maxFee = fees.length ? Math.max(...fees) : NaN

  const feeFactor = lot.pricing
    ? lowerIsBetter(lot.pricing.firstHour, fees)
    : null
  const distanceFactor = lowerIsBetter(lot.distanceM, ctx.allLots.map(l => l.distanceM))

  // 可用性：空闲率低于饱和下限直接归零；高于下限则从下限到满位线性映射到 0–1。
  // 除零与缺失值口径收敛在 freeRate()。未签约无余位数据，因子缺席
  const rate = lot.availability ? freeRate(lot.availability) : NaN
  // 饱和判定只有 isSaturated 一处定义；这里求一次再传给 toneFor / buildReasons。
  const saturated = lot.availability ? isSaturated(rate) : false
  // 余位未上报（NaN）或未签约时可用性因子整体缺席，而不是记 0 分 ——
  // 记 0 分是对「没数据」的系统性惩罚，与口碑同理（数据模型 §5.4）
  const availabilityFactor = lot.availability && !Number.isNaN(rate)
    ? (saturated ? 0 : clamp01((rate - FREE_FLOOR) / (1 - FREE_FLOOR)))
    : null

  // 基础设施：仅纯电/插混车受充电桩影响
  const infraFactor = ctx.userNeedsCharging ? (ctx.hasCharging ? 1 : 0) : 1

  // 口碑冷启动：无评价为 null，不惩罚新车场（数据模型 §5.4）
  const summary = lot.ratingSummary
  const reputationFactor = summary && summary.count > 0 && Number.isFinite(summary.score)
    ? clamp01((summary.score - 4.0) / 1.0)
    : null

  const factors: ScoreFactors = {
    fee: feeFactor,
    distance: distanceFactor,
    availability: availabilityFactor,
    infra: infraFactor,
    reputation: reputationFactor,
  }

  // 有效因子权重重分配：缺一个因子就把它那份权重按比例分给剩下的，
  // 而不是当成 0 分。distance 恒有值（权重至少 0.15），除零不可达；
  // 未签约车场 pricing/availability 缺席，权重重分配后得分退化为纯距离
  let weightSum = 0
  let raw = 0
  const pairs: Array<[number, number | null]> = [
    [weights.fee, feeFactor],
    [weights.distance, distanceFactor],
    [weights.availability, availabilityFactor],
    [weights.infra, infraFactor],
    [weights.reputation, reputationFactor],
  ]
  for (const [w, f] of pairs) {
    if (f === null) continue
    weightSum += w
    raw += w * f
  }

  return {
    lot,
    score: Math.round((raw / weightSum) * 100),
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
  const availabilityGood = factors.availability !== null && factors.availability >= 0.6
  const feeGood = factors.fee !== null && factors.fee >= 0.8
  return availabilityGood || feeGood || factors.distance >= 0.8 ? 'good' : 'plain'
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
  } else if (factors.availability !== null && factors.availability >= 0.6) {
    reasons.push('空位充足')
  }

  // 未签约没有价格，价格类理由一律不出（fee 因子缺席时为 null，自然也到不了 0.8）
  if (factors.fee !== null && factors.fee >= 0.8 && lot.pricing) {
    const diff = lot.pricing.firstHour - minFee
    // 金额一律走 formatAmount：自己拼会把 5.1 - 5（浮点下 0.09999999999999964）
    // 渲染成 ¥0.1，而同一笔钱在列表里是 ¥0.10
    if (diff > 0) reasons.push(`比最低价贵 ¥${formatAmount(diff)}`)
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
 * hasCharging 是按**每个车场自己的** facilities 推出来的，所以签名里刻意不收它 ——
 * 「车场有没有充电桩」本来就是车场自身的属性，让调用方统一指定既多余又容易填错，
 * 类型上直接禁掉比靠文档约定可靠。
 */
export function topRecommendations(
  lots: ParkingLot[],
  ctx: Omit<ScoreContext, 'allLots' | 'hasCharging'>,
  n = 3,
): Recommendation[] {
  const scored = lots.map(l =>
    scoreLot(l, { ...ctx, allLots: lots, hasCharging: l.facilities.includes('充电桩') }),
  )
  return scored.sort((a, b) => b.score - a.score).slice(0, n)
}
