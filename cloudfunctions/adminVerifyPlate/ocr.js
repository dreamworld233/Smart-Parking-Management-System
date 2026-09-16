// 腾讯云 OCR LicensePlateOCR 调用（任务书 §5 adminVerifyPlate）。
//
// 密钥（SecretId / SecretKey）放云函数环境变量 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY，
// 绝不放前端。签名走 TC3-HMAC-SHA256（腾讯云 API v3），只用 Node 内置 crypto + https，
// 不引第三方 SDK（云函数目录要轻）。
//
// 注意：本文件签名算法照官方文档实现，但未经真实密钥联调（本机网络策略拦截了
// docs.cloudbase.net / 腾讯云文档原文，无法逐字核对响应字段）。部署后需在云端测试里
// 用一张真车牌图联调一次，确认 LicensePlateOCR 的响应字段（Number / Confidence）与
// 文档一致再放量。识别失败不影响「手动输码核销」这条主链路（任务书 §9：OCR 是增强，
// 不是单点依赖）。
const https = require('https')
const crypto = require('crypto')

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest()
}
function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex')
}

/**
 * 调用 LicensePlateOCR，返回 { plate, confidence }。
 * 未配置密钥 / 识别失败 / 响应无车牌时 throw 特定错误码，由 index.js 转成降级提示。
 */
async function licensePlateOCR(imageBase64) {
  const secretId = process.env.TENCENTCLOUD_SECRET_ID
  const secretKey = process.env.TENCENTCLOUD_SECRET_KEY
  if (!secretId || !secretKey) {
    const err = new Error('OCR 密钥未配置')
    err.code = 'OCR_NOT_CONFIGURED'
    throw err
  }

  const service = 'ocr'
  const host = 'ocr.tencentcloudapi.com'
  const action = 'LicensePlateOCR'
  const version = '2018-11-19'
  const payload = JSON.stringify({ ImageBase64: imageBase64 })
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const hashedPayload = sha256Hex(payload)
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`

  const secretDate = hmac('TC3' + secretKey, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = hmacHex(secretSigning, stringToSign)
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const body = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        path: '/',
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json; charset=utf-8',
          Host: host,
          'X-TC-Action': action,
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Version': version,
          'X-TC-Region': '',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(data))
      },
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch (e) {
    const err = new Error('OCR 响应解析失败')
    err.code = 'OCR_FAILED'
    throw err
  }
  const resp = parsed.Response || {}
  if (resp.Error) {
    const err = new Error('OCR 调用失败：' + resp.Error.Code)
    err.code = 'OCR_FAILED'
    throw err
  }

  // 兼容两种可能的响应形状：单张 { Number, Confidence }，或多张 { Plates: [...] }
  let plate = ''
  let confidence = null
  if (typeof resp.Number === 'string' && resp.Number.trim() !== '') {
    plate = resp.Number
    confidence = Number.isFinite(resp.Confidence) ? resp.Confidence : null
  } else if (Array.isArray(resp.Plates) && resp.Plates.length > 0) {
    plate = resp.Plates[0].Number || ''
    confidence = Number.isFinite(resp.Plates[0].Confidence) ? resp.Plates[0].Confidence : null
  }
  if (!plate) {
    const err = new Error('未能识别出车牌')
    err.code = 'OCR_NO_PLATE'
    throw err
  }
  return { plate, confidence }
}

module.exports = { licensePlateOCR }
