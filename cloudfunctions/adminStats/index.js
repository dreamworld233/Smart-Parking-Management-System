// 运营看板（任务书 §5 adminStats，加分项）。只读，ops_admin 与 lot_admin 可见。
//
// 核心四数：签约数 / 预约数 / 核销数 / 余位上报及时率。
// 余位上报及时率 = 最近 15 分钟内有 availability_samples 上报的车场数 / 签约车场数。
// 车场端（余位上报）在小程序 Plan 3，尚未接入时样本为空、及时率自然为 0，
// 界面如实显示「车场端未接入」，不编一个数。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { requireAdmin } = require('./auth')

const REPORT_FRESH_MS = 15 * 60 * 1000

exports.main = async (event) => {
  const gate = requireAdmin(event)
  if (gate.error) return gate.error

  const db = cloud.database()
  const _ = db.command

  const lots = db.collection('lots')
  const reservations = db.collection('reservations')
  const samples = db.collection('availability_samples')

  const signedLots = (await lots.where({ 'contract.status': 'signed' }).count()).total
  const totalReservations = (await reservations.count()).total

  async function countByStatus(status) {
    return (await reservations.where({ status }).count()).total
  }
  const pending = await countByStatus('pending_entry')
  const entered = await countByStatus('entered')
  const completed = await countByStatus('completed')
  const cancelled = await countByStatus('cancelled')
  const released = await countByStatus('released')

  // 最近 15 分钟的余位上报：取样本去重出有上报的车场数
  let reportFreshLots = 0
  const since = Date.now() - REPORT_FRESH_MS
  const recent = await samples
    .where({ sampledAt: _.gte(since) })
    .limit(1000)
    .get()
  const uniqueLots = new Set()
  for (const s of recent.data) {
    if (typeof s.lotId === 'string') uniqueLots.add(s.lotId)
  }
  reportFreshLots = uniqueLots.size

  const reportFreshRate = signedLots > 0 ? Math.round((reportFreshLots / signedLots) * 100) : 0
  console.log('[adminStats] 看板：签约=' + signedLots + ' 预约=' + totalReservations + ' 核销=' + entered + ' 余位及时率=' + reportFreshRate + '%')
  return {
    code: 0,
    data: {
      signedLots,
      totalReservations,
      pending,
      entered,
      completed,
      cancelled,
      released,
      reportFreshLots,
      // 除零保护：没有签约车场时及时率记 0，前端按「无签约车场」显示
      reportFreshRate,
    },
  }
}
