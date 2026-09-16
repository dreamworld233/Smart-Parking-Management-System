// 管理员云函数的薄封装：透传入参 + 自动带上登录票据。
// 所有写操作走云函数，前端不含任何 DB 直写（任务书验收标准）。
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
  return callCloud('adminCreateUser', withToken({ ...input }))
}

export function adminListLots(
  params: { keyword?: string; page?: number; pageSize?: number } = {},
): Promise<ApiResult<{ total: number; list: Lot[] }>> {
  return callCloud('adminListLots', withToken({ ...params }))
}

export function adminUpsertLot(lot: Partial<Lot>): Promise<ApiResult<{ id: string; created: boolean }>> {
  return callCloud('adminUpsertLot', withToken({ lot }))
}

export function adminDeleteLot(lotId: string): Promise<ApiResult<{ lotId: string; status: string }>> {
  return callCloud('adminDeleteLot', withToken({ lotId }))
}

export function adminPriceChange(input: {
  lotId: string
  pricing: Lot['pricing']
  evidenceFileID?: string
  note?: string
}): Promise<ApiResult<{ lotId: string; before: unknown; after: unknown; at: number }>> {
  return callCloud('adminPriceChange', withToken({ ...input }))
}

export function adminLookup(
  params: { plateNo?: string; orderNo?: string; status?: string; page?: number; pageSize?: number } = {},
): Promise<ApiResult<{ total: number; list: Reservation[] }>> {
  return callCloud('adminLookup', withToken({ ...params }))
}

export type VerifyInput =
  | { mode: 'ocr'; imageFileID: string; lotId?: string }
  | { mode: 'manual'; reservationId: string }
  | { mode: 'code'; verifyCode: string; lotId?: string }

export function adminVerifyPlate(input: VerifyInput): Promise<ApiResult<Record<string, unknown>>> {
  return callCloud('adminVerifyPlate', withToken({ ...input }))
}

export function adminStats(): Promise<ApiResult<StatsData>> {
  return callCloud('adminStats', withToken())
}
