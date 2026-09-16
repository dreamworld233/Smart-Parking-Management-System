// 车场停用/启用（任务书 §5 adminDeleteLot / §6「停用」）。只有 ops_admin。
//
// 用**软停用**而不是物理删除：reservations 里存了 lotId 快照，物理删掉会断历史单。
// 实现为 contract.status 在 signed / disabled 之间翻转（幂等，点一次停用、再点启用），
// 与 seedLots 的 contract 字段同源。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { requireOps } = require('./auth')

exports.main = async (event) => {
  const gate = requireOps(event)
  if (gate.error) return gate.error

  const db = cloud.database()
  const lots = db.collection('lots')

  const { lotId } = event || {}
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }

  const got = await lots.where({ _id: lotId }).limit(1).get()
  if (got.data.length === 0) return { code: 'NOT_FOUND', message: '车场不存在' }

  const prev = got.data[0].contract || {}
  const status = prev.status === 'disabled' ? 'signed' : 'disabled'
  const signedAt = typeof prev.signedAt === 'number' ? prev.signedAt : Date.now()
  await lots.doc(lotId).update({
    data: { contract: { status, signedAt }, updatedAt: Date.now() },
  })

  console.log('[adminDeleteLot] 车场状态已切换 lotId=' + lotId + ' status=' + status)
  return { code: 0, data: { lotId, status } }
}
