// 车场新增/编辑（任务书 §5 adminUpsertLot）。只有 ops_admin 可写。
//
// 口径与 seedLots 的 missingFields 同源：
// - 名称/地址/坐标必填，坐标由前端从腾讯 POI 带出（不手敲），这里只验是数字
// - pricing.source / availability.source 只能取 public / ops / placeholder（任务书 §3）
// - **reservedCount 不准手改**（新增钉 0，编辑保持不动）；ratingSummary / contract 同样不在此改
// - 余位 freeSpots 恒写 null：余位只由车场端上报（数据模型 §4），运营录入给初始值就是编数据
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { requireOps } = require('./auth')

const SOURCES = ['public', 'ops', 'placeholder']

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function validateLot(lot) {
  if (typeof lot.name !== 'string' || lot.name.trim() === '') return '车场名称不能为空'
  if (typeof lot.address !== 'string' || lot.address.trim() === '') return '车场地址不能为空'
  const loc = lot.location || {}
  if (!isFiniteNum(loc.lat) || !isFiniteNum(loc.lng)) return '坐标缺失（请从 POI 检索带出）'
  const p = lot.pricing || {}
  if (!isFiniteNum(p.firstHour)) return '首小时价格缺失'
  if (!isFiniteNum(p.perHourAfter)) return '后续每小时价格缺失'
  if (!isFiniteNum(p.capPerDay)) return '单日封顶缺失'
  if (p.stepMinutes !== 15 && p.stepMinutes !== 30 && p.stepMinutes !== 60) return '计费步长不合法'
  if (!SOURCES.includes(p.source)) return '收费来源不合法'
  const a = lot.availability || {}
  if (!isFiniteNum(a.totalSpots)) return '总车位数缺失'
  if (!SOURCES.includes(a.source)) return '车位来源不合法'
  if (!isFiniteNum(lot.reservableQuota)) return '可预约额度缺失'
  return null
}

exports.main = async (event) => {
  const gate = requireOps(event)
  if (gate.error) return gate.error

  const db = cloud.database()
  const lots = db.collection('lots')

  const lot = event && event.lot
  if (!lot || typeof lot !== 'object') return { code: 'BAD_REQUEST', message: '缺少车场数据' }
  const err = validateLot(lot)
  if (err) return { code: 'BAD_REQUEST', message: err }

  const now = Date.now()
  const doc = {
    name: lot.name.trim(),
    address: lot.address.trim(),
    poiId: typeof lot.poiId === 'string' ? lot.poiId : '',
    location: { lat: lot.location.lat, lng: lot.location.lng },
    pricing: {
      firstHour: lot.pricing.firstHour,
      perHourAfter: lot.pricing.perHourAfter,
      stepMinutes: lot.pricing.stepMinutes,
      capPerDay: lot.pricing.capPerDay,
      nightRate: isFiniteNum(lot.pricing.nightRate) ? lot.pricing.nightRate : null,
      source: lot.pricing.source,
    },
    availability: { freeSpots: null, totalSpots: lot.availability.totalSpots, source: lot.availability.source },
    reservableQuota: lot.reservableQuota,
    facilities: Array.isArray(lot.facilities) ? lot.facilities.filter((f) => typeof f === 'string') : [],
    note: typeof lot.note === 'string' ? lot.note : '',
    updatedAt: now,
  }

  const id = lot._id
  if (typeof id === 'string' && id !== '') {
    const got = await lots.where({ _id: id }).limit(1).get()
    if (got.data.length === 0) return { code: 'NOT_FOUND', message: '车场不存在' }
    // 编辑：reservedCount / ratingSummary / contract / freeSpots 全部保持不动
    await lots.doc(id).update({ data: doc })
    console.log('[adminUpsertLot] 已更新车场 id=' + id + ' name=' + doc.name)
    return { code: 0, data: { id, created: false } }
  }

  const added = await lots.add({
    data: {
      ...doc,
      contract: { status: 'signed', signedAt: now },
      reservedCount: 0,
      ratingSummary: null,
    },
  })
  console.log('[adminUpsertLot] 已新增车场 id=' + added._id + ' name=' + doc.name)
  return { code: 0, data: { id: added._id, created: true } }
}
