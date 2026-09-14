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

const SEARCH_HISTORY_KEY = 'qnt.searchHistory'

/** 历史搜索最多留几条。再多也只是把面板撑长，用户不会翻 */
const SEARCH_HISTORY_MAX = 8

/**
 * 历史搜索词。与另外三个 getter 同规格地校验形状：
 * `|| []` 只挡假值，存储里是字符串或对象时照样放行，页面下一句
 * `history.filter(...)` 就是 `is not a function` 当场抛，而且抛在 setData 之前，
 * 整页白屏。非字符串项逐条剔掉而不是整批作废 —— 一条脏数据不该让历史全没了
 */
export function getSearchHistory(): string[] {
  const v = wx.getStorageSync(SEARCH_HISTORY_KEY)
  if (!Array.isArray(v)) return []
  return v.filter((item): item is string => typeof item === 'string')
}

/**
 * 记一条搜索词：置顶、去重、截到上限。返回写入后的列表供页面直接渲染。
 *
 * 以**存储**为基准读数，不接页面的 `data.history`：列表若有第二个写入口
 * （比如首页的搜索入口），拿内存里的旧值当基准会把另一处的记录覆盖掉
 */
export function pushSearchHistory(keyword: string): string[] {
  const next = [keyword]
    .concat(getSearchHistory().filter(h => h !== keyword))
    .slice(0, SEARCH_HISTORY_MAX)
  wx.setStorageSync(SEARCH_HISTORY_KEY, next)
  return next
}
