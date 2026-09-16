// 超时释放定时云函数（数据模型 §5.5「要写的三个任务」之 2）。
//
// 每 5 分钟（config.json 的 timer 触发器）跑一次：把过 enterDeadline 仍 pending_entry
// 的预约置 released → 回补车场额度 → 写 violations('no_show') → users.credit.violationCount++
// → 违约满 3 次（BR-02）写 bannedUntil = now + 30 天。
//
// 定时触发时 OPENID 为空：本函数是系统任务，以管理端身份运行，不校验身份。
// 兼容手动云端测试：带 OPENID 时也不拦（读一下但不用它做鉴权），直接执行。
//
// 幂等（§5.5：定时任务可能重复推送）：每张单用等值 CAS
//   where(_id + status='pending_entry') → update(released)，stats.updated === 1 才算释放成功；
//   updated 0 = 已被并发方处理（已入场 / 已取消 / 上一轮已释放），跳过全部副作用。
// 与 createReservation / cancelReservation 抢额度、取消同一套思路：值变了就匹配不上，无歧义。
//
// 副作用（回补额度 / violations / credit / bannedUntil）每项独立 try/catch：单条失败不中断
// 整批，缺口交给每日对账任务兜底（§5.5 之 3，按 reservations 重算 reservedCount 修漂移）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const BATCH = 100
const BAN_THRESHOLD = 3
const BAN_DAYS_MS = 30 * 24 * 3600 * 1000

exports.main = async () => {
  // 定时触发 OPENID 为空 → 不校验身份；手动云端测试带 OPENID 同样直接跑
  const { OPENID } = cloud.getWXContext()

  const db = cloud.database()
  const reservations = db.collection('reservations')
  const lots = db.collection('lots')
  const violations = db.collection('violations')
  const users = db.collection('users')
  const _ = db.command

  const now = Date.now()

  // 1. 查过期的待入场单，每批 100 张。
  //    本轮单量小，一批够用。量大了改成「按 enterDeadline 升序 + 游标翻页」：
  //    云函数有时长上限，单批处理不完要 loop 续批（lastId 游标 + skip 深翻页不可靠）
  let scanned = 0
  let released = 0
  const expired = await reservations
    .where({ status: 'pending_entry', enterDeadline: _.lt(now) })
    .limit(BATCH)
    .get()

  // 2. 逐张等值 CAS 释放。每张单的副作用各自独立 try/catch，失败不中断整批
  for (const resv of expired.data || []) {
    scanned++
    const { _id: id, lotId, userId, totalAmount } = resv

    const cas = await reservations
      .where({ _id: id, status: 'pending_entry' })
      .update({ data: { status: 'released', releasedAt: now } })
    if (cas.stats.updated !== 1) {
      // 已被并发方处理（已入场/已取消/另一轮定时任务已释放）：这笔让给对方，不重复副作用
      continue
    }
    released++

    // 2.1 回补车场额度（下单时 CAS 里 +1，这里还回去）
    try {
      await lots.doc(lotId).update({ data: { reservedCount: _.inc(-1) } })
    } catch (e) {
      // 额度暂不准，每日对账按 reservations 重算兜底
    }

    // 2.2 写违约记录 no_show。没有人取消、没有人退款 → penalty = 已付全额不退
    //     （与 cancelReservation 的 late_cancel 同口径：未退金额 = totalAmount - 0）
    try {
      await violations.add({
        data: {
          userId,
          reservationId: id,
          lotId,
          type: 'no_show',
          occurredAt: now,
          penalty: Math.max(0, totalAmount || 0),
        },
      })
    } catch (e) {
      // 违约记录失败：计数没加，BR-01/02 的停用阈值少算一次，对账/下次触发补
    }

    // 2.3 用户违约计数 +1（users._id = openid 约定，userId 就是 openid；点路径自增不覆盖 credit）
    try {
      await users.doc(userId).update({
        data: { 'credit.violationCount': _.inc(1) },
      })
    } catch (e) {
      // 同上，交给对账兜底
    }

    // 2.4 BR-02：违约满 3 次 → 停用 30 天。读自增后的计数再决定写不写 bannedUntil
    try {
      const u = await users.doc(userId).get()
      const count = (u.data && u.data.credit && u.data.credit.violationCount) || 0
      if (count >= BAN_THRESHOLD) {
        await users.doc(userId).update({
          data: { 'credit.bannedUntil': now + BAN_DAYS_MS },
        })
      }
    } catch (e) {
      // 读不到用户 / 写失败：计数还在，下次触发时再补 bannedUntil
    }
  }

  return { code: 0, data: { scanned, released } }
}
