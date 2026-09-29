// 车场端看板数据：一次返回今日预约 / 待核销 / 今日收入 / 待核销列表 / 近 7 日趋势。
//
// 不前端直读 reservations/orders：安全规则只给车主配了 `doc.userId == auth.openid`，
// 车场端读自己车场的单（where lotId）没有对应规则，走云函数规避规则缺口
// （数据模型 §5.6 分工：前端只读自己的，车场端读走云函数）。
//
// 收入口径：orders 的 type prepaid/service 相加，refund 为负值天然相抵
// （数据模型 §4：车场结算按同一张流水聚合，正负相抵天然正确）。
// 今日 = paidAt >= 今日 0 点（epoch 毫秒）。
//
// trend：近 7 日（含今日）每日预约数 + 收入，供看板折线图（老师 2026-09-29 要求）。
// 按天两段查询（gte dayStart / lt nextDayStart），不用 sum 聚合 API。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']
const TREND_DAYS = 7

function startOfToday(now) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfDay(dayOffset, now) {
  return startOfToday(now) - dayOffset * 24 * 60 * 60 * 1000
}

/** '09-23' 格式，折线图 x 轴标签（本地时区，不 UTC） */
function dayLabel(dayStart) {
  const d = new Date(dayStart)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  // 车场主多车场：前端解析当前车场后显式传 lotId（2026-09-18 设计 C1）
  const { lotId } = event || {}
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }

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

  const today = startOfToday(Date.now())

  // 三个 count：今日预约 / 待核销。用 where 命令，云数据库支持 _ 命令
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

  // 今日收入：取今天所有流水前端求和（refund 负值相抵）。不押 sum 聚合 API
  let todayIncome = 0
  try {
    const r = await orders.where({ lotId, paidAt: _.gte(today) }).get()
    todayIncome = r.data.reduce((acc, o) => acc + (Number(o.amount) || 0), 0)
  } catch (e) { /* 读失败按 0 */ }

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

  // 近 7 日趋势：每天一个点（旧→新），预约数按 createdAt、收入按 paidAt。
  // 单日 count / sum 失败按 0 —— 折线图宁可少一点，不让整个看板挂
  const trend = []
  const now = Date.now()
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const dayStart = startOfDay(i, now)
    const dayEnd = startOfDay(i - 1, now)
    const point = { date: dayLabel(dayStart), reservations: 0, income: 0 }
    try {
      const r = await reservations
        .where({ lotId, createdAt: _.gte(dayStart).and(_.lt(dayEnd)) })
        .count()
      point.reservations = r.total
    } catch (e) { /* 按 0 */ }
    try {
      const r = await orders.where({ lotId, paidAt: _.gte(dayStart).and(_.lt(dayEnd)) }).get()
      point.income = r.data.reduce((acc, o) => acc + (Number(o.amount) || 0), 0)
    } catch (e) { /* 按 0 */ }
    trend.push(point)
  }

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
      pendingList,
      trend,
    },
  }
}
