// auth.js —— Web 后台登录态与口令工具。复制进每个用到它的云函数目录各一份。
//
// 云函数单目录打包上传，跨目录 require('../shared/...') 部署后取不到（Plan 2b 关键口径 2），
// 所以这里和 pricing.js 一样，各目录持有一份拷贝。改一处要同步改其它目录的同名文件。
//
// 口令：crypto.scrypt + 每用户独立 salt，绝不明文（任务书 §4）。
// 会话票据：自签 HMAC-SHA256（JWT 形态），密钥在云函数环境变量 WEB_ADMIN_SESSION_SECRET。
// 选「自签票据」而非云开发内置用户名密码账号体系：任务书 §4 两个候选中，自签票据能把身份
// 精确对应回 users._id（票据 payload 里就是 userId），不依赖「安全规则里 Web 身份变量名」
// 这个核实不了的口径（任务书 §4 明说）。
const crypto = require('crypto')

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 票据有效期 12 小时

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function getSecret() {
  const s = process.env.WEB_ADMIN_SESSION_SECRET
  if (!s || typeof s !== 'string' || s === '') {
    throw new Error('环境变量 WEB_ADMIN_SESSION_SECRET 未配置')
  }
  return s
}

/** 生成每用户独立 salt（16 字节 hex） */
function newSalt() {
  return crypto.randomBytes(16).toString('hex')
}

/** 口令哈希：scrypt 派生 64 字节，hex 存库。salt 必须每用户独立 */
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), String(salt), 64).toString('hex')
}

/** 恒定时间口令比对：防时序侧信道，且比 hex 字符串直接 === 更严 */
function verifyPassword(password, salt, expectedHex) {
  const actual = Buffer.from(hashPassword(password, salt), 'hex')
  const expected = Buffer.from(String(expectedHex), 'hex')
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

/** 签发管理员会话票据。payload 必须是 { userId, role, exp } */
function signSessionToken(payload) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const sig = b64url(crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest())
  return `${header}.${body}.${sig}`
}

/** 校验会话票据。合法且未过期返回 payload，否则 null */
function verifySessionToken(token) {
  if (typeof token !== 'string' || token === '') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const header = parts[0]
  const body = parts[1]
  const sig = parts[2]
  const expected = b64url(crypto.createHmac('sha256', getSecret()).update(`${header}.${body}`).digest())
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(b64urlDecode(body).toString('utf8'))
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null
    if (typeof payload.userId !== 'string' || payload.userId === '') return null
    return payload
  } catch (e) {
    return null
  }
}

/** 生成 web 管理员文档 _id。web 管理员没有 openid，用可读随机 id，票据 userId 对应回它 */
function newWebUserId() {
  return 'web_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex')
}

/**
 * 云函数入口的角色判定（任务书 §4：写操作一律走云函数，角色在云函数入口判）。
 * 返回 { error, user }：票据校验失败 / 角色不认 时 error 非空，调用方直接 return error。
 * driver 角色没有 webAccount，走到这基本是脏数据，一律拒绝。
 */
function requireAdmin(event) {
  const payload = verifySessionToken(event && event.token)
  if (!payload) return { error: { code: 'NO_AUTH', message: '登录态无效或已过期' }, user: null }
  if (payload.role !== 'ops_admin' && payload.role !== 'lot_admin') {
    return { error: { code: 'FORBIDDEN', message: '该账号无权访问运营后台' }, user: null }
  }
  return { error: null, user: payload }
}

/** 平台侧写操作只许 ops_admin。lot_admin 管日常运营（余位上报 / 核销），在小程序端 */
function requireOps(event) {
  const r = requireAdmin(event)
  if (r.error) return r
  if (r.user.role !== 'ops_admin') {
    return { error: { code: 'FORBIDDEN', message: '只有平台运营可执行此操作' }, user: null }
  }
  return r
}

module.exports = {
  TOKEN_TTL_MS,
  newSalt,
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  newWebUserId,
  requireAdmin,
  requireOps,
}
