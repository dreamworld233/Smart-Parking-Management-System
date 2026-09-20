// Web 后台登录云函数（任务书 §4）。**不改现有 login（小程序在用）**，新增本函数。
//
// 小程序登录走 _openid（login 云函数），Web 没有微信身份，改走 users.webAccount 口令。
// 口令绝不明文：users.webAccount = { username, passwordHash, salt }，hash 用 crypto.scrypt。
// 登录成功后签发**自签票据**（HMAC-SHA256，见 ./auth.js），前端存入本地，
// 后续每个 admin* 云函数在入口校验该票据并判角色 —— 角色判定押在云函数，不押安全规则。
//
// 任务书 §4 给的两个候选是「云开发内置用户名密码」与「自签票据自定义登录」。这里选自签票据：
// 票据 payload 里就是 userId（= users._id），云函数里能精确对应回 users._id，
// 不依赖「安全规则里 Web 身份变量名」这个核实不了的口径。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { TOKEN_TTL_MS, verifyPassword, signSessionToken } = require('./auth')

exports.main = async (event) => {
  const db = cloud.database()
  const users = db.collection('users')

  const { username, password } = event || {}
  console.log('[webLogin] 收到登录请求 username=' + (typeof username === 'string' ? username : ''))
  if (typeof username !== 'string' || username.trim() === '') {
    return { code: 'BAD_REQUEST', message: '请输入用户名' }
  }
  if (typeof password !== 'string' || password === '') {
    return { code: 'BAD_REQUEST', message: '请输入密码' }
  }

  const got = await users.where({ 'webAccount.username': username.trim() }).limit(1).get()
  const u = got.data[0]
  const account = u && u.webAccount
  // 用户名不存在 / 无口令字段 / 口令错误，给同一句话，不泄露「哪个用户名已注册」
  if (!account || typeof account.passwordHash !== 'string' || typeof account.salt !== 'string') {
    return { code: 'BAD_CREDENTIALS', message: '用户名或密码错误' }
  }
  if (!verifyPassword(password, account.salt, account.passwordHash)) {
    console.log('[webLogin] 登录失败：用户名或密码错误 username=' + username)
    return { code: 'BAD_CREDENTIALS', message: '用户名或密码错误' }
  }

  const role = u.role
  if (role !== 'ops_admin' && role !== 'lot_admin') {
    // 不认识的角色（含 driver）一律拒绝：车主没有 webAccount，走到这基本是脏数据
    return { code: 'FORBIDDEN', message: '该账号无权登录运营后台' }
  }

  const now = Date.now()
  console.log('[webLogin] 登录成功 userId=' + u._id + ' role=' + role)
  const token = signSessionToken({ userId: u._id, role, exp: now + TOKEN_TTL_MS })
  return {
    code: 0,
    data: {
      token,
      userId: u._id,
      role,
      username: account.username,
      nickname: typeof u.nickname === 'string' ? u.nickname : '',
      expiresAt: now + TOKEN_TTL_MS,
    },
  }
}
