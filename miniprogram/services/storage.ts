export type Role = 'driver' | 'owner'

const ROLE_KEY = 'qnt.role'
const PLATE_KEY = 'qnt.defaultPlate'
const SESSION_KEY = 'qnt.session'

export interface Session {
  token: string
  userId: string
  expireAt: number
}

export function getRole(): Role | null {
  const v = wx.getStorageSync(ROLE_KEY)
  return v === 'driver' || v === 'owner' ? v : null
}

export function setRole(role: Role): void {
  wx.setStorageSync(ROLE_KEY, role)
}

export function clearRole(): void {
  wx.removeStorageSync(ROLE_KEY)
}

/**
 * 与 getRole / getSession 一致地校验存储里的形状。
 * 存储可能被旧版本或手工改动污染，`|| ''` 只能挡住假值，
 * 挡不住数字、对象这类真值，会把脏数据当车牌一路带进 UI
 */
export function getDefaultPlate(): string {
  const v = wx.getStorageSync(PLATE_KEY)
  return typeof v === 'string' ? v : ''
}

export function setDefaultPlate(plate: string): void {
  wx.setStorageSync(PLATE_KEY, plate)
}

/**
 * 三个字段全查。只验 token 的话，`{ token: 'x' }` 这种半残对象会被当成有效会话放行，
 * 而拿它去请求会在更远的地方以更难查的方式失败 —— 缺字段一律按未登录处理
 */
export function getSession(): Session | null {
  const s = wx.getStorageSync(SESSION_KEY)
  if (!s || typeof s.token !== 'string' || typeof s.userId !== 'string' || typeof s.expireAt !== 'number') {
    return null
  }
  return s as Session
}

export function setSession(session: Session): void {
  wx.setStorageSync(SESSION_KEY, session)
}

export function clearSession(): void {
  wx.removeStorageSync(SESSION_KEY)
}
