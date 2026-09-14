// 一次性初始化：建齐数据模型设计稿 §4 的全部集合。幂等，重复部署重跑无害。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const COLLECTIONS = [
  'users',
  'cars',
  'lots',
  'availability_samples',
  'reservations',
  'orders',
  'payments',
  'reviews',
  'lot_price_changes',
  'entry_logs',
  'violations',
]

/**
 * 「集合已存在」的判定。云开发在重复建集合时抛的错没有稳定的 errCode 文档，
 * 只能从 errMsg 里认关键词。
 *
 * 为什么不干脆 catch 掉全部：那样权限、配额这类**真错误**会被记成「已存在」，
 * 云端测试返回 `{created: [], existed: [11 个]}` 看着像成功，实际一个集合都没建。
 * 认不出来的一律重抛，让它在测试结果里露出来
 */
function isAlreadyExists(e) {
  const msg = String((e && (e.errMsg || e.message)) || e || '')
  return /exist/i.test(msg)
}

exports.main = async () => {
  const db = cloud.database()
  const created = []
  const existed = []
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
      created.push(name)
    } catch (e) {
      if (!isAlreadyExists(e)) throw e
      existed.push(name)
    }
  }
  return { code: 0, data: { created, existed } }
}
