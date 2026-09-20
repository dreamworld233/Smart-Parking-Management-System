// 车牌识别复核 + 核销（任务书 §5 webVerifyPlate，对应课程「车牌识别」）。
//
// 流程与小程序车场端一致（2026-09-20 组长口径：web 车牌识别以小程序的流程和线路为准）：
//   - 识别与核销分离：mode=ocr 只识别 + 匹配候选预约（返回车牌 / 置信度 / 候选单，**不核销**），
//     运营核对后 mode=plate 才核销。防止「识别即核销」把识别错的别的车也放行。
//   - 低置信度不做「猜」（数据模型 §10）：confidence 原样返回，前端 <80 提示核对，不做硬拒。
//   - 核销强校验：mode=plate 必须「识别车牌 == 预约车牌」（normalize 后比对），否则拒绝。
//   - entry_logs.method 口径用数据模型 §4 的 'plate'（与小程序 verifyReservation 实际写入一致），
//     不用任务书 §3 的 'ocr' —— 冲突时以数据模型 + 小程序实际写入为准。
//
// mode 一览：
//   - ocr：    { imageFileID, lotId? } → { matched, plate, confidence, imageFileID, candidate? }，不核销
//   - plate：  { reservationId, plateNo, confidence?, imageFileID? } → 核销（车牌一致才放行）
//   - manual： { reservationId } → 人工核销
//   - code：   { verifyCode, lotId? } → 输码核销
//
// 权限：全部入口 requireOps（只许 ops_admin）。车场端日常核销在小程序（verifyReservation），
// 这里是运营在 Web 兜底复核的通道。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { requireOps } = require('./auth')
const { licensePlateOCR } = require('./ocr')

/** 车牌归一：去分隔点/空格/大小写差异，OCR 返回的「皖A·12345」与库里的「皖A12345」对齐 */
function normalizePlate(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/[^A-Za-z0-9一-龥]/g, '').toUpperCase()
}

/**
 * 核销一个 pending_entry 预约：等值 CAS 改 entered（并发下只成功一次），再写 entry_logs。
 * 返回 { code: 0, data } 或 { code, message }。
 */
async function verifyOne(db, match, extra) {
  const reservations = db.collection('reservations')
  const entryLogs = db.collection('entry_logs')

  const cas = await reservations
    .where({ _id: match._id, status: 'pending_entry' })
    .update({ data: { status: 'entered', enteredAt: Date.now(), entryMethod: extra.method } })
  if (cas.stats.updated !== 1) {
    console.log('[webVerifyPlate] 核销失败：预约已被并发处理 reservationId=' + match._id)
    return { code: 'ALREADY_PROCESSED', message: '该预约已被处理' }
  }
  await entryLogs.add({
    data: {
      reservationId: match._id,
      lotId: match.lotId,
      plateNo: match.plateNo,
      at: Date.now(),
      method: extra.method,
      operatorId: extra.operatorId,
      confidence: extra.confidence ?? null,
      imageFileID: extra.imageFileID || '',
    },
  })
  console.log('[webVerifyPlate] 核销成功 reservationId=' + match._id + ' plate=' + match.plateNo + ' method=' + extra.method)
  return {
    code: 0,
    data: {
      matched: true,
      reservationId: match._id,
      orderNo: match.orderNo,
      lotName: match.lotName,
      plateNo: match.plateNo,
      method: extra.method,
    },
  }
}

exports.main = async (event) => {
  const gate = requireOps(event)
  if (gate.error) return gate.error
  const operatorId = gate.user.userId

  const db = cloud.database()
  const reservations = db.collection('reservations')

  const { mode, imageFileID, lotId, reservationId, verifyCode, plateNo, confidence } = event || {}
  console.log('[webVerifyPlate] 收到核销请求 mode=' + mode)

  // —— OCR 识别（不核销）：识别车牌 + 匹配候选预约，运营核对后走 mode=plate ——
  if (mode === 'ocr') {
    if (typeof imageFileID !== 'string' || imageFileID === '') {
      return { code: 'BAD_REQUEST', message: '缺少停车照片' }
    }
    let base64
    try {
      const dl = await cloud.downloadFile({ fileID: imageFileID })
      base64 = dl.fileContent.toString('base64')
    } catch (e) {
      return { code: 'IMAGE_DOWNLOAD_FAILED', message: '照片下载失败' }
    }

    let plate
    let conf = null
    try {
      const r = await licensePlateOCR(base64)
      plate = normalizePlate(r.plate)
      conf = r.confidence
    } catch (e) {
      // 与小程序 recognizePlate 同口径：OCR_NO_PLATE（图里没车牌）与 OCR_FAILED（调用出错）分开，
      // 别把「没识别到」吞成「调用失败」
      if (e.code === 'OCR_NOT_CONFIGURED') {
        return { code: 'OCR_NOT_CONFIGURED', message: '未配置 OCR 密钥，请转手动输码核销' }
      }
      if (e.code === 'OCR_NO_PLATE') {
        return { code: 'OCR_NO_PLATE', message: '未能识别出车牌，请转手动输码核销' }
      }
      return { code: 'OCR_FAILED', message: '识别失败，请转手动输码核销' }
    }
    if (!plate) return { code: 'OCR_NO_PLATE', message: '未能识别出车牌，请转手动输码核销' }

    console.log('[webVerifyPlate] OCR 识别结果 plate=' + plate + ' confidence=' + conf)

    // 匹配 pending_entry 预约（可选 lotId 过滤）——只匹配不核销
    const where = { plateNo: plate, status: 'pending_entry' }
    if (typeof lotId === 'string' && lotId !== '') where.lotId = lotId
    const candidate = (await reservations.where(where).orderBy('createdAt', 'asc').limit(1).get()).data[0]

    if (!candidate) {
      console.log('[webVerifyPlate] OCR 命中车牌但无待入场预约 plate=' + plate)
      return { code: 0, data: { matched: false, plate, confidence: conf, imageFileID } }
    }
    return {
      code: 0,
      data: {
        matched: true,
        plate,
        confidence: conf,
        imageFileID,
        candidate: {
          reservationId: candidate._id,
          orderNo: candidate.orderNo,
          lotName: candidate.lotName,
          plateNo: candidate.plateNo,
        },
      },
    }
  }

  // —— OCR 命中后核销：按 reservationId，识别车牌必须与预约车牌一致（normalize 后）——
  if (mode === 'plate') {
    if (typeof reservationId !== 'string' || reservationId === '') {
      return { code: 'BAD_REQUEST', message: '缺少预约单' }
    }
    if (typeof plateNo !== 'string' || plateNo === '') {
      return { code: 'BAD_REQUEST', message: '缺少识别车牌' }
    }
    let match
    try {
      match = (await reservations.doc(reservationId).get()).data
    } catch (e) {
      return { code: 'NOT_FOUND', message: '预约单不存在' }
    }
    if (!match) return { code: 'NOT_FOUND', message: '预约单不存在' }
    if (match.status !== 'pending_entry') {
      return { code: 'INVALID_STATUS', message: '该预约当前状态不可核销' }
    }
    // 与小程序 platesMatch 同一原则：识别车牌必须与所选预约同一辆车，
    // 防止「识别出别的车也当这单核销」——OCR 是确认「这辆车=这单」，不是摆设
    if (normalizePlate(plateNo) !== normalizePlate(match.plateNo)) {
      console.log('[webVerifyPlate] 车牌不一致拒绝 reservationId=' + match._id + ' ocr=' + plateNo + ' 预约=' + match.plateNo)
      return { code: 'PLATE_MISMATCH', message: '识别车牌与预约车牌不一致，请核对' }
    }
    return verifyOne(db, match, {
      method: 'plate',
      operatorId,
      confidence: Number.isFinite(confidence) ? confidence : null,
      imageFileID: typeof imageFileID === 'string' ? imageFileID : '',
      plateNo: match.plateNo,
    })
  }

  // —— 手动核销：按 reservationId ——
  if (mode === 'manual') {
    if (typeof reservationId !== 'string' || reservationId === '') {
      return { code: 'BAD_REQUEST', message: '缺少预约单' }
    }
    let match
    try {
      match = (await reservations.doc(reservationId).get()).data
    } catch (e) {
      return { code: 'NOT_FOUND', message: '预约单不存在' }
    }
    if (!match) return { code: 'NOT_FOUND', message: '预约单不存在' }
    if (match.status !== 'pending_entry') {
      return { code: 'INVALID_STATUS', message: '该预约当前状态不可核销' }
    }
    return verifyOne(db, match, { method: 'manual', operatorId })
  }

  // —— 手动核销：按 6 位核销码 ——
  if (mode === 'code') {
    if (typeof verifyCode !== 'string' || !/^\d{6}$/.test(verifyCode)) {
      return { code: 'BAD_REQUEST', message: '核销码须为 6 位数字' }
    }
    const where = { verifyCode, status: 'pending_entry' }
    if (typeof lotId === 'string' && lotId !== '') where.lotId = lotId
    const match = (await reservations.where(where).orderBy('createdAt', 'asc').limit(1).get()).data[0]
    if (!match) return { code: 'NOT_FOUND', message: '核销码无效或无待入场预约' }
    return verifyOne(db, match, { method: 'code', operatorId })
  }

  return { code: 'BAD_REQUEST', message: '未知的核销模式' }
}
