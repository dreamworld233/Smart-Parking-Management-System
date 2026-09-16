// 每日对账定时云函数（数据模型 §5.5「要写的三个任务」之 3）。
//
// 每天凌晨 3 点（config.json 的 timer 触发器 `0 0 3 * * * *`）跑一次：按 reservations
// 重算每个车场的 reservedCount，修掉 createReservation / cancelReservation /
// releaseExpiredReservations 抢额度、回补时留下的漂移。
//
// reservedCount 口径（已从四个云函数核实）：
// - 下单成功 +1（createReservation 等值 CAS _.inc(1)）
// - 取消 -1（cancelReservation _.inc(-1)）
// - 超时释放 -1（releaseExpiredReservations _.inc(-1)）
// - 核销 entered 不减（车位已占用，余位由 availability.freeSpots 另管）
// 所以理论值 = 该车场下 status ∈ {pending_entry, entered, completed} 的预约单数。
// cancelled / released 已回补额度，不计。
//
// 定时触发时 OPENID 为空：本函数是系统任务，以管理端身份运行，不校验身份。
// 兼容手动云端测试：带 OPENID 时也不拦（读一下但不用它做鉴权），直接执行。
//
// 只有不一致才写：避免每天无谓 update 触发时间戳/版本变化，也让对账日志能看出「确实修了」。
// 单车场失败不中断整批（独立 try/catch），失败的缺口留给下一次对账兜底。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BATCH = 100

exports.main = async () => {
  // 系统任务：定时触发 OPENID 为空，不校验身份；手动云端测试带 OPENID 同样直接跑
  const { OPENID } = cloud.getWXContext()

  const db = cloud.database()
  const lots = db.collection('lots')
  const reservations = db.collection('reservations')
  const _ = db.command

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
      // 2. 理论值：还在占车位的预约单数（pending_entry / entered / completed 都算）
      const c = await reservations
        .where({ lotId, status: _.in(['pending_entry', 'entered', 'completed']) })
        .count()
      const expected = c.total || 0

      // 3. 当前值：老文档可能没有 reservedCount 字段 → 缺省 0
      const cur = (await lots.doc(lotId).get()).data.reservedCount ?? 0

      // 4. 只有不一致才写：避免每天无谓 update 触发时间戳/版本变化
      if (cur !== expected) {
        await lots.doc(lotId).update({ data: { reservedCount: expected } })
        corrected++
      }
      checked++
    } catch (e) {
      // 单车场失败不中断整批：计数/读/写任一步出错，跳过这家，下次对账兜底
    }
  }

  return { code: 0, data: { lots: lotDocs.length, corrected, checked } }
}
