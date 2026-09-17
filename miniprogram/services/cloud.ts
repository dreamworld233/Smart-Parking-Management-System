/**
 * 全项目触碰 wx.cloud 形状的唯一入口。
 * 不扩全局 typings：云开发 API 面很大，d.ts 里抄官方签名迟早失配，
 * 这里只声明本项目实际用到的那一小块，多出来的能力一概不认
 */
export interface CloudDb {
  collection(name: string): {
    where(cond: Record<string, unknown>): {
      orderBy(field: string, dir: 'asc' | 'desc'): {
        limit(n: number): {
          get(): Promise<{ data: Record<string, unknown>[] }>
        }
      }
      limit(n: number): {
        get(): Promise<{ data: Record<string, unknown>[] }>
      }
    }
  }
}

export interface CloudApi {
  init(opt: { env?: string; traceUser?: boolean }): void
  callFunction(opt: { name: string; data?: Record<string, unknown> }): Promise<{ result: unknown }>
  database(): CloudDb
}

/**
 * 懒取 wx.cloud，而不是模块加载时快照成常量：
 * 测试在 beforeEach 里才 stub 全局 wx，加载时就固化会让 stub 永远不生效；
 * 运行时 wx 恒存在，取不到是基础库过低，返回 null，调用方给明确报错
 */
export function getCloudApi(): CloudApi | null {
  try {
    return (wx as unknown as { cloud?: CloudApi }).cloud ?? null
  } catch {
    return null
  }
}

export interface CloudOk<T> { ok: true; data: T }
export interface CloudErr { ok: false; code: string; message: string }
export type CloudResult<T> = CloudOk<T> | CloudErr

/**
 * 云函数统一返回 `{ code, message, data }`（数据模型 §6 口径）。
 * 网络层异常归一成 `NETWORK`，调用方只看 ok 分支，不用各写一遍 try/catch
 */
export async function callFunction<T>(
  name: string,
  data?: Record<string, unknown>,
): Promise<CloudResult<T>> {
  const api = getCloudApi()
  if (!api) return { ok: false, code: 'NO_CLOUD', message: '基础库不支持云开发' }
  try {
    const res = await api.callFunction({ name, data: data ?? {} })
    const body = res.result as { code?: unknown; message?: unknown; data?: unknown }
    if (body && body.code === 0) return { ok: true, data: body.data as T }
    return {
      ok: false,
      code: String(body?.code ?? 'UNKNOWN'),
      message: String(body?.message ?? '云函数返回异常'),
    }
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: (e as Error)?.message || '云函数调用失败' }
  }
}

export interface LoginResult {
  userId: string
  role: 'driver' | 'lot_admin' | 'ops_admin'
  violationCount: number
  banned: boolean
}

/** 微信身份建档（users 无则建）。2b 起的写操作云函数都以此为身份前提 */
export function ensureLogin(): Promise<CloudResult<LoginResult>> {
  return callFunction<LoginResult>('login')
}

export interface CreateReservationData {
  reservationId: string
  orderNo: string
  verifyCode: string
  /** 到达时刻，毫秒时间戳 */
  arriveTime: number
  /** 入场截止，毫秒时间戳 */
  enterDeadline: number
  leadHours: number
  prepaidParkingFee: number
  serviceFee: number
  totalAmount: number
}

export interface CreateReservationInput {
  lotId: string
  /** 到达时刻，毫秒时间戳 */
  arriveAt: number
  plateNo: string
}

/**
 * 预约下单（付费层核心，云函数 createReservation）。
 * 薄套 callFunction：计价/额度 CAS 全在云端，这里只透传入参与结果
 */
export function createReservation(
  input: CreateReservationInput,
): Promise<CloudResult<CreateReservationData>> {
  // 展开成对象字面量再传：接口类型没有 index signature，直接传会与
  // callFunction 的 `Record<string, unknown>` 参数失配（TS2345）
  return callFunction<CreateReservationData>('createReservation', { ...input })
}

export interface CancelReservationData {
  reservationId: string
  status: string
  usedHours: number
  refundParking: number
  refundService: number
  refundTotal: number
  isBreach: boolean
}

/**
 * 取消预约（云函数 cancelReservation）。
 * 退款公式在云端，这里只透传 reservationId 与退款明细
 */
export function cancelReservation(
  reservationId: string,
): Promise<CloudResult<CancelReservationData>> {
  return callFunction<CancelReservationData>('cancelReservation', { reservationId })
}

/** adminGetLot 返回的车场精简字段（云函数 pickLot 白名单，见 adminGetLot/index.js） */
export interface AdminLot {
  _id: string
  name: string
  address: string
  location: { lat: number; lng: number } | null
  pricing: {
    firstHour?: number
    perHourAfter?: number
    stepMinutes?: number
    capPerDay?: number
    nightRate?: number | null
    source?: string
  } | null
  availability: { freeSpots?: number | null; totalSpots?: number; reportedAt?: number; source?: string } | null
  facilities: string[]
}

export interface AdminGetLotData {
  role: 'driver' | 'lot_admin' | 'ops_admin'
  lot: AdminLot | null
}

/**
 * 车场端身份：取当前用户管理的车场（云函数 adminGetLot）。
 * lot 为 null 表示是车场管理员但未绑定车场，前端显示空态
 */
export function fetchAdminLot(): Promise<CloudResult<AdminGetLotData>> {
  return callFunction<AdminGetLotData>('adminGetLot')
}

/** adminDashboard 返回的看板数据 */
export interface AdminDashboardData {
  lot: {
    _id: string
    name: string
    address: string
    availability: { freeSpots?: number | null; totalSpots?: number; reportedAt?: number; source?: string } | null
  } | null
  todayReservations: number
  pendingEntry: number
  todayIncome: number
  pendingList: {
    _id: string
    plateNo: string
    arriveTime: number
    verifyCode: string
    lotName: string
  }[]
}

/** 车场端看板：统计 + 待核销列表（云函数 adminDashboard，规避安全规则缺口） */
export function fetchAdminDashboard(): Promise<CloudResult<AdminDashboardData>> {
  return callFunction<AdminDashboardData>('adminDashboard')
}

export interface ReportAvailabilityData {
  reportedAt: number
  freeSpots: number
  totalSpots: number
}

/** 余位上报（云函数 reportAvailability） */
export function reportAvailability(
  lotId: string,
  freeSpots: number,
): Promise<CloudResult<ReportAvailabilityData>> {
  return callFunction<ReportAvailabilityData>('reportAvailability', { lotId, freeSpots })
}

export interface UpdateLotData {
  lotId: string
  priceChanged: boolean
}

/**
 * 车场配置更新（云函数 adminUpdateLot）。patch 白名单在云端校验，
 * 这里只透传；pricing 是子对象，其余扁平字段
 */
export function updateLot(
  lotId: string,
  patch: { pricing?: Record<string, unknown>; facilities?: string[]; name?: string; address?: string; openHours?: string | null },
): Promise<CloudResult<UpdateLotData>> {
  return callFunction<UpdateLotData>('adminUpdateLot', { lotId, patch })
}

export interface VerifyReservationData {
  reservationId: string
  plateNo: string
  status: string
  verifyCode: string | null
  enteredAt: number
}

/**
 * 车场端核销（云函数 verifyReservation）。
 * method：'code' 输码 / 'manual' 手动 / 'plate' 车牌识别（OCR 命中，confidence + imageFileID 透传留痕）
 */
export function verifyReservation(
  input: {
    lotId: string
    method: 'code' | 'manual' | 'plate'
    verifyCode?: string
    plateNo?: string
    confidence?: number
    imageFileID?: string
  },
): Promise<CloudResult<VerifyReservationData>> {
  return callFunction<VerifyReservationData>('verifyReservation', { ...input })
}

export interface RecognizePlateData {
  plate: string
  confidence: number | null
  fileID: string
}

/**
 * 车牌识别（云函数 recognizePlate）：上传的车牌照 → 腾讯云 OCR → 车牌 + 置信度。
 * 前端拿到车牌后再调 verifyReservation(method:'plate') 完成核销 —— 识别与核销分离，
 * 低置信度/识别失败可直接降级输码/手动
 */
export function recognizePlate(fileID: string): Promise<CloudResult<RecognizePlateData>> {
  return callFunction<RecognizePlateData>('recognizePlate', { fileID })
}

export interface AdminReservationItem {
  _id: string
  plateNo: string
  arriveTime: number
  status: string
  verifyCode: string
}

export interface AdminReservationsData {
  lot: { _id: string; name: string } | null
  list: AdminReservationItem[]
}

/** 车场端预约核销列表（云函数 adminReservations） */
export function fetchAdminReservations(): Promise<CloudResult<AdminReservationsData>> {
  return callFunction<AdminReservationsData>('adminReservations')
}

export interface SwitchRoleData {
  role: 'driver' | 'lot_admin' | 'ops_admin'
}

/** 切换身份并写 users.role（云函数 switchRole）。角色页选完身份后调用 */
export function switchRole(role: string): Promise<CloudResult<SwitchRoleData>> {
  return callFunction<SwitchRoleData>('switchRole', { role })
}

export interface LotBriefItem {
  _id: string
  name: string
  address: string
  adminUserId: string | null
}

export interface ListAllLotsData {
  list: LotBriefItem[]
}

/** 全部签约车场（云函数 adminListLots）。车场主绑定页用，不鉴权（绑定前身份是 driver） */
export function listAllLots(): Promise<CloudResult<ListAllLotsData>> {
  return callFunction<ListAllLotsData>('adminListLots')
}

export interface BindLotData {
  lotId: string
  name: string
}

/** 车场主绑定车场（云函数 bindLot）：写 lots.adminUserId + users.role = lot_admin */
export function bindLot(lotId: string): Promise<CloudResult<BindLotData>> {
  return callFunction<BindLotData>('bindLot', { lotId })
}
