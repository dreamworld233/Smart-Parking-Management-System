// 【本地验收预览用 · mock 数据】只在 vite.shot.config.ts 的别名下生效，正常 npm run dev 不会加载。
// 目的：本地没有云环境凭据时，让 7 个页面都能渲染出接近真实的数据，方便验收核对视觉。
// 场景由 localStorage.spms_shot_mock 决定：default / healthy / empty。
// 本地定义，避免 import './cloudbase' 被别名绕回自己
type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

const KEY = 'spms_shot_mock'
function scenario(): string {
  try {
    return localStorage.getItem(KEY) || 'default'
  } catch {
    return 'default'
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const LOT_NAMES: [string, string, number, number, number][] = [
  ['万象城地下停车场', '合肥市蜀山区潜山路 111 号', 31.8334, 117.2281, 420],
  ['市人民医院立体车库', '合肥市庐阳区淮河路 246 号', 31.8672, 117.2865, 260],
  ['滨湖银泰城停车场', '合肥市包河区庐州大道 1 号', 31.7412, 117.3008, 680],
  ['高铁南站 P3 停车场', '合肥市蜀山区潜山路 600 号', 31.8001, 117.2419, 1200],
  ['政务区天鹅湖万达', '合肥市蜀山区东流路 1 号', 31.8226, 117.2145, 540],
  ['安徽大学磬苑校区', '合肥市经开区九龙路 111 号', 31.7693, 117.1817, 300],
  ['新桥机场 T1 远端', '合肥市肥西县高刘镇', 31.9801, 116.9766, 900],
  ['三里庵国购广场', '合肥市蜀山区长江西路 199 号', 31.8504, 117.2461, 380],
  ['瑶海万达广场', '合肥市瑶海区长江东路 128 号', 31.8607, 117.3392, 460],
  ['包河万达地下车库', '合肥市包河区马鞍山路 130 号', 31.8526, 117.3062, 520],
  ['高新银泰城', '合肥市高新区望江西路 1 号', 31.8365, 117.1356, 610],
  ['经开万达广场', '合肥市经开区繁华大道 1 号', 31.7523, 117.1976, 430],
]

function makeLots() {
  return LOT_NAMES.map((n, i) => ({
    _id: 'lot_' + i,
    name: n[0],
    address: n[1],
    location: { lat: n[2], lng: n[3] },
    pricing: {
      firstHour: [3, 4, 5, 2, 3, 2, 6, 4, 3, 5, 3, 4][i],
      perHourAfter: [2, 3, 3, 1.5, 2, 1, 4, 2, 2, 3, 2, 3][i],
      stepMinutes: 60,
      capPerDay: [15, 20, 25, 12, 15, 10, 40, 20, 15, 25, 15, 20][i],
      nightRate: i % 4 === 0 ? null : 5,
      source: (['public', 'ops', 'placeholder'] as const)[i % 3],
    },
    availability: {
      freeSpots: i === 6 ? null : [86, 42, 210, 355, 120, 64, null, 91, 133, 158, 201, 77][i],
      totalSpots: n[4],
      source: (['public', 'ops', 'placeholder'] as const)[i % 3],
    },
    reservableQuota: [40, 20, 60, 100, 50, 30, 80, 40, 45, 50, 55, 42][i],
    reservedCount: [12, 7, 23, 41, 18, 9, 26, 14, 16, 19, 21, 11][i],
    facilities: [['充电桩', '电梯直达'], ['无障碍车位'], ['充电桩'], ['电梯直达', '洗车'], ['充电桩', '电梯直达'], [], ['充电桩', '接驳车'], [], ['充电桩'], ['电梯直达'], ['充电桩'], []][i],
    ratingSummary: { score: 4.2 + (i % 5) * 0.15, count: 30 + i * 7 },
    note: i % 3 === 2 ? '价格取自公开渠道，待现场核实' : '',
    contract: { status: i === 10 ? 'disabled' : 'signed', signedAt: 1757000000000 + i * 86400000 },
    updatedAt: 1758000000000 + i * 3600000,
  }))
}

const PLATES = ['皖A12345', '皖A88888', '皖AD67890', '皖AF11223', '皖A55566', '皖AZ33445', '皖A9K7788', '皖AH22110']
const STATUSES = ['pending_entry', 'entered', 'completed', 'cancelled', 'released'] as const

function makeReservations(count: number) {
  const lots = makeLots()
  return Array.from({ length: count }, (_, i) => {
    const st = STATUSES[i % 5]
    const lot = lots[i % lots.length]
    const prepaid = 6 + (i % 7) * 3
    const service = 1
    return {
      _id: 'res_' + i,
      orderNo: 'SP' + (1758000000000 + i * 613000).toString().slice(-12) + i,
      userId: 'u_' + (i % 40),
      lotId: lot._id,
      lotName: lot.name,
      plateNo: PLATES[i % PLATES.length],
      arriveTime: 1758000000000 + i * 1800000,
      enterDeadline: 1758000000000 + i * 1800000 + 1800000,
      prepaidParkingFee: prepaid,
      serviceFee: service,
      totalAmount: prepaid + service,
      status: st,
      verifyCode: st === 'pending_entry' ? String(100000 + ((i * 7919) % 899999)) : undefined,
      createdAt: 1757999000000 + i * 1700000,
      entryMethod: st === 'entered' || st === 'completed' ? (['ocr', 'code', 'manual'] as const)[i % 3] : undefined,
      refundTotal: st === 'cancelled' ? prepaid : st === 'released' ? prepaid : undefined,
      orders: [
        { _id: 'o1_' + i, reservationId: 'res_' + i, amount: prepaid, type: 'prepaid', status: 'paid', paidAt: 1757999000000 + i * 1700000 },
        { _id: 'o2_' + i, reservationId: 'res_' + i, amount: service, type: 'service', status: 'paid', paidAt: 1757999000000 + i * 1700000 },
        ...(st === 'cancelled' || st === 'released'
          ? [{ _id: 'o3_' + i, reservationId: 'res_' + i, amount: -prepaid, type: 'refund', status: 'refunded', paidAt: 1758001000000 + i * 1700000 }]
          : []),
      ],
    }
  })
}

const STATS: Record<string, Record<string, number>> = {
  default: { signedLots: 12, totalReservations: 1284, pending: 96, entered: 78, completed: 942, cancelled: 121, released: 47, reportFreshLots: 0, reportFreshRate: 0 },
  healthy: { signedLots: 12, totalReservations: 1284, pending: 96, entered: 78, completed: 942, cancelled: 121, released: 47, reportFreshLots: 9, reportFreshRate: 75 },
  empty: { signedLots: 0, totalReservations: 0, pending: 0, entered: 0, completed: 0, cancelled: 0, released: 0, reportFreshLots: 0, reportFreshRate: 0 },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callCloud<T>(name: string, data?: Record<string, unknown>): Promise<ApiResult<T>> {
  await delay(260)
  const ok = (d: unknown) => ({ ok: true, data: d }) as ApiResult<T>
  const sc = scenario()
  if (name === 'webLogin') return ok({ token: 'mock', userId: 'u_admin', role: 'ops_admin', username: 'admin', nickname: '运营', expiresAt: Date.now() + 86400000 })
  if (name === 'webStats') return ok(STATS[sc] || STATS.default)
  if (name === 'webListLots') {
    const all = sc === 'empty' ? [] : makeLots()
    const kw = String((data?.keyword as string) || '')
    const filtered = kw ? all.filter((l) => l.name.includes(kw) || l.address.includes(kw)) : all
    const page = Number(data?.page || 1)
    const size = Number(data?.pageSize || 10)
    return ok({ total: filtered.length, list: filtered.slice((page - 1) * size, page * size) })
  }
  if (name === 'webLookup') {
    const all = sc === 'empty' ? [] : makeReservations(46)
    const plate = String((data?.plateNo as string) || '').replace(/·/g, '')
    const orderNo = String((data?.orderNo as string) || '')
    const status = String((data?.status as string) || '')
    let f = all
    if (plate) f = f.filter((r) => r.plateNo.includes(plate))
    if (orderNo) f = f.filter((r) => r.orderNo.includes(orderNo))
    if (status) f = f.filter((r) => r.status === status)
    const page = Number(data?.page || 1)
    const size = Number(data?.pageSize || 10)
    return ok({ total: f.length, list: f.slice((page - 1) * size, page * size) })
  }
  if (name === 'webVerifyPlate') return ok({ matched: true, plate: '皖A12345', confidence: 96.4, orderNo: 'SP1758000000613', lotName: '万象城地下停车场', method: 'ocr' })
  if (name === 'webCreateUser') return ok({ userId: 'u_new', username: String(data?.username || ''), role: String(data?.role || '') })
  if (name === 'webUpsertLot') return ok({ id: 'lot_x', created: true })
  if (name === 'webDeleteLot') return ok({ lotId: String(data?.lotId || ''), status: 'disabled' })
  if (name === 'webPriceChange') return ok({ lotId: 'lot_0', before: {}, after: {}, at: Date.now() })
  return ok({})
}

export async function uploadImage(): Promise<{ ok: true; fileID: string } | { ok: false; message: string }> {
  await delay(200)
  return { ok: true, fileID: 'cloud://mock/plate.jpg' }
}
