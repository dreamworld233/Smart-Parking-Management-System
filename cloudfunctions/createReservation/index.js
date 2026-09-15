// 预约下单云函数（设计稿 §5.1）。
// 核心是**读后等值 CAS** 抢车场可预约额度：reservableQuota 是运营配置的总可预约数，
// reservedCount 是已预约数，并发下用「where(_id + reservedCount) 等值匹配 + _.inc(1)」
// 原子抢占 —— 字段间比较（如 reservedCount < reservableQuota）在云数据库里不可靠，已弃用。
//
// 写单失败一律回补：reservations 主档没写成 → 只回补额度；orders / payments 任一失败 →
// 删掉已建 reservation + 回补额度。不留孤儿单、不吞额度。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { isBookableArrival, quoteTotal, ENTRY_GRACE_MS } = require('./pricing')

// 车牌：省份汉字 + 大写字母 + 5-6 位大写字母/数字，覆盖蓝牌（6 位）与新能源（7 位）
const PLATE_RE = /^[\u4e00-\u9fa5][A-Z][A-Z0-9]{5,6}$/

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const db = cloud.database()
  const lots = db.collection('lots')
  const reservations = db.collection('reservations')
  const orders = db.collection('orders')
  const payments = db.collection('payments')
  const _ = db.command

  const { lotId, arriveAt, plateNo } = event || {}

  // 只取一次「现在」：校验与计价共用，避免两个 now 在边缘时刻漂移
  const now = Date.now()

  // 1. 入参校验
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }
  if (typeof arriveAt !== 'number' || !isBookableArrival(new Date(now), new Date(arriveAt))) {
    return { code: 'BAD_REQUEST', message: '到达时刻超出可预约范围' }
  }
  if (typeof plateNo !== 'string' || !PLATE_RE.test(plateNo)) {
    return { code: 'BAD_REQUEST', message: '车牌号格式不正确' }
  }

  // 2. 读车场文档，校验可预约条件
  let lotDoc
  try {
    lotDoc = await lots.doc(lotId).get()
  } catch (e) {
    // doc().get() 对不存在的文档会 reject，统一视为「不可预约」
    return { code: 'LOT_NOT_FOUND', message: '车场不存在' }
  }
  const data = lotDoc.data || {}
  if (!data.contract || data.contract.status !== 'signed') {
    return { code: 'LOT_NOT_FOUND', message: '车场未签约，不可预约' }
  }
  const pricing = data.pricing || {}
  if (!Number.isFinite(pricing.firstHour)) {
    return { code: 'LOT_INVALID', message: '车场计费信息缺失' }
  }
  if (!Number.isFinite(data.reservableQuota)) {
    return { code: 'LOT_INVALID', message: '车场可预约额度未配置' }
  }
  const firstHourRate = pricing.firstHour
  const quota = data.reservableQuota

  // 3. 读后等值 CAS 抢额度（并发安全，最多重试 3 次）
  //
  // 老文档可能没有 reservedCount 字段：CAS 的 where 里 `reservedCount: 0` 匹配不上
  // undefined（Mongo 语义里缺失字段 ≠ 0），先建字段再抢。**必须用 _.inc(0)** 而不是
  // 硬写 0 —— $inc 对缺失字段「建字段 = 0」，对已有字段保持不变，且整条 doc update 原子；
  // 硬写 0 会踩掉并发写者刚 inc 上去的值（A 补 0 → A inc→1 → B 补 0 把 1 冲回 0 →
  // B 也抢成功 → 两条 reservation 但 reservedCount=1，超卖）
  if (typeof data.reservedCount !== 'number') {
    try {
      await lots.doc(lotId).update({ data: { reservedCount: _.inc(0) } })
    } catch (e) {
      return { code: 'INTERNAL', message: '车场数据初始化失败' }
    }
  }
  let acquired = false
  for (let i = 0; i < 3; i++) {
    const cur = (await lots.doc(lotId).get()).data.reservedCount ?? 0
    if (!(cur < quota)) return { code: 'LOT_FULL', message: '可预约车位已满' }
    // 等值 CAS：where 里同时匹配 _id 与当前 reservedCount，update 用 _.inc(1)。
    // 等值条件不满足（别人抢先改了 reservedCount）时 updated === 0，无歧义
    const res = await lots
      .where({ _id: lotId, reservedCount: cur })
      .update({ data: { reservedCount: _.inc(1) } })
    if (res.stats.updated === 1) {
      acquired = true
      break
    }
  }
  if (!acquired) return { code: 'LOT_FULL', message: '可预约车位已满' }

  // 4. 计价与生成单号
  const arrive = new Date(arriveAt)
  const quote = quoteTotal(new Date(now), arrive, firstHourRate)
  const orderNo = 'PK' + now + String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  const verifyCode = String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
  const enterDeadline = arriveAt + ENTRY_GRACE_MS

  // 5. 写单（失败回补额度 + 清理孤儿单）
  let reservationId
  const orderIds = []
  try {
    const added = await reservations.add({
      data: {
        orderNo,
        userId: OPENID,
        lotId,
        lotName: data.name,
        plateNo,
        arriveTime: arriveAt,
        enterDeadline,
        status: 'pending_entry',
        verifyCode,
        prepaidParkingFee: quote.prepaidParkingFee,
        serviceFee: quote.serviceFee,
        totalAmount: quote.totalAmount,
        createdAt: now,
        paidAt: now,
      },
    })
    reservationId = added._id

    orderIds.push(
      (
        await orders.add({
          data: { reservationId, userId: OPENID, lotId, amount: quote.prepaidParkingFee, type: 'prepaid', status: 'paid', paidAt: now },
        })
      )._id,
    )
    orderIds.push(
      (
        await orders.add({
          data: { reservationId, userId: OPENID, lotId, amount: quote.serviceFee, type: 'service', status: 'paid', paidAt: now },
        })
      )._id,
    )
    // 模拟支付：界面必须标「模拟」，Task 5 接入真实支付前不改
    await payments.add({
      data: { orderId: reservationId, channel: 'mock', amount: quote.totalAmount, status: 'paid', tradeNo: 'MOCK' + Date.now() },
    })
  } catch (e) {
    // 回补额度（吞回补自身的错误，交给对账兜底，不吞主错误）
    try {
      await lots.doc(lotId).update({ data: { reservedCount: _.inc(-1) } })
    } catch (_e) {
      // 额度暂时不准，Task 5+ 对账兜底
    }
    // 清孤儿单：删掉已建的所有 orders + reservation，不留半截数据
    for (const id of orderIds) {
      try {
        await orders.doc(id).remove()
      } catch (_e) {
        // 删不掉也是孤儿单，同上交给对账兜底
      }
    }
    if (reservationId) {
      try {
        await reservations.doc(reservationId).remove()
      } catch (_e) {
        // 同上
      }
    }
    return { code: 'INTERNAL', message: '下单失败，请重试' }
  }

  return {
    code: 0,
    data: {
      reservationId,
      orderNo,
      verifyCode,
      arriveTime: arriveAt,
      enterDeadline,
      leadHours: quote.leadHours,
      prepaidParkingFee: quote.prepaidParkingFee,
      serviceFee: quote.serviceFee,
      totalAmount: quote.totalAmount,
    },
  }
}
