// 车场端核销（入场）：输码、按车牌手动核销、OCR 识别命中后核销。
//
// 数据模型 §10 三级降级链：OCR 自动核销 → 扫/输核销码 → 车场端手动确认。
// 三种入口：
//   - 输码：verifyCode 匹配。verifyCode 是 6 位随机数（createReservation 用
//     Math.random()*1000000），不保证全局唯一 → 必须带 lotId 双条件匹配防跨场串单
//   - 手动：plateNo 匹配（lotId + plateNo + status pending_entry）
//   - plate（OCR）：前端调 recognizePlate 拿到 { plate, confidence } 后带到这里核销，
//     entry_logs 记 method 'plate' + confidence + 原图 imageFileID（§4 字段）
//
// 状态转移用「读后等值 CAS」：查回 pending_entry 的单 → where(_id + status)
// 改 entered，updated===1 才成功。并发双击只有一次能过，另一次拿 ALREADY_PROCESSED。
// 与 cancelReservation / createReservation 同一套思路。
//
// 权限：OPENID 必须是该车场的 adminUserId。写 entry_logs 留痕（§4：
// method 'code' 输码 / 'manual' 手动 / 'plate' 车牌识别，operatorId 是操作人）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const { lotId, verifyCode, plateNo, method, confidence, imageFileID } = event || {}
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }
  if (method !== 'code' && method !== 'manual' && method !== 'plate') {
    return { code: 'BAD_REQUEST', message: '核销方式不合法' }
  }
  if (method === 'code' && (typeof verifyCode !== 'string' || !/^\d{6}$/.test(verifyCode))) {
    return { code: 'BAD_REQUEST', message: '核销码须为 6 位数字' }
  }
  if ((method === 'manual' || method === 'plate') && (typeof plateNo !== 'string' || plateNo === '')) {
    return { code: 'BAD_REQUEST', message: '缺少车牌号' }
  }

  const db = cloud.database()
  const users = db.collection('users')
  const lots = db.collection('lots')
  const reservations = db.collection('reservations')
  const entryLogs = db.collection('entry_logs')

  // 1. 身份：车场管理员才允许核销
  let role = 'driver'
  try {
    const u = (await users.where({ _openid: OPENID }).limit(1).get()).data[0]
    role = u ? (ROLE_WHITELIST.includes(u.role) ? u.role : 'driver') : 'driver'
  } catch (e) { /* 按 driver 不误判 */ }
  if (role !== 'lot_admin' && role !== 'ops_admin') {
    return { code: 'NO_AUTH', message: '非车场管理员' }
  }

  // 2. 车场归属：lot_admin 只能核销自己车场；ops_admin 兜底可核销任意
  let lotDoc
  try {
    lotDoc = (await lots.doc(lotId).get()).data
  } catch (e) {
    return { code: 'NOT_FOUND', message: '车场不存在' }
  }
  if (role === 'lot_admin' && lotDoc.adminUserId !== OPENID) {
    return { code: 'FORBIDDEN', message: '只能核销自己管理的车场' }
  }

  // 3. 查待入场单（带 lotId，防跨场串单）。plate 与 manual 都是按车牌查
  const q = method === 'code'
    ? { lotId, verifyCode, status: 'pending_entry' }
    : { lotId, plateNo, status: 'pending_entry' }
  let found
  try {
    found = (await reservations.where(q).limit(1).get()).data[0]
  } catch (e) {
    return { code: 'UNKNOWN', message: '查询失败' }
  }
  if (!found) {
    return {
      code: method === 'code' ? 'CODE_INVALID' : 'NO_MATCH',
      message: method === 'code' ? '核销码无效' : '该车牌无待入场预约',
    }
  }

  // 4. 等值 CAS：只有 status 还是 pending_entry 才能改成功（防并发双击重复核销）
  const now = Date.now()
  const cas = await reservations
    .where({ _id: found._id, status: 'pending_entry' })
    .update({ data: { status: 'entered', enteredAt: now, entryMethod: method } })
  if (cas.stats.updated !== 1) {
    return { code: 'ALREADY_PROCESSED', message: '该预约已被处理' }
  }

  // 5. 核销留痕。失败不撤销主档（核销已发生，日志缺一条由审计补）
  try {
    await entryLogs.add({
      data: {
        reservationId: found._id,
        lotId,
        plateNo: found.plateNo,
        at: now,
        method, // 'code' 输码 / 'manual' 手动 / 'plate' 车牌识别（数据模型 §4）
        operatorId: OPENID,
        // OCR 命中时透传置信度与原图 fileID；非 OCR 恒为 null
        confidence: method === 'plate' ? (Number.isFinite(confidence) ? confidence : null) : null,
        imageFileID: method === 'plate' ? (typeof imageFileID === 'string' ? imageFileID : null) : null,
      },
    })
  } catch (e) { /* 留痕失败不阻断核销 */ }

  return {
    code: 0,
    data: {
      reservationId: found._id,
      plateNo: found.plateNo,
      status: 'entered',
      verifyCode: found.verifyCode || null,
      enteredAt: now,
    },
  }
}
