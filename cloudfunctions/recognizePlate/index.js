// 车牌识别云函数（数据模型 §10）。三级降级链的最上一级：OCR 自动核销的「识别」环节。
//
// 流程：车场端拍照 → 上传云存储 → 本函数读 fileID 下载原图 → base64 → 腾讯云 OCR
// `LicensePlateOCR` 识别 → 返回 { plate, confidence }。前端拿到车牌后调用
// verifyReservation(method:'plate') 完成核销 —— 识别与核销拆两个函数，
// 识别失败 / 低置信度可直接降级到输码/手动，不产生半核销状态。
//
// 密钥：腾讯云 SecretId / SecretKey 放**云函数环境变量**（TENCENT_SECRET_ID /
// TENCENT_SECRET_KEY），绝不进小程序包（§10）。子账号最小权限只授 OCR 策略。
//
// 置信度阈值：不做「猜」（§10）——低于阈值一律降级到扫码。阈值这里先不写死，
// 返回原始 confidence，由前端按「识别结果是否可用」决定是否直接核销。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

/** 惰性加载腾讯云 SDK：环境变量缺失时不 require，报明确错误 */
function getOcrClient() {
  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) {
    const err = new Error('缺少腾讯云 OCR 密钥（云函数环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY）')
    err.code = 'NO_CREDENTIAL'
    throw err
  }
  // 云函数打包上传时把 node_modules 一起带上，这里运行时 require
  // eslint-disable-next-line global-require
  const tencentcloud = require('tencentcloud-sdk-nodejs')
  const OcrClient = tencentcloud.ocr.v20181119.Client
  return new OcrClient({
    credential: { secretId, secretKey },
    region: 'ap-shanghai',
    profile: {
      httpProfile: { endpoint: 'ocr.tencentcloudapi.com' },
    },
  })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const { fileID } = event || {}
  if (typeof fileID !== 'string' || fileID === '') {
    return { code: 'BAD_REQUEST', message: '缺少图片' }
  }

  // 身份：车场端核销是 lot_admin / ops_admin 的操作
  const db = cloud.database()
  let role = 'driver'
  try {
    const u = (await db.collection('users').where({ _openid: OPENID }).limit(1).get()).data[0]
    role = u ? (ROLE_WHITELIST.includes(u.role) ? u.role : 'driver') : 'driver'
  } catch (e) { /* 按 driver 不误判 */ }
  if (role !== 'lot_admin' && role !== 'ops_admin') {
    return { code: 'NO_AUTH', message: '非车场管理员' }
  }

  // 1. 下载原图。云存储的 fileID 是云函数直接可读的
  let buffer
  try {
    const res = await cloud.downloadFile({ fileID })
    buffer = res.fileContent
  } catch (e) {
    return { code: 'BAD_FILE', message: '图片读取失败' }
  }
  if (!buffer || buffer.length === 0) {
    return { code: 'BAD_FILE', message: '图片为空' }
  }
  // 图片太大 OCR 会拒：拍照原图可能几 MB，前端已 compressImage 压缩；
  // 这里再兜底限 4MB（LicensePlateOCR 单张上限），超了给明确错误引导重新拍
  if (buffer.length > 4 * 1024 * 1024) {
    return { code: 'FILE_TOO_LARGE', message: '图片过大，请重新拍摄' }
  }

  // 2. 调腾讯云 OCR
  let client
  try {
    client = getOcrClient()
  } catch (e) {
    return { code: e.code || 'OCR_FAILED', message: e.message || 'OCR 配置错误' }
  }
  let ocrRes
  try {
    ocrRes = await client.LicensePlateOCR({
      ImageBase64: buffer.toString('base64'),
    })
  } catch (e) {
    // 腾讯云 SDK 的错误结构：e.code / e.message。密钥未授权会在这抛
    return { code: 'OCR_FAILED', message: `识别失败：${e.message || e}` }
  }

  // 3. 取结果。LicensePlateOCR 返回 Plates: [{ Plate, Color, PlateConfidence }]
  const plate = ocrRes && ocrRes.Plates && ocrRes.Plates[0]
  if (!plate || !plate.Plate) {
    return { code: 'OCR_NO_PLATE', message: '未识别到车牌' }
  }

  return {
    code: 0,
    data: {
      plate: plate.Plate,
      confidence: plate.PlateConfidence ?? null,
      fileID,
    },
  }
}
