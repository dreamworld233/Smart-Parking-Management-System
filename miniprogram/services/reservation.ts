import type { Reservation, ReservationStatus } from '../domain/types'
import { getCloudApi } from './cloud'

const STATUSES: ReservationStatus[] = [
  'pending_entry',
  'entered',
  'completed',
  'cancelled',
  'released',
]

/**
 * reservations 集合文档 → Reservation。
 *
 * 逐条校验、坏一条丢一条，与 lot.ts 的 toParkingLot 同口径：控制台手改文档是常态，
 * 一条脏数据不该让整个订单列表白屏。字段缺失返回 null，调用方过滤。
 *
 * arriveTime/enterDeadline/createdAt 都是云函数写入的 epoch 毫秒数；控制台手改
 * 成 ISO 串或 Date 时按「坏文档」丢，不硬转 —— 宁可少一条，不显示错的时间
 */
function toReservation(id: string, doc: Record<string, unknown>): Reservation | null {
  if (typeof doc.orderNo !== 'string') return null
  if (typeof doc.lotId !== 'string' || typeof doc.lotName !== 'string') return null
  if (typeof doc.plateNo !== 'string') return null
  if (typeof doc.arriveTime !== 'number' || typeof doc.enterDeadline !== 'number') return null
  if (
    typeof doc.prepaidParkingFee !== 'number' ||
    typeof doc.serviceFee !== 'number' ||
    typeof doc.totalAmount !== 'number'
  ) {
    return null
  }
  const status = doc.status
  if (typeof status !== 'string' || !STATUSES.includes(status as ReservationStatus)) return null
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
  return {
    id,
    orderNo: doc.orderNo,
    lotId: doc.lotId,
    lotName: doc.lotName,
    plateNo: doc.plateNo,
    arriveTime: doc.arriveTime,
    enterDeadline: doc.enterDeadline,
    prepaidParkingFee: doc.prepaidParkingFee,
    serviceFee: doc.serviceFee,
    totalAmount: doc.totalAmount,
    status: status as ReservationStatus,
    verifyCode: typeof doc.verifyCode === 'string' ? doc.verifyCode : undefined,
    createdAt: num(doc.createdAt),
    cancelledAt: num(doc.cancelledAt),
    refundParking: num(doc.refundParking),
    refundService: num(doc.refundService),
    refundTotal: num(doc.refundTotal),
    qrPayload: '',
  }
}

/**
 * 拉当前用户的预约列表，按下单时间倒序。
 *
 * `userId` 由页面从 ensureLogin() 拿到后传入（前端没有 OPENID 的直接通道；
 * 云函数返回的 userId 就是 openid）。安全规则 `doc.userId == auth.openid` 之外，
 * where 再显式带一次 userId —— 双保险，且 orderBy 走 (userId, createdAt) 组合索引。
 */
export async function fetchMyReservations(userId: string): Promise<Reservation[]> {
  const db = getCloudApi()?.database()
  if (!db) throw new Error('云开发未初始化：请检查 config.local.ts 的 CLOUD_ENV')

  const res = await db
    .collection('reservations')
    .where({ userId })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()
  return res.data
    .map(doc => toReservation(String(doc._id ?? ''), doc))
    .filter((r): r is Reservation => r !== null)
}
