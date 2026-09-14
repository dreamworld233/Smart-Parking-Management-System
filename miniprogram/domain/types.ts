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
  /**
   * 收费数据来源。数据模型设计稿 §3：
   * - `public`：公示价（人工核实，存证在 lot_price_changes）
   * - `ops`：平台运营声明（不谎称实测）
   * - `estimated`：真估算（2a 之后理论上不该再出现，保留用于降级路径）
   */
  source: 'public' | 'ops' | 'estimated'
}

export interface LotAvailability {
  /**
   * 实时余位。**null = 车场端尚未上报**（数据模型 §4）：
   * 界面显示「待上报」，绝不显示 0，更不编数。
   * 注意 `null / totalSpots` 在 JS 里是 0，任何算空闲率的地方必须先判 null
   */
  freeSpots: number | null
  /** 总车位（公示或运营声明） */
  totalSpots: number
  source: 'public' | 'ops'
}

/**
 * 距离与步行时长的来源。
 * - `route`：路径矩阵查到的真实步行路线
 * - `estimated`：直线距离 × 绕行系数估算
 */
export type DistanceSource = 'route' | 'estimated'

/** 平台自有评价的聚合（数据模型 §5.4）。无评价时整体为 null，不编数 */
export interface LotRatingSummary {
  /** 1–5，一位小数 */
  score: number
  /** 参与聚合的评价条数 */
  count: number
}

export interface ParkingLot {
  id: string
  name: string
  address: string
  location: GeoPoint
  distanceM: number
  walkMinutes: number
  /** 上面两个数的来源，页面据此决定是否标「估算」 */
  distanceSource: DistanceSource
  pricing: LotPricing
  availability: LotAvailability
  /** 车场开放的可预约车位数（运营配置；实时剩余随预约扣减，云函数维护） */
  reservableQuota: number
  /** 平台评价聚合。null = 暂无评价，界面显示「暂无评分」 */
  ratingSummary: LotRatingSummary | null
  /** 设施标签，签约时由运营录入（来源 ops），如 `['充电桩']` */
  facilities: string[]
}

/** 各维度得分均为归一化后的 0–1 数值；null = 该因子无数据，未参与本次加权 */
export interface ScoreFactors {
  fee: number
  distance: number
  availability: number | null
  infra: number
  reputation: number | null
}

/** 推荐理由的整体基调，由领域层判定，页面据此选标签配色 */
export type ReasonTone = 'good' | 'bad' | 'plain'

export interface Recommendation {
  lot: ParkingLot
  /** 综合得分，四舍五入后的 0–100 整数（有效因子权重重分配后仍落在此区间） */
  score: number
  factors: ScoreFactors
  /** 可解释推荐理由的展示文案 */
  reasons: string[]
  /** 理由基调，页面不再自行推断 */
  tone: ReasonTone
}

export type SortKey = 'composite' | 'distance' | 'fee' | 'availability'

// 注：'violated' 从状态机移除一事推迟到 2b（见计划头部偏差表）
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