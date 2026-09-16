// 切换身份：写 users.role（driver <-> lot_admin）。
//
// 用户 2026-09-16 拍板：身份切换应改数据库，而不是只改本地 storage。
// 现在只做角色切换，不验证「证明」（车场主绑定证明留后续）。
//
// 与 login 的 ROLE_WHITELIST 同口径：只认 driver / lot_admin / ops_admin。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const { role } = event || {}
  if (typeof role !== 'string' || !ROLE_WHITELIST.includes(role)) {
    return { code: 'BAD_REQUEST', message: '角色不合法' }
  }

  const db = cloud.database()
  const users = db.collection('users')

  // users._id = openid（2a 钉死的约定）
  await users.doc(OPENID).update({ data: { role } })

  return { code: 0, data: { role } }
}
