// 车场端看板数据：一次返回今日预约 / 待核销 / 今日净收益 / 收益明细 / 待核销列表 / 近 N 日趋势。
//
// 不前端直读 reservations/orders：安全规则只给车主配了 `doc.userId == auth.openid`，
// 车场端读自己车场的单（where lotId）没有对应规则，走云函数规避规则缺口
// （数据模型 §5.6 分工：前端只读自己的，车场端读走云函数）。
//
// 收入口径（2026-09-30 定）：**车场净收益 = 预支停车费 − 退还的预支停车费**。
// 预支停车费是车场锁位收入；取消时按已占用时长退掉的那部分是车场的支出，两者相抵即车场到手。
// 平台服务费（¥2，见 domain/pricing.ts）是平台唯一收入来源，**不归车场**，
// 作 `income.service` / `income.serviceNet` 单列返回，供看板注明「归平台」。
//
// **退款必须取 reservations 主档的拆分，不能取 orders 的 refund 流水**（2026-09-30 用户发现）：
// cancelReservation 写的那条 refund 流水是**一条合并金额** ——
//   免费取消窗口内 refundTotal = 预支停车费 + 服务费（pricing.js 的 cancelRefund）
//   窗口外         refundTotal = parkingRefund
// 拿这条流水去减车场收益，免费取消那笔会把平台该退的 ¥2 算成车场的亏损，
// 区间内只要免费取消占多数，「净收益」就会变成负数（9/16 实际出现过）。
// 主档的 refundParking / refundService 是同一时刻算出来的两笔拆分，取它才对得上账。
// 退款的时间轴用 refundAt（与 refund 流水的 paidAt 是同一个 now），不是 createdAt。
//
// 收益与趋势：一次按时间范围取 orders + reservations，在函数内按本地日分组求和。
// 不再逐天两段查询 —— 30 天要 60 次查询，冷启动下必然超时。
// 不押 sum 聚合 API：取回上限 FETCH_LIMIT 条，超出时 `income.truncated` 置 true，
// 看板如实提示「已截断」，不假装是全量。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

/** 折线图 / 收益明细可选范围（天）。白名单，不接前端传的任意值 */
const TREND_DAYS_OPTIONS = [7, 30]
const TREND_DAYS_DEFAULT = 7

/** 单次 get 取回上限。超过这个数的区间统计会截断并置 truncated */
const FETCH_LIMIT = 1000

/** 已核销状态。entered = 已入场未离场，completed = 已离场（数据模型状态机），都算核销过 */
const VERIFIED_STATUSES = ['entered', 'completed']

const DAY_MS = 24 * 60 * 60 * 1000

function startOfToday(now) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfDay(dayOffset, now) {
  return startOfToday(now) - dayOffset * DAY_MS
}

/** '09-23' 格式，折线图 x 轴标签（本地时区，不 UTC） */
function dayLabel(dayStart) {
  const d = new Date(dayStart)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

/** 前端传的天数落进白名单；不合法（含 undefined / 字符串 / 别的数字）一律回默认值 */
function normalizeDays(raw) {
  const n = Number(raw)
  return TREND_DAYS_OPTIONS.includes(n) ? n : TREND_DAYS_DEFAULT
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  // 车场主多车场：前端解析当前车场后显式传 lotId（2026-09-18 设计 C1）
  const { lotId, days: rawDays } = event || {}
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }
  const days = normalizeDays(rawDays)

  const db = cloud.database()
  const users = db.collection('users')
  const lots = db.collection('lots')
  const reservations = db.collection('reservations')
  const orders = db.collection('orders')
  const _ = db.command

  // 身份 + 车场：前端显式传 lotId，读回车场后校验归属（多车场，2026-09-18 设计 C1）
  let role = 'driver'
  try {
    const u = (await users.where({ _openid: OPENID }).limit(1).get()).data[0]
    role = u ? (ROLE_WHITELIST.includes(u.role) ? u.role : 'driver') : 'driver'
  } catch (e) { /* 按 driver，不误判管理员 */ }
  if (role !== 'lot_admin') {
    return { code: 'NO_AUTH', message: '非车场管理员' }
  }

  let lot
  try {
    lot = (await lots.doc(lotId).get()).data
  } catch (e) {
    return { code: 'NOT_FOUND', message: '车场不存在' }
  }
  if (!lot || lot.adminUserId !== OPENID) {
    return { code: 'FORBIDDEN', message: '只能查看自己管理的车场' }
  }

  const now = Date.now()
  const today = startOfToday(now)
  // 范围含今日，共 days 天：最早一天 = 今日往前推 days-1 天
  const rangeStart = startOfDay(days - 1, now)

  // 分桶：dayStart 时间戳 → trend 下标。i = 0 是最早一天，i = days-1 是今日
  const dayStarts = []
  for (let i = 0; i < days; i++) dayStarts.push(startOfDay(days - 1 - i, now))
  const bucketOf = new Map()
  dayStarts.forEach((s, i) => bucketOf.set(s, i))

  /** 时间戳落在哪个桶。范围外的（时钟偏差 / 脏数据）返回 -1，不污染趋势 */
  function bucketIndex(ts) {
    if (!Number.isFinite(ts)) return -1
    const d = new Date(ts)
    d.setHours(0, 0, 0, 0)
    const i = bucketOf.get(d.getTime())
    return i === undefined ? -1 : i
  }

  // 今日预约 / 待核销：两个精确 count，便宜且不受 FETCH_LIMIT 影响
  let todayReservations = 0
  let pendingEntry = 0
  try {
    const r = await reservations.where({ lotId, createdAt: _.gte(today) }).count()
    todayReservations = r.total
  } catch (e) { /* count 失败按 0 */ }
  try {
    const r = await reservations.where({ lotId, status: 'pending_entry' }).count()
    pendingEntry = r.total
  } catch (e) { /* count 失败按 0 */ }

  // 待核销列表：待入场单按到达时间升序，最多 5 条（看板只显示一小块）
  let pendingList = []
  try {
    const r = await reservations
      .where({ lotId, status: 'pending_entry' })
      .orderBy('arriveTime', 'asc')
      .limit(5)
      .get()
    pendingList = r.data.map(x => ({
      _id: x._id,
      plateNo: x.plateNo,
      arriveTime: x.arriveTime,
      verifyCode: x.verifyCode,
      lotName: x.lotName,
    }))
  } catch (e) { /* 读失败给空列表 */ }

  const trend = dayStarts.map(s => ({ date: dayLabel(s), reservations: 0, income: 0 }))
  const income = {
    days,
    /** 区间预支停车费（车场收入侧） */
    prepaid: 0,
    /** 区间退还的预支停车费（车场支出侧，正数） */
    refundParking: 0,
    /** 区间平台服务费（平台收入侧，不归车场） */
    service: 0,
    /** 区间退还的平台服务费（平台支出侧，正数） */
    refundService: 0,
    /** 车场净收益 = prepaid − refundParking */
    net: 0,
    /** 平台服务费净额 = service − refundService */
    serviceNet: 0,
    reservationCount: 0,
    verifiedCount: 0,
    truncated: false,
  }

  // 区间预约：一次取回按天分桶。单日 count 失败不再各自为 0 —— 一个查询失败整体归零，
  // 折线图宁可少一段，也不给车场主一个假的趋势
  try {
    const r = await reservations.where({ lotId, createdAt: _.gte(rangeStart) }).limit(FETCH_LIMIT).get()
    if (r.data.length >= FETCH_LIMIT) income.truncated = true
    for (const x of r.data) {
      const i = bucketIndex(Number(x.createdAt))
      if (i < 0) continue
      trend[i].reservations += 1
      income.reservationCount += 1
      if (VERIFIED_STATUSES.includes(x.status)) income.verifiedCount += 1
    }
  } catch (e) { /* 读失败：趋势与区间单量保持 0 */ }

  // 区间收入流水：只认 prepaid / service 两笔正流水。
  // refund 流水**故意不在这里减** —— 它是合并金额，减了会把平台该退的服务费算到车场头上，
  // 改由下面按主档拆分的那段处理
  try {
    const r = await orders.where({ lotId, paidAt: _.gte(rangeStart) }).limit(FETCH_LIMIT).get()
    if (r.data.length >= FETCH_LIMIT) income.truncated = true
    for (const o of r.data) {
      const amt = Number(o.amount) || 0
      const i = bucketIndex(Number(o.paidAt))
      if (o.type === 'prepaid') {
        income.prepaid += amt
        if (i >= 0) trend[i].income += amt
      } else if (o.type === 'service') {
        income.service += amt
      }
      // 其余类型（含 refund）不计入：宁可少算，不把平台侧科目当车场收入
    }
  } catch (e) { /* 读失败：收益保持 0 */ }

  // 区间退款：按 refundAt 取预约主档，直接读 refundParking / refundService 两笔拆分
  // （cancelReservation 的 CAS 更新与退款流水同一时刻写入）。理由见文件头。
  try {
    const r = await reservations.where({ lotId, refundAt: _.gte(rangeStart) }).limit(FETCH_LIMIT).get()
    if (r.data.length >= FETCH_LIMIT) income.truncated = true
    for (const x of r.data) {
      const park = Number(x.refundParking) || 0
      income.refundParking += park
      income.refundService += Number(x.refundService) || 0
      const i = bucketIndex(Number(x.refundAt))
      if (i >= 0) trend[i].income -= park
    }
  } catch (e) { /* 读失败：退款按 0 —— 宁可高估收益，也不编一个数出来 */ }

  income.net = income.prepaid - income.refundParking
  income.serviceNet = income.service - income.refundService
  // 今日 = 趋势最后一个点。今日预约用上面的精确 count 覆盖，避免取数截断时两处对不上
  trend[days - 1].reservations = todayReservations
  const todayIncome = trend[days - 1].income

  return {
    code: 0,
    data: {
      lot: {
        _id: lotId,
        name: lot.name,
        address: lot.address,
        availability: lot.availability || null,
      },
      todayReservations,
      pendingEntry,
      todayIncome,
      income,
      pendingList,
      trend,
    },
  }
}
