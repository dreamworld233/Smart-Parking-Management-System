// 微信身份建档与查询。设计稿 §4：身份走 _openid，不自建密码。
// 云函数写入**不会**自动带 _openid（那是小程序端写入的行为），必须显式写
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }
  const db = cloud.database()
  const got = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
  if (got.data.length > 0) {
    const u = got.data[0]
    const credit = u.credit || { violationCount: 0, bannedUntil: null }
    const banned = typeof credit.bannedUntil === 'number' && credit.bannedUntil > Date.now()
    return {
      code: 0,
      data: {
        userId: u._id,
        role: u.role || 'driver',
        violationCount: credit.violationCount || 0,
        banned,
      },
    }
  }
  const added = await db.collection('users').add({
    data: {
      _openid: OPENID,
      role: 'driver',
      nickname: '',
      avatar: '',
      phone: '',
      credit: { violationCount: 0, bannedUntil: null },
      createdAt: Date.now(),
    },
  })
  return {
    code: 0,
    data: { userId: added._id, role: 'driver', violationCount: 0, banned: false },
  }
}
