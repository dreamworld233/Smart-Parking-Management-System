// 微信身份建档与查询。设计稿 §4：身份走 _openid，不自建密码。
// 云函数写入**不会**自动带 _openid（那是小程序端写入的行为），必须显式写
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }
  const db = cloud.database()
  const users = db.collection('users')

  // 新用户的初始形状只此一份：add 写入的 data 与插入后返回的身份共用它。
  // 分开写两份的话，将来给初始 credit 加字段只改一处 —— 而「新用户第一次登录」
  // 这条路径最难被注意到，字段静默 undefined 也不会有人报错
  const FRESH = {
    role: 'driver',
    nickname: '',
    avatar: '',
    phone: '',
    credit: { violationCount: 0, bannedUntil: null },
  }

  let u = (await users.where({ _openid: OPENID }).limit(1).get()).data[0]
  if (!u) {
    try {
      // `_id` 直接钉成 OPENID：`_openid` 上没建唯一索引，「先查后插」在并发下会建出两条、
      // 同一人拿到两个身份（onLaunch 的建档还没返回时，角色页再调一次就会撞上）。
      // 用主键唯一性把这条路堵死 —— 冲突即「已存在」，回查即可
      await users.add({
        data: { ...FRESH, _id: OPENID, _openid: OPENID, createdAt: Date.now() },
      })
      u = FRESH
    } catch (e) {
      // 并发的那一次刚插进去：回查已存在的那条。查不到说明 add 是真失败（例如服务端不接受
      // 自定义 _id），此时**原样重抛**，别把真错误吞成「已存在」
      const again = await users.where({ _openid: OPENID }).limit(1).get()
      if (!again.data.length) throw e
      u = again.data[0]
    }
  }

  const credit = u.credit || { violationCount: 0, bannedUntil: null }
  const banned = typeof credit.bannedUntil === 'number' && credit.bannedUntil > Date.now()
  return {
    code: 0,
    data: {
      // userId 存 openid（设计稿 §4）：cars / reservations / orders / reviews 的安全规则是
      // `doc.userId == auth.openid`，返回文档 _id 会让 2b 写进去的值永远比不中
      userId: OPENID,
      role: u.role || 'driver',
      violationCount: credit.violationCount || 0,
      banned,
    },
  }
}
