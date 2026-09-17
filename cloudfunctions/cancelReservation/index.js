// 取消预约云函数（设计稿 §5.2 / §5.8）。
// 三条路：退款（金额公式在 ./pricing 的 cancelRefund）→ 回补车场额度 →
// 晚于到达时刻取消则记违约（violations + users.credit.violationCount++）。
//
// 状态转移用「等值 CAS」保证只成功一次：where(_id + status='pending_entry') 匹配再
// update 成 cancelled，updated===1 才真正取消。两次并发取消（双端同时点）只有一条
// 能过 CAS，另一条拿到 ALREADY_CANCELLED，不会退两次款、也不会回补两次额度。
// 与 createReservation 抢额度同一套思路：值变了就匹配不上，无歧义。
//
// 主档（reservations 状态 + 退款字段）与 CAS 是一笔原子更新，先落它再落 orders/
// 额度/violations —— 后面三笔失败不撤销主档，交给每日对账兜底（设计稿 §5.2）：
// 退款已经发生在主档里了，orders 流水缺一条是账能对回来的，别为了流水回滚主档。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { cancelRefund } = require('./pricing')

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const db = cloud.database()
  const reservations = db.collection('reservations')
  const orders = db.collection('orders')
  const lots = db.collection('lots')
  const violations = db.collection('violations')
  const users = db.collection('users')
  const _ = db.command

  const { reservationId } = event || {}
  if (typeof reservationId !== 'string' || reservationId === '') {
    return { code: 'BAD_REQUEST', message: '缺少预约单' }
  }

  // 1. 读预约单，先做身份与状态预检（真正拦并发的是后面的 CAS）
  let res
  try {
    res = await reservations.doc(reservationId).get()
  } catch (e) {
    // doc().get() 对不存在文档 reject，与 createReservation 同一口径
    return { code: 'NOT_FOUND', message: '预约单不存在' }
  }
  const data = res.data || {}
  if (data.userId !== OPENID) {
    // 只能取消自己的单。别把「不是你的」说成「不存在」，那是把错误藏起来
    return { code: 'FORBIDDEN', message: '只能操作自己的预约' }
  }
  if (data.status !== 'pending_entry') {
    // 已入场/已取消/已释放的单不可取消：状态机只允许 pending_entry → cancelled
    return { code: 'INVALID_STATUS', message: '当前状态不可取消' }
  }

  // 2. 取首小时单价（退款公式的入参）。车场不存在/无计费时无法算钱，拒绝取消会卡死用户，
  //    所以读不到就按 0 单价兜底 —— 退款退不了多少，但预约必须能取消（额度要还）
  let firstHourRate = 0
  try {
    const lotDoc = await lots.doc(data.lotId).get()
    const pricing = lotDoc.data?.pricing || {}
    if (Number.isFinite(pricing.firstHour)) firstHourRate = pricing.firstHour
  } catch (e) {
    // 车场文档丢了：按 0 单价继续，取消不因车场数据坏而卡死
  }

  // 3. 算退款。orderAt = createdAt（下单时刻），arrive = arriveTime，cancelAt = now。
  //    cancelRefund 内部含免费窗口 / 已占用时长 / isBreach 全部分支
  const now = Date.now()
  const r = cancelRefund(new Date(data.createdAt), new Date(data.arriveTime), new Date(now), firstHourRate)
  const refundParking = r.parkingRefund
  // 免费窗口内退服务费，之外不退：refundServiceFee 是 isBreach 之外的第二个开关
  const refundService = r.refundServiceFee ? data.serviceFee || 0 : 0
  const refundTotal = r.totalRefund

  // 4. 等值 CAS：只有 status 还是 pending_entry 才能改成功。并发取消下第二次 updated=0
  const cas = await reservations
    .where({ _id: reservationId, status: 'pending_entry' })
    .update({
      data: {
        status: 'cancelled',
        cancelledAt: now,
        refundParking,
        refundService,
        refundTotal,
        refundAt: now,
      },
    })
  if (cas.stats.updated !== 1) {
    // 值已被并发方改了（取消了/入场了），这笔让给对方，不重复退款
    return { code: 'ALREADY_CANCELLED', message: '该预约已被处理' }
  }

  // 5. 退款流水（type refund，amount 负值）。失败不撤销主档，对账兜底
  try {
    await orders.add({
      data: {
        reservationId,
        userId: OPENID,
        lotId: data.lotId,
        amount: -refundTotal,
        type: 'refund',
        status: 'refunded',
        paidAt: now,
      },
    })
  } catch (e) {
    // 主档已取消，退款已定；流水缺一条由每日对账按 reservations 补
  }

  // 6. 返还余位。下单时 availability.freeSpots -1（预约扣位），取消还回去 +1
  try {
    await lots.doc(data.lotId).update({ data: { 'availability.freeSpots': _.inc(1) } })
  } catch (e) {
    // 余位暂不准，对账兜底
  }

  // 7. 晚于到达时刻取消 = 违约：写 violations + 用户违约计数 +1
  if (r.isBreach) {
    try {
      await violations.add({
        data: {
          userId: OPENID,
          reservationId,
          type: 'late_cancel',
          occurredAt: now,
          penalty: Math.max(0, (data.totalAmount || 0) - refundTotal),
        },
      })
    } catch (e) {
      // 违约记录失败：计数没加，BR-01/02 的停用阈值算少一次，超时释放云函数下次覆盖
    }
    try {
      // users._id = openid（2a 钉死的约定），点路径自增不覆盖整个 credit 对象
      await users.doc(OPENID).update({
        data: { 'credit.violationCount': _.inc(1) },
      })
    } catch (e) {
      // 同上，交给对账兜底
    }
  }

  return {
    code: 0,
    data: {
      reservationId,
      status: 'cancelled',
      usedHours: r.usedHours,
      refundParking,
      refundService,
      refundTotal,
      isBreach: r.isBreach,
    },
  }
}
