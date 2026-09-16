// 车场主绑定车场：把 lots.adminUserId 写当前用户，并把 users.role 置为 lot_admin。
//
// 用户 2026-09-16 拍板：车场主初次创号后由自己选停车场绑定；绑定证明验证暂不做。
// 一个车场一个管理员（本轮约定）：目标车场已被别人绑定时拒绝，防止误覆盖。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const { lotId } = event || {}
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }

  const db = cloud.database()
  const lots = db.collection('lots')
  const users = db.collection('users')

  // 1. 读车场：不存在 / 已被别人绑定
  let lot
  try {
    lot = (await lots.doc(lotId).get()).data
  } catch (e) {
    return { code: 'NOT_FOUND', message: '车场不存在' }
  }
  if (lot.adminUserId && lot.adminUserId !== OPENID) {
    return { code: 'ALREADY_BOUND', message: '该车场已被其他管理员绑定' }
  }

  // 2. 绑定车场 + 身份置 lot_admin。两者独立写，任一失败不影响另一个重试
  await lots.doc(lotId).update({ data: { adminUserId: OPENID } })
  await users.doc(OPENID).update({ data: { role: 'lot_admin' } })

  return { code: 0, data: { lotId, name: lot.name } }
}
