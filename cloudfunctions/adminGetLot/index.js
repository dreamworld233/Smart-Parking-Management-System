// 车场端身份：按当前登录用户（OPENID）取他管理的车场。
//
// 车场管理员 = users.role === 'lot_admin' 且 lots.adminUserId === OPENID。
// 一个管理员可管理多个车场（1:N）：返回名下全部车场（data.lots 数组）。
// 没有关联车场不是错误，返回 data.lots === []，前端显示「尚未绑定车场」空态。
//
// 角色判定在云函数入口（数据模型 §5.6：写操作一律走云函数，角色不押安全规则）。
// 前端不直读 lots：adminUserId 匹配的安全规则要单独配，走云函数少一个规则缺口。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 与 login 的 ROLE_WHITELIST 同一份口径：不认识的值当 'driver'（默认安全）
const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

/** 返回给前端的车场字段。整文档透传会把 availability_samples 等无关字段带出去，没必要 */
function pickLot(lot) {
  if (!lot) return null
  return {
    _id: lot._id,
    name: lot.name,
    address: lot.address,
    location: lot.location || null,
    pricing: lot.pricing || null,
    availability: lot.availability || null,
    reservableQuota: lot.reservableQuota ?? null,
    reservedCount: lot.reservedCount ?? 0,
    facilities: lot.facilities || [],
  }
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const db = cloud.database()
  const users = db.collection('users')
  const lotColl = db.collection('lots')

  // 读 role：users._id = openid（2a 钉死的约定），但用 where(_openid) 更稳
  // （_id 是 openid 的文档与 _openid 字段同时存在，双条件任一命中即可）
  let role = 'driver'
  try {
    const u = (await users.where({ _openid: OPENID }).limit(1).get()).data[0]
    role = u ? (ROLE_WHITELIST.includes(u.role) ? u.role : 'driver') : 'driver'
  } catch (e) {
    // users 读失败：按 driver 处理，宁可不放行也不误判成管理员
  }

  if (role !== 'lot_admin') {
    return { code: 'NO_AUTH', message: '非车场管理员' }
  }

  // 车场主可管理多个车场（1:N）：返回全部名下车场，不再 limit(1) 取第一条
  let list = []
  try {
    const r = await lotColl.where({ adminUserId: OPENID }).orderBy('_id', 'asc').limit(20).get()
    list = r.data.map(pickLot)
  } catch (e) {
    // lots 读失败：返回空列表不阻塞，前端按未绑定处理；真错误会在后续写操作暴露
  }

  return { code: 0, data: { role, lots: list } }
}
