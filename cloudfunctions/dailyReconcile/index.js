// 每日对账定时云函数（数据模型 §5.5「要写的三个任务」之 3）。
//
// 2026-09-17 改职责：reservedCount 已退役（余位统一为 availability.freeSpots 单数：
// 预约扣 -1、取消/逾期返还 +1、核销不动），原「按 reservations 重算 reservedCount」
// 的对账口径随之失效 —— freeSpots 是「物理空位 − 预约扣减」的混合数，
// 无法从 reservations 推出权威值。
//
// 现职责：每日钳 availability.freeSpots 到合法区间 [0, totalSpots]，
// 修掉下单回补失败 / 并发边界留下的负数或超总位漂移。未上报（null）不修。
//
// 定时触发时 OPENID 为空：本函数是系统任务，以管理端身份运行，不校验身份。
// 兼容手动云端测试：带 OPENID 时也不拦（读一下但不用它做鉴权），直接执行。
//
// 只有不一致才写：避免每天无谓 update 触发时间戳/版本变化。单车场失败不中断整批。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BATCH = 100

exports.main = async () => {
  // 系统任务：定时触发 OPENID 为空，不校验身份；手动云端测试带 OPENID 同样直接跑
  const { OPENID } = cloud.getWXContext()

  const db = cloud.database()
  const lots = db.collection('lots')

  // 1. 查所有车场（签约车场库，seed 的都是签约车场；单批 100，量大再加游标翻页）
  let lotDocs = []
  try {
    const r = await lots.limit(BATCH).get()
    lotDocs = r.data || []
  } catch (e) {
    // 列表都读不到：整批没法对，直接返回错误，别报「全部一致」误导
    return { code: 'INTERNAL', message: '读车场列表失败' }
  }

  let checked = 0
  let corrected = 0
  for (const lot of lotDocs) {
    const lotId = lot._id
    try {
      const av = lot.availability || {}
      const cur = av.freeSpots
      // 未上报（null）/ 非数字：不修，等车场端上报真实值
      if (typeof cur !== 'number' || !Number.isFinite(cur)) continue
      checked++

      // 2. 钳合法区间：负数 → 0（回补/并发边界）；超总位 → 总位（上报/扣减漂移）
      const total = typeof av.totalSpots === 'number' && av.totalSpots > 0 ? av.totalSpots : null
      let expected = cur
      if (cur < 0) expected = 0
      else if (total !== null && cur > total) expected = total
      if (expected === cur) continue

      // 3. 只有不一致才写
      await lots.doc(lotId).update({ data: { 'availability.freeSpots': expected } })
      corrected++
    } catch (e) {
      // 单车场失败不中断整批：读/写任一步出错，跳过这家，下次对账兜底
    }
  }

  return { code: 0, data: { lots: lotDocs.length, corrected, checked } }
}
