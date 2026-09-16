// 收费录入 + 改价（任务书 §5 webPriceChange）。只有 ops_admin。
//
// 每次改价写一条 lot_price_changes 留痕（before / after / evidenceFileID 公示价照片 /
// operatorId / at / note）。这个集合就是「收费数据从哪来」的存证链（数据模型 §4）：
// 答辩被问「你们的价格哪来的」，直接翻这条链。
//
// 顺序：先落留痕，再改 lots.pricing。改价没留痕等于把收费出处丢掉一半 ——
// 留痕失败不该静默改价，宁可这次改价失败。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { requireOps } = require('./auth')

const SOURCES = ['public', 'ops', 'placeholder']

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

exports.main = async (event) => {
  const gate = requireOps(event)
  if (gate.error) return gate.error

  const db = cloud.database()
  const lots = db.collection('lots')
  const changes = db.collection('lot_price_changes')

  const { lotId, pricing, evidenceFileID, note } = event || {}
  if (typeof lotId !== 'string' || lotId === '') return { code: 'BAD_REQUEST', message: '缺少车场' }

  const p = pricing || {}
  if (!isFiniteNum(p.firstHour) || !isFiniteNum(p.perHourAfter) || !isFiniteNum(p.capPerDay)) {
    return { code: 'BAD_REQUEST', message: '收费字段缺失' }
  }
  if (p.stepMinutes !== 15 && p.stepMinutes !== 30 && p.stepMinutes !== 60) {
    return { code: 'BAD_REQUEST', message: '计费步长不合法' }
  }
  if (!SOURCES.includes(p.source)) return { code: 'BAD_REQUEST', message: '收费来源不合法' }

  const got = await lots.where({ _id: lotId }).limit(1).get()
  if (got.data.length === 0) return { code: 'NOT_FOUND', message: '车场不存在' }
  const before = got.data[0].pricing || null

  const after = {
    firstHour: p.firstHour,
    perHourAfter: p.perHourAfter,
    stepMinutes: p.stepMinutes,
    capPerDay: p.capPerDay,
    nightRate: isFiniteNum(p.nightRate) ? p.nightRate : null,
    source: p.source,
  }
  const now = Date.now()

  await changes.add({
    data: {
      lotId,
      before,
      after,
      evidenceFileID: typeof evidenceFileID === 'string' ? evidenceFileID : '',
      operatorId: gate.user.userId,
      at: now,
      note: typeof note === 'string' ? note : '',
    },
  })
  await lots.doc(lotId).update({ data: { pricing: after, updatedAt: now } })

  console.log('[webPriceChange] 已改价 lotId=' + lotId + ' 首小时 ' + (before && before.firstHour) + '→' + after.firstHour + ' 来源=' + after.source)
  return { code: 0, data: { lotId, before, after, at: now } }
}
