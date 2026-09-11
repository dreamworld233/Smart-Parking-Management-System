export type DataSource = 'poi' | 'rule' | 'estimated'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface LotPricing {
  /** 首小时标准价，单位元。预支停车费的单价基准 */
  firstHour: number
  /** 首小时之后的每小时单价，单位元 */
  perHourAfter: number
  /** 计费步长（分钟） */
  stepMinutes: 15 | 30 | 60
  /** 单日封顶，单位元 */
  capPerDay: number
  /** 夜间费率（22:00–次日 08:00），单位元，可缺省 */
  nightRate?: number
  source: DataSource
}

export interface LotAvailability {
  freeSpots: number
  totalSpots: number
  source: DataSource
}

export interface ParkingLot {
  id: string
  name: string
  address: string
  location: GeoPoint
  distanceM: number
  walkMinutes: number
  pricing: LotPricing
  availability: LotAvailability
  /** 车场开放的可预约车位数 */
  reservableQuota: number
  /** 车场评分，0–5 */
  rating: number
  tags: string[]
}

/** 各维度得分均为归一化后的 0–1 数值 */
export interface ScoreFactors {
  /** 费用维度，0–1 */
  fee: number
  /** 距离维度，0–1 */
  distance: number
  /** 空位维度，0–1 */
  availability: number
  /** 设施维度，0–1 */
  infra: number
  /** 口碑维度，0–1 */
  reputation: number
}

/** 推荐理由的整体基调，由领域层判定，页面据此选标签配色 */
export type ReasonTone = 'good' | 'bad' | 'plain'

export interface Recommendation {
  lot: ParkingLot
  /** 综合得分，四舍五入后的 0–100 整数 */
  score: number
  factors: ScoreFactors
  /** 可解释推荐理由的展示文案 */
  reasons: string[]
  /** 理由基调，页面不再自行推断 */
  tone: ReasonTone
}

export type SortKey = 'composite' | 'distance' | 'fee' | 'availability'

export type ReservationStatus =
  | 'pending_entry'
  | 'entered'
  | 'completed'
  | 'cancelled'
  | 'violated'
  | 'released'

export interface Reservation {
  id: string
  orderNo: string
  lotId: string
  lotName: string
  plateNo: string
  /** ISO 字符串 */
  arriveTime: string
  /** 到达时间 + ENTRY_GRACE_MINUTES，ISO 字符串 */
  enterDeadline: string
  prepaidParkingFee: number
  serviceFee: number
  totalAmount: number
  status: ReservationStatus
  qrPayload: string
}
