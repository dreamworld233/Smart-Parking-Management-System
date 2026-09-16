// 车场端维护自己车场的配置：收费、可预约额度、设施、名称/地址。
//
// 用户 2026-09-16 拍板：车场主管自己车场的一切日常（信息/收费/额度），
// Web 端只在特殊情况兜底。所以本函数给 lot_admin 改自己的车场。
//
// patch 白名单字段（不在白名单的一律拒绝，防前端塞进未知字段污染库）：
//   pricing.firstHour / perHourAfter / stepMinutes / capPerDay / nightRate
//   reservableQuota / facilities / name / address / openHours
//
// 改价（patch 含任一 pricing 字段）落 lot_price_changes 留痕：
//   { lotId, old, new, changedBy, changedAt, note } —— old 读当前值，逐字段记变更。
// 额度（reservableQuota）与设施不落价格留痕（那是价格历史，不是配置历史）。
// 收费来源标注（pricing.source）保持不变：车场主改的是值，不改来源等级
// （placeholder 仍是「示例数据待核实」，谁都不许自行升成 public/ops）。
//
// 权限：OPENID 必须是该车场 adminUserId（lot_admin）；ops_admin 可改任何车场
// （Web 后台兜底场景），复用本函数做角色分流 —— 与 Web 任务书 adminUpsertLot 合并，
// 不建两套。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

const PRICING_KEYS = ['firstHour', 'perHourAfter', 'stepMinutes', 'capPerDay', 'nightRate']
// patch 白名单：pricing 是子对象，其余是扁平字段
const FLAT_KEYS = ['reservableQuota', 'facilities', 'name', 'address', 'openHours']

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

async function readRole(users, openid) {
  try {
    const u = (await users.where({ _openid: openid }).limit(1).get()).data[0]
    return u ? (ROLE_WHITELIST.includes(u.role) ? u.role : 'driver') : 'driver'
  } catch (e) {
    return 'driver'
  }
}

/** 取合法 patch：校验类型，拼成 `{ pricing: {...}, ...flat }`。含白名单外字段 → null */
function sanitizePatch(raw) {
  const out = { pricing: null, flat: {} }
  if (!raw || typeof raw !== 'object') return null

  // 顶层白名单检查：patch 里出现非白名单字段一律拒绝（防前端塞未知字段污染库）
  const topKeys = Object.keys(raw)
  if (topKeys.some(k => k !== 'pricing' && !FLAT_KEYS.includes(k))) return null

  if (raw.pricing && typeof raw.pricing === 'object') {
    const pricing = {}
    const pKeys = Object.keys(raw.pricing)
    if (pKeys.some(k => !PRICING_KEYS.includes(k))) return null
    for (const k of pKeys) {
      if (k === 'nightRate') {
        // 夜间费率：null 合法（没有夜间计费），数字必须非负
        if (raw.pricing[k] !== null && !isFiniteNum(raw.pricing[k])) return null
        pricing[k] = raw.pricing[k]
      } else if (!isFiniteNum(raw.pricing[k])) {
        return null
      } else {
        pricing[k] = raw.pricing[k]
      }
    }
    if (Object.keys(pricing).length > 0) out.pricing = pricing
  } else if (raw.pricing !== undefined) {
    return null // pricing 给了非对象
  }

  for (const k of FLAT_KEYS) {
    if (raw[k] !== undefined) {
      if (k === 'reservableQuota') {
        if (!isFiniteNum(raw[k]) || raw[k] < 0) return null
      } else if (k === 'facilities') {
        if (!Array.isArray(raw[k]) || raw[k].some(f => typeof f !== 'string')) return null
      } else if (k === 'name' || k === 'address') {
        if (typeof raw[k] !== 'string' || raw[k] === '') return null
      } else if (k === 'openHours') {
        if (raw[k] !== null && typeof raw[k] !== 'string') return null
      }
      out.flat[k] = raw[k]
    }
  }
  return out
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const { lotId, patch } = event || {}
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }

  const db = cloud.database()
  const users = db.collection('users')
  const lots = db.collection('lots')
  const priceChanges = db.collection('lot_price_changes')

  const role = await readRole(users, OPENID)
  if (role !== 'lot_admin' && role !== 'ops_admin') {
    return { code: 'NO_AUTH', message: '无车场配置权限' }
  }

  let lotDoc
  try {
    lotDoc = (await lots.doc(lotId).get()).data
  } catch (e) {
    return { code: 'NOT_FOUND', message: '车场不存在' }
  }
  // lot_admin 只能改自己管理的车场；ops_admin 可改任何（Web 兜底）
  if (role === 'lot_admin' && lotDoc.adminUserId !== OPENID) {
    return { code: 'FORBIDDEN', message: '只能配置自己管理的车场' }
  }

  const s = sanitizePatch(patch)
  if (!s) return { code: 'BAD_REQUEST', message: '配置字段不合法' }
  if (!s.pricing && Object.keys(s.flat).length === 0) {
    return { code: 'BAD_REQUEST', message: '没有可更新的字段' }
  }

  const now = Date.now()

  // 1. 主档更新。pricing 部分：保留 source（来源标注不可由车场主改），只覆盖价格字段
  const updateData = {}
  if (s.pricing) {
    const curPricing = lotDoc.pricing || {}
    updateData.pricing = {
      ...curPricing,
      ...s.pricing,
      // source 是来源标注（public/ops/placeholder），车场主改价不升来源等级
      source: curPricing.source || 'placeholder',
    }
  }
  Object.assign(updateData, s.flat)

  // 2. 改价留痕：patch 含任一 pricing 字段，且至少一个值与当前不同
  let priceChanged = false
  if (s.pricing) {
    for (const k of PRICING_KEYS) {
      if (s.pricing[k] !== undefined && s.pricing[k] !== (lotDoc.pricing || {})[k]) {
        priceChanged = true
        break
      }
    }
  }

  await lots.doc(lotId).update({ data: updateData })

  if (priceChanged) {
    try {
      // 只记变更过的价格字段：old 是当前值，new 是新值
      const oldPricing = {}
      const newPricing = {}
      for (const k of PRICING_KEYS) {
        if (s.pricing[k] !== undefined && s.pricing[k] !== (lotDoc.pricing || {})[k]) {
          oldPricing[k] = (lotDoc.pricing || {})[k] ?? null
          newPricing[k] = s.pricing[k]
        }
      }
      await priceChanges.add({
        data: {
          lotId,
          old: oldPricing,
          new: newPricing,
          changedBy: OPENID,
          changedAt: now,
          note: role === 'ops_admin' ? '平台运营调整' : '车场管理员调整',
        },
      })
    } catch (e) {
      // 留痕失败不阻断主档更新；对账/审计靠其他渠道补
    }
  }

  return { code: 0, data: { lotId, priceChanged } }
}
