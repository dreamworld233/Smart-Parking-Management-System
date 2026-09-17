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
   * - `placeholder`：**演示用暂定值，尚未核实**。单列一档而不是塞进 `ops`，
   *   是为了让界面能直说「这是编的」—— 库里一旦混进没有标记的假数据，
   *   等真实公示价进来时就再也分不出哪条是编的了
   */
  source: 'public' | 'ops' | 'estimated' | 'placeholder'
}

export interface LotAvailability {
  /**
   * 实时余位。**null = 车场端尚未上报**（数据模型 §4）：
   * 界面显示「待上报」，绝不显示 0，更不编数。
   * 注意 `null / totalSpots` 在 JS 里是 0，任何算空闲率的地方必须先判 null
   */
  freeSpots: number | null
  /**
   * 总车位（公示或运营声明）。`placeholder` 同 `LotPricing.source`，
   * 表示演示用暂定值 —— 总车位与余位一起决定空闲率，编的总车位会让
   * 空闲率整体偏移，且这个偏移在界面上看不出来
   */
  totalSpots: number
  /** `reported` = 车场端上报的实时余位（reportAvailability 写入） */
  source: 'public' | 'ops' | 'placeholder' | 'reported'
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

/**
 * 一个展示车场。分两类，用 `signed` 判别（不是子类：WXML 分支靠运行时字段，
 * 判别联合会让所有消费方都套一层收窄，收益不抵复杂度）：
 * - **签约**（`signed: true`）：数据来自云 `lots` 集合，可预约。`pricing` /
 *   `availability` 有值
 * - **未签约**（`signed: false`）：来自腾讯 POI 检索，只提供名称/位置/距离与导航，
 *   不可预约。`pricing` / `availability` 为 `null` —— 没有数据就如实说没有，不编
 *
 * 可预约数 = `availability.freeSpots`（2026-09-17 PM 口径：余位与可预约统一为单数，
 * 预约扣 -1、取消/逾期返还 +1、核销不动）
 */
export interface ParkingLot {
  id: string
  /** 腾讯 POI id。签约车场 = lots 文档的 poiId，未签约 = 检索结果自身 id；用于去重 */
  poiId: string
  /** 是否已签约（可预约）。未签约只提供基础导航 */
  signed: boolean
  name: string
  address: string
  location: GeoPoint
  distanceM: number
  walkMinutes: number
  /** 上面两个数的来源，页面据此决定是否标「估算」 */
  distanceSource: DistanceSource
  pricing: LotPricing | null
  availability: LotAvailability | null
  /** 平台评价聚合。null = 暂无评价，界面显示「暂无评分」 */
  ratingSummary: LotRatingSummary | null
  /** 设施标签，签约时由运营录入（来源 ops），如 `['充电桩']` */
  facilities: string[]
}

/** 各维度得分均为归一化后的 0–1 数值；null = 该因子无数据，未参与本次加权 */
export interface ScoreFactors {
  /** 未签约车场没有价格，fee 同样可以为 null */
  fee: number | null
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

export type ReservationStatus =
  | 'pending_entry'
  | 'entered'
  | 'completed'
  | 'cancelled'
  | 'released'

export interface Reservation {
  id: string
  orderNo: string
  lotId: string
  lotName: string
  plateNo: string
  /** 到达时刻，毫秒时间戳（云函数写入的就是 epoch 毫秒，不是 ISO 串） */
  arriveTime: number
  /** 到达时间 + ENTRY_GRACE_MS，毫秒时间戳 */
  enterDeadline: number
  prepaidParkingFee: number
  serviceFee: number
  totalAmount: number
  status: ReservationStatus
  /** 6 位核销码（设计稿 §5.5 凭证页放大展示） */
  verifyCode?: string
  /** 下单时刻，毫秒时间戳 */
  createdAt?: number
  /** 取消时刻，毫秒时间戳 */
  cancelledAt?: number
  /** 取消退款明细（cancelled 时存在） */
  refundParking?: number
  refundService?: number
  refundTotal?: number
  qrPayload: string
}