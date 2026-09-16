// 车场端预约核销列表：当前车场全部预约单，按到达时间升序。
//
// 不走前端直读 reservations（安全规则只给车主配了 doc.userId == auth.openid，
// 车场端按 lotId 读没有对应规则），与 adminDashboard 同一理由。
//
// 返回字段精简：车场端核销页需要 车牌 / 到达时刻 / 状态 / 核销码。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

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
    lot = (await lots.where({ adminUserId: OPENID }).limit(1).get()).data[0] ?? null
  } catch (e) { /* 未绑定按 null */ }
  if (!lot) {
    return { code: 0, data: { lot: null, list: [] } }
  }

  let list = []
  try {
    const r = await reservations
      .where({ lotId: lot._id })
      .orderBy('arriveTime', 'asc')
      .limit(100)
      .get()
    list = r.data.map(x => ({
      _id: x._id,
      plateNo: x.plateNo,
      arriveTime: x.arriveTime,
      status: x.status,
      verifyCode: x.verifyCode,
      lotName: x.lotName,
    }))
  } catch (e) { /* 读失败给空列表 */ }

  return { code: 0, data: { lot: { _id: lot._id, name: lot.name }, list } }
}
