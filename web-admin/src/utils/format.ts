// 展示格式化与标签映射。与 miniprogram/domain/format.ts 的语义对齐：
// 状态标签、来源标注、余位「待上报」、金额两位小数。
import type { LotSource, ReservationStatus } from '../types'

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending_entry: '待入场',
  entered: '已入场',
  completed: '已完成',
  cancelled: '已取消',
  released: '已释放',
}

export const STATUS_TAGS: Record<ReservationStatus, 'warning' | 'success' | 'info' | 'danger'> = {
  pending_entry: 'warning',
  entered: 'success',
  completed: 'info',
  cancelled: 'info',
  released: 'danger',
}

/** 来源标注（数据模型 §3）：placeholder 必须如实标「示例数据，待核实」 */
export const SOURCE_LABELS: Record<LotSource, string> = {
  public: '公示价（已核实）',
  ops: '运营声明',
  placeholder: '示例数据，待核实',
}

export const SOURCE_TAGS: Record<LotSource, 'success' | 'primary' | 'warning'> = {
  public: 'success',
  ops: 'primary',
  placeholder: 'warning',
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  prepaid: '预支停车费',
  service: '平台服务费',
  refund: '退款',
}

export function formatAmount(yuan: number | null | undefined): string {
  if (typeof yuan !== 'number' || !Number.isFinite(yuan)) return '--'
  return yuan.toFixed(2)
}

export function formatTime(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '--'
  const d = new Date(ms)
  const pad = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 余位展示：未上报显示「待上报」，有值显示 free/total（与小程序 formatSpots 同口径） */
export function formatSpots(free: number | null, total: number | null): string {
  if (free === null) return '待上报'
  const t = typeof total === 'number' ? String(total) : '--'
  return `${free}/${t}`
}

export function formatPlate(plate: string): string {
  const raw = plate.replace(/·/g, '')
  if (raw.length < 4) return plate
  return `${raw.slice(0, 2)}·${raw.slice(2)}`
}
