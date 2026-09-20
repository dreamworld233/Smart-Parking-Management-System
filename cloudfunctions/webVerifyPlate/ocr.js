// 腾讯云 OCR LicensePlateOCR 调用（webVerifyPlate，任务书 §5）。
//
// 与小程序 recognizePlate 同一线路（2026-09-20 组长口径：web 车牌识别以小程序流程和线路为准）：
//   - 密钥环境变量：TENCENT_SECRET_ID / TENCENT_SECRET_KEY（与 recognizePlate 同名，
//     一份密钥两条线路共用，部署 webVerifyPlate 时配同名变量即可）
//   - 调用方式：官方 SDK tencentcloud-sdk-nodejs（不手写 TC3-HMAC 签名）
//   - 响应字段：LicensePlateInfos[0].Number/.Confidence（SDK 4.x 真模型），顶层 Number 兜底
//
// 2026-09-17 recognizePlate 已踩过坑：旧代码读 Plates[0].Plate，字段名全错 → 恒 OCR_NO_PLATE。
// 这里抄 recognizePlate 的解析分支，web 端不重蹈。
const tencentcloud = require('tencentcloud-sdk-nodejs')

/**
 * 惰性加载 OCR client：密钥缺失时不 require，报明确错误（与 recognizePlate getOcrClient 同款，
 * 复制一份 —— 云函数单目录打包，不能跨目录 require）。
 */
function getOcrClient() {
  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) {
    const err = new Error('缺少腾讯云 OCR 密钥（云函数环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY）')
    err.code = 'OCR_NOT_CONFIGURED'
    throw err
  }
  const OcrClient = tencentcloud.ocr.v20181119.Client
  return new OcrClient({
    credential: { secretId, secretKey },
    region: 'ap-shanghai',
    profile: {
      httpProfile: { endpoint: 'ocr.tencentcloudapi.com' },
    },
  })
}

/**
 * 调用 LicensePlateOCR，返回 { plate, confidence }。
 * 未配置密钥 / 识别失败 / 响应无车牌时 throw 特定错误码，由 index.js 转成降级提示。
 */
async function licensePlateOCR(imageBase64) {
  const client = getOcrClient() // 未配置密钥抛 OCR_NOT_CONFIGURED
  let ocrRes
  try {
    ocrRes = await client.LicensePlateOCR({ ImageBase64: imageBase64 })
  } catch (e) {
    const err = new Error('OCR 调用失败：' + (e && e.message ? e.message : e))
    err.code = 'OCR_FAILED'
    throw err
  }

  // SDK 4.x 模型：多车牌在 LicensePlateInfos[]，每项 { Number, Confidence }；
  // 单车牌时顶层直接给 Number/Confidence（与 recognizePlate 同一解析分支）
  const infos = ocrRes && ocrRes.LicensePlateInfos
  const first = infos && infos[0]
  let plate = ''
  let confidence = null
  if (first && first.Number) {
    plate = first.Number
    confidence = typeof first.Confidence === 'number' ? first.Confidence : null
  } else if (ocrRes && ocrRes.Number) {
    plate = ocrRes.Number
    confidence = typeof ocrRes.Confidence === 'number' ? ocrRes.Confidence : null
  }
  if (!plate) {
    const err = new Error('未能识别出车牌')
    err.code = 'OCR_NO_PLATE'
    throw err
  }
  return { plate, confidence }
}

module.exports = { licensePlateOCR }
