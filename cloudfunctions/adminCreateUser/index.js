// 创建运营/车场管理员账号（任务书 §5 adminCreateUser）。
//
// 只有 ops_admin 能建号 —— 但库里还没有任何 ops_admin 时进入「引导模式」：
// 允许无票据创建第一个运营账号，否则「第一个账号没人能建」就死锁了。
// 首次部署后应立刻用引导模式建一个 ops_admin，之后引导自动关闭。
// （引导模式的代价：部署后、建首个账号前，任何能调用本函数的人都能抢建第一个账号，
// 课程项目规模可接受，README 里已写明。）
//
// 生成每用户独立 salt + scrypt 哈希，钉 webAccount 与 role。
// users._id 用可读随机 id（web 管理员没有 openid）：票据 payload 的 userId 就是它，
// 云函数里能精确对应回 users._id。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { newSalt, hashPassword, newWebUserId, requireOps } = require('./auth')

const ROLES = ['ops_admin', 'lot_admin']
const USERNAME_RE = /^[A-Za-z0-9_]{4,32}$/

exports.main = async (event) => {
  const db = cloud.database()
  const users = db.collection('users')

  // 引导模式：库中还没有 ops_admin 时允许无票据建首个账号
  const existingOps = await users.where({ role: 'ops_admin' }).limit(1).get()
  const isBootstrap = existingOps.data.length === 0
  if (isBootstrap) {
    console.log('[adminCreateUser] 引导模式：库中尚无 ops_admin，允许无票据创建首个账号')
  }
  if (!isBootstrap) {
    const gate = requireOps(event)
    if (gate.error) return gate.error
  }

  const { username, password, role, nickname } = event || {}
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return { code: 'BAD_REQUEST', message: '用户名须为 4–32 位字母/数字/下划线' }
  }
  if (typeof password !== 'string' || password.length < 6) {
    return { code: 'BAD_REQUEST', message: '密码至少 6 位' }
  }
  if (!ROLES.includes(role)) {
    return { code: 'BAD_REQUEST', message: '角色不合法' }
  }

  const dup = await users.where({ 'webAccount.username': username }).limit(1).get()
  if (dup.data.length > 0) {
    console.log('[adminCreateUser] 用户名已存在 username=' + username)
    return { code: 'DUPLICATE', message: '用户名已存在' }
  }

  const salt = newSalt()
  const doc = {
    _id: newWebUserId(),
    role,
    nickname: typeof nickname === 'string' ? nickname.trim() : '',
    avatar: '',
    phone: '',
    credit: { violationCount: 0, bannedUntil: null },
    webAccount: { username, passwordHash: hashPassword(password, salt), salt },
    createdAt: Date.now(),
  }
  try {
    await users.add({ data: doc })
  } catch (e) {
    // 若将来给 webAccount.username 建唯一索引，冲突会在这里抛，一并归到「已存在」
    return { code: 'DUPLICATE', message: '用户名已存在' }
  }
  console.log('[adminCreateUser] 已创建账号 userId=' + doc._id + ' username=' + username + ' role=' + role)
  return { code: 0, data: { userId: doc._id, username, role, nickname: doc.nickname } }
}
