// 车场端预约核销列表：当前车场全部预约单，按到达时间升序。
//
// 不走前端直读 reservations（安全规则只给车主配了 doc.userId == auth.openid，
// 车场端按 lotId 读没有对应规则），与 adminDashboard 同一理由。
//
// 返回全字段白名单（列表卡片 + 详情视图共用一份数据，不再单拉）：
// 车牌 / 到达与截止 / 状态 / 核销码 / 金额三笔 / 单号。refund* 仅在取消或超时释放单有值。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

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

  let role = 'driver'
  try {
    const u = (await users.where({ _openid: OPENID }).limit(1).get()).data[0]
    role = u ? (ROLE_WHITELIST.includes(u.role) ? u.role : 'driver') : 'driver'
  } catch (e) { /* 按 driver 不误判 */ }
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

  let list = []
  try {
    const r = await reservations
      .where({ lotId })
      .orderBy('arriveTime', 'asc')
      .limit(100)
      .get()
    list = r.data.map(x => ({
      _id: x._id,
      orderNo: x.orderNo,
      lotId: x.lotId,
      lotName: x.lotName,
      plateNo: x.plateNo,
      arriveTime: x.arriveTime,
      enterDeadline: x.enterDeadline,
      prepaidParkingFee: x.prepaidParkingFee,
      serviceFee: x.serviceFee,
      totalAmount: x.totalAmount,
      status: x.status,
      verifyCode: x.verifyCode,
      createdAt: x.createdAt,
      cancelledAt: x.cancelledAt,
      refundParking: x.refundParking,
      refundService: x.refundService,
      refundTotal: x.refundTotal,
    }))
  } catch (e) { /* 读失败给空列表 */ }

  return { code: 0, data: { lot: { _id: lot._id, name: lot.name }, list } }
}
