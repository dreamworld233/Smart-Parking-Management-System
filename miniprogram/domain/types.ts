export type DataSource = 'poi' | 'rule' | 'estimated'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface LotPricing {
  /** 首小时标准价，单位元。预支停车费的单价基准 */
  firstHour: number
  /** 首小时之后的每小时单价 */
  perHourAfter: number
  /** 计费步长（分钟） */
  stepMinutes: 15 | 30 | 60
  /** 单日封顶 */
  capPerDay: number
  /** 夜间费率，可缺省 */
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
  rating: number
  tags: string[]
}

export interface ScoreFactors {
  fee: number
  distance: number
  availability: number
  infra: number
  reputation: number
}

export interface Recommendation {
  lot: ParkingLot
  score: number
  factors: ScoreFactors
  reasons: string[]
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
  /** 到达时间 + 15 分钟，ISO 字符串 */
  enterDeadline: string
  prepaidParkingFee: number
  serviceFee: number
  totalAmount: number
  status: ReservationStatus
  qrPayload: string
}
