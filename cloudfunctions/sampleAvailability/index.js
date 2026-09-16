// 余位采样定时云函数（数据模型 §5.5「要写的三个任务」之 1）。
//
// 每 15 分钟（config.json 的 timer 触发器）跑一次：把有实时余位的车场
// lots.availability 落一条 availability_samples（source: 'sampled'）。
// 车场端上报（reportAvailability）时顺带落的 'reported' 样本只覆盖上报时刻，
// 本任务周期打点补上报之外的空档，喂 §5.7 的「实时余位 + 历史同期」预测。
//
// 定时触发时 OPENID 为空：本函数是系统任务，以管理端身份运行，不校验身份。
// 兼容手动云端测试：带 OPENID 时也不拦（读一下但不用它做鉴权），直接执行。
//
// 只采样「有上报过」的车场：没上报过的没有实时数据（availability.reportedAt
// 缺失），采样它等于编数据；availability.freeSpots / totalSpots 任一非数字同样跳过。
//
// 幂等（§5.5：定时任务可能重复推送）：每个车场落样前查它最近一条样本，
// 若 sampledAt 距 now < 15 分钟（同一窗口已采过）则跳过，避免窗口内叠多条重复样本。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BATCH = 100
const SAMPLE_WINDOW_MS = 15 * 60 * 1000

exports.main = async () => {
  // 定时触发 OPENID 为空 → 不校验身份；手动云端测试带 OPENID 同样直接跑
  const { OPENID } = cloud.getWXContext()

  const db = cloud.database()
  const lots = db.collection('lots')
  const samples = db.collection('availability_samples')
  const _ = db.command

  const now = Date.now()

  // 1. 查有实时余位的车场，每批 100 个。
  //    本轮单量小，一批够用。量大了改成「按 updatedAt 升序 + 游标翻页」：
  //    云函数有时长上限，单批处理不完要 loop 续批（lastId 游标 + skip 深翻页不可靠）
  let sampled = 0
  let skipped = 0
  const lotsWithAvailability = await lots
    .where({ 'availability.reportedAt': _.gt(0) })
    .limit(BATCH)
    .get()

  // 2. 逐个车场：窗口内没采过才落一条样本
  for (const lot of lotsWithAvailability.data || []) {
    const availability = lot.availability || {}
    const freeSpots = availability.freeSpots
    const totalSpots = availability.totalSpots

    // 2.1 没上报过的车场已被查询过滤；字段缺失/非数字 → 不编数据，跳过
    if (!Number.isFinite(freeSpots) || !Number.isFinite(totalSpots)) {
      skipped++
      continue
    }

    // 2.2 幂等防重复：查该车场最近一条样本，同一 15 分钟窗口已采过则跳过。
    //     查询失败时不能确认窗口 → 宁可不落也不叠重复，缺口留给下轮
    try {
      const latest = await samples
        .where({ lotId: lot._id })
        .orderBy('sampledAt', 'desc')
        .limit(1)
        .get()
      const lastSampledAt = (latest.data && latest.data[0] && latest.data[0].sampledAt) || 0
      if (now - lastSampledAt < SAMPLE_WINDOW_MS) {
        skipped++
        continue
      }
    } catch (e) {
      skipped++
      continue
    }

    // 2.3 落样本。occupancyRate 照 reportAvailability 口径：totalSpots 为 0 时给 null
    try {
      await samples.add({
        data: {
          lotId: lot._id,
          sampledAt: now,
          freeSpots,
          totalSpots,
          occupancyRate: totalSpots ? Math.round((freeSpots / totalSpots) * 100) : null,
          source: 'sampled',
        },
      })
      sampled++
    } catch (e) {
      // 单条采样失败不中断整批：缺口交给下个 15 分钟窗口补
      skipped++
    }
  }

  return { code: 0, data: { sampled, skipped } }
}
