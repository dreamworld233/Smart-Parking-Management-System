export type Role = 'driver' | 'lot_admin'

const ROLE_KEY = 'qnt.role'
const PLATE_KEY = 'qnt.defaultPlate'
const SESSION_KEY = 'qnt.session'
/** 车场数据脏标志：预约/取消后置位，首页/搜索页 onShow 消费并强制重拉（余位变了） */
const LOT_DIRTY_KEY = 'qnt.lotDirty'
/** 车主车辆列表（车牌数组，本地存储，换设备丢失 —— 用户拍板接受） */
const VEHICLES_KEY = 'qnt.vehicles'
/** 车场主当前管理的车场 id（本地存储；切换在「车场我的」） */
const CURRENT_LOT_KEY = 'qnt.currentLotId'
/** 车辆数上限 */
export const VEHICLES_MAX = 5

export interface Session {
  token: string
  userId: string
  expireAt: number
}

export function getRole(): Role | null {
  const v = wx.getStorageSync(ROLE_KEY)
  // 旧版本存过 'owner'（2b 之前的车场端命名），白名单外 → null → 回角色页重选
  return v === 'driver' || v === 'lot_admin' ? v : null
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
  if (typeof v === 'string' && v !== '') return v
  // 兼容：老用户只有 defaultPlate；新用户走车辆列表
  return getVehicles()[0] ?? ''
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
/** 标记车场数据已变（预约/取消成功）—— 下次进首页/搜索页强制重拉余位 */
export function markLotDataDirty(): void {
  wx.setStorageSync(LOT_DIRTY_KEY, Date.now())
}

/** 消费脏标志：有则清除并返回 true，调用方据此强制刷新。无则 false */
export function consumeLotDataDirty(): boolean {
  if (wx.getStorageSync(LOT_DIRTY_KEY)) {
    wx.removeStorageSync(LOT_DIRTY_KEY)
    return true
  }
  return false
}

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

/**
 * 已存车辆列表。与 searchHistory 同规格地校验形状：非数组 → 空；
 * 非字符串项逐条剔，一条脏数据不该让整个列表没掉
 */
export function getVehicles(): string[] {
  const v = wx.getStorageSync(VEHICLES_KEY)
  if (!Array.isArray(v)) return []
  return v.filter((item): item is string => typeof item === 'string')
}

/**
 * defaultPlate 旧 key 与车辆列表的同步（2026-09-19 清遗留）：
 * getDefaultPlate 优先读 PLATE_KEY，删车不跟着清/改，它会一直返回一辆已删除的车，
 * 预约确认页又拿它当默认车牌预填 —— 车牌列表变了，旧 key 必须跟着变。
 * 旧 key 为空或仍指向列表里的车则不动（getDefaultPlate 会自动回退到 list[0]）
 */
function syncDefaultPlate(list: string[]): void {
  const cur = wx.getStorageSync(PLATE_KEY)
  if (typeof cur !== 'string' || cur === '' || list.includes(cur)) return
  setDefaultPlate(list[0] ?? '')
}

/** 添加车辆：去重置顶、截到上限。返回写入后的列表 */
export function addVehicle(plate: string): string[] {
  const next = [plate].concat(getVehicles().filter(p => p !== plate)).slice(0, VEHICLES_MAX)
  wx.setStorageSync(VEHICLES_KEY, next)
  syncDefaultPlate(next)
  return next
}

/** 删除车辆。返回写入后的列表 */
export function removeVehicle(plate: string): string[] {
  const next = getVehicles().filter(p => p !== plate)
  wx.setStorageSync(VEHICLES_KEY, next)
  syncDefaultPlate(next)
  return next
}

export function getCurrentLotId(): string {
  const v = wx.getStorageSync(CURRENT_LOT_KEY)
  return typeof v === 'string' && v !== '' ? v : ''
}

export function setCurrentLotId(id: string): void {
  wx.setStorageSync(CURRENT_LOT_KEY, id)
}
