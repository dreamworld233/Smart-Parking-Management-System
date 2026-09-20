// Web 后台消费的数据形状。字段口径与数据模型文档 §4 对齐，
// 时间戳一律 epoch 毫秒（云函数写入口径），不做 ISO 转换。

export type LotSource = 'public' | 'ops' | 'placeholder'

export interface LotPricing {
  firstHour: number
  perHourAfter: number
  stepMinutes: number
  capPerDay: number
  nightRate: number | null
  source: LotSource
}

export interface LotAvailability {
  /** null = 车场端尚未上报，界面显示「待上报」，不显示 0 */
  freeSpots: number | null
  totalSpots: number
  source: LotSource
}

export interface Lot {
  _id: string
  poiId?: string
  name: string
  address: string
  location: { lat: number; lng: number }
  pricing: LotPricing
  availability: LotAvailability
  reservableQuota: number
  reservedCount?: number
  facilities: string[]
  ratingSummary: { score: number; count: number } | null
  note?: string
  contract?: { status: string; signedAt: number }
  updatedAt?: number
}

export type ReservationStatus =
  | 'pending_entry'
  | 'entered'
  | 'completed'
  | 'cancelled'
  | 'released'

export interface Order {
  _id: string
  reservationId: string
  amount: number
  type: 'prepaid' | 'service' | 'refund'
  status: string
  paidAt?: number
}

export interface Reservation {
  _id: string
  orderNo: string
  userId: string
  lotId: string
  lotName: string
  plateNo: string
  arriveTime: number
  enterDeadline: number
  prepaidParkingFee: number
  serviceFee: number
  totalAmount: number
  status: ReservationStatus
  verifyCode?: string
  createdAt?: number
  paidAt?: number
  enteredAt?: number
  cancelledAt?: number
  refundParking?: number
  refundService?: number
  refundTotal?: number
  entryMethod?: string
  orders?: Order[]
}

export interface Session {
  token: string
  userId: string
  role: 'ops_admin' | 'lot_admin'
  username: string
  nickname: string
  expiresAt: number
}

export interface StatsData {
  signedLots: number
  totalReservations: number
  pending: number
  entered: number
  completed: number
  cancelled: number
  released: number
  reportFreshLots: number
  reportFreshRate: number
}
