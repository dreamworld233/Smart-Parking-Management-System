// 车牌识别复核 + 核销（任务书 §5 adminVerifyPlate，对应课程「车牌识别」）。
//
// 两种模式：
// - mode=ocr：上传停车照片（云存储 fileID）→ 腾讯云 OCR 识别车牌 → 匹配 pending_entry 预约
//   → 命中则核销（entered + entry_logs）。识别失败/无预约返回可读结果，前端转手动输码。
// - mode=manual / mode=code：手动核销（按 reservationId 或 6 位核销码），写 entry_logs。
//
// entry_logs.method 口径：任务书 §3 是 ocr / code / manual。数据模型 §4 表格里把车牌识别
// 那档写成 'plate'，与 §10 / 任务书 §3 冲突 —— 这里以任务书 §3 为准用 'ocr'。
// 一次核销可能先识别失败再输码成功，entry_logs 每次尝试都落一条，留痕能看见整条尝试链。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { requireOps } = require('./auth')
const { licensePlateOCR } = require('./ocr')

const STATUSES = ['pending_entry', 'entered', 'completed', 'cancelled', 'released']

/** 车牌归一：去掉分隔点/空格/大小写差异，OCR 返回的「皖A·12345」与库里的「皖A12345」对齐 */
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
    console.log('[adminVerifyPlate] 核销失败：预约已被并发处理 reservationId=' + match._id)
    return { code: 'ALREADY_PROCESSED', message: '该预约已被处理' }
  }
  await entryLogs.add({
    data: {
      reservationId: match._id,
      lotId: match.lotId,
      plateNo: extra.plateNo || match.plateNo,
      at: Date.now(),
      method: extra.method,
      operatorId: extra.operatorId,
      confidence: extra.confidence ?? null,
      imageFileID: extra.imageFileID || '',
    },
  })
  console.log('[adminVerifyPlate] 核销成功 reservationId=' + match._id + ' plate=' + (extra.plateNo || match.plateNo) + ' method=' + extra.method)
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

  const { mode, imageFileID, lotId, reservationId, verifyCode } = event || {}
  console.log('[adminVerifyPlate] 收到核销请求 mode=' + mode)

  // —— OCR 模式 ——
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
    let confidence = null
    try {
      const r = await licensePlateOCR(base64)
      plate = normalizePlate(r.plate)
      confidence = r.confidence
    } catch (e) {
      if (e.code === 'OCR_NOT_CONFIGURED') {
        return { code: 'OCR_NOT_CONFIGURED', message: '未配置 OCR 密钥，请转手动输码核销' }
      }
      return { code: 'OCR_FAILED', message: '识别失败，请转手动输码核销' }
    }
    if (!plate) return { code: 'OCR_NO_PLATE', message: '未能识别出车牌，请转手动输码核销' }

    console.log('[adminVerifyPlate] OCR 识别结果 plate=' + plate + ' confidence=' + confidence)

    // 匹配 pending_entry 预约（可选 lotId 过滤）
    const where = { plateNo: plate, status: 'pending_entry' }
    if (typeof lotId === 'string' && lotId !== '') where.lotId = lotId
    const match = (await reservations.where(where).orderBy('createdAt', 'asc').limit(1).get()).data[0]

    if (!match) {
      console.log('[adminVerifyPlate] OCR 命中车牌但无待入场预约 plate=' + plate)
      return { code: 0, data: { matched: false, plate, confidence, imageFileID } }
    }
    return verifyOne(db, match, {
      method: 'ocr',
      operatorId,
      confidence,
      imageFileID,
      plateNo: plate,
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
