// 管理员云函数的薄封装：透传入参 + 自动带上登录票据。
// 所有写操作走云函数，前端不含任何 DB 直写（任务书验收标准）。
//
// 命名：云函数统一用 `web*` 前缀（webLogin / webCreateUser / webListLots ...），
// 与小程序车场端那批 `admin*` 函数（adminGetLot / adminUpdateLot ...）区分开，避免撞名。
// 这里导出函数名保留 admin* 是为了少动各页面调用点，实际调的是 web* 云函数。
import { callCloud } from './cloudbase'
import type { ApiResult } from './cloudbase'
import { getToken } from '../store/auth'
import type { Lot, Reservation, Session, StatsData } from '../types'

function withToken(data: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...data, token: getToken() }
}

export function webLogin(username: string, password: string): Promise<ApiResult<Session>> {
  return callCloud<Session>('webLogin', { username, password })
}

export function adminCreateUser(input: {
  username: string
  password: string
  role: string
  nickname?: string
}): Promise<ApiResult<{ userId: string; username: string; role: string }>> {
  return callCloud('webCreateUser', withToken({ ...input }))
}

export function adminListLots(
  params: { keyword?: string; page?: number; pageSize?: number } = {},
): Promise<ApiResult<{ total: number; list: Lot[] }>> {
  return callCloud('webListLots', withToken({ ...params }))
}

export function adminUpsertLot(lot: Partial<Lot>): Promise<ApiResult<{ id: string; created: boolean }>> {
  return callCloud('webUpsertLot', withToken({ lot }))
}

export function adminDeleteLot(lotId: string): Promise<ApiResult<{ lotId: string; status: string }>> {
  return callCloud('webDeleteLot', withToken({ lotId }))
}

export function adminPriceChange(input: {
  lotId: string
  pricing: Lot['pricing']
  evidenceFileID?: string
  note?: string
}): Promise<ApiResult<{ lotId: string; before: unknown; after: unknown; at: number }>> {
  return callCloud('webPriceChange', withToken({ ...input }))
}

export function adminLookup(
  params: { plateNo?: string; orderNo?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<ApiResult<{ total: number; list: Reservation[] }>> {
  return callCloud('webLookup', withToken({ ...params }))
}

export type VerifyInput =
  | { mode: 'ocr'; imageFileID: string; lotId?: string }
  | { mode: 'plate'; reservationId: string; plateNo: string; confidence?: number | null; imageFileID?: string }
  | { mode: 'manual'; reservationId: string }
  | { mode: 'code'; verifyCode: string; lotId?: string }

/**
 * 车牌识别复核（与小程序同流程：识别与核销分离）。
 * 先 mode:'ocr' 识别 + 匹配候选（不核销），运营核对后 mode:'plate' 核销（车牌一致才放行）。
 */
export function adminVerifyPlate(input: VerifyInput): Promise<ApiResult<Record<string, unknown>>> {
  return callCloud('webVerifyPlate', withToken({ ...input }))
}

export function adminStats(): Promise<ApiResult<StatsData>> {
  return callCloud('webStats', withToken())
}
