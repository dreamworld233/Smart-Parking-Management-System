// 车场端看板数据：一次返回今日预约 / 待核销 / 今日收入 / 待核销列表。
//
// 不前端直读 reservations/orders：安全规则只给车主配了 `doc.userId == auth.openid`，
// 车场端读自己车场的单（where lotId）没有对应规则，走云函数规避规则缺口
// （数据模型 §5.6 分工：前端只读自己的，车场端读走云函数）。
//
// 收入口径：orders 的 type prepaid/service 相加，refund 为负值天然相抵
// （数据模型 §4：车场结算按同一张流水聚合，正负相抵天然正确）。
// 今日 = paidAt >= 今日 0 点（epoch 毫秒）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

function startOfToday(now) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
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
    },
  }
}
