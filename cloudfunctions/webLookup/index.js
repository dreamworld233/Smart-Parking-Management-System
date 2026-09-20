// 车辆信息 / 订单流水查询（任务书 §5 webLookup，对应课程「车辆信息管理」）。
//
// 按 plateNo / orderNo / status 过滤 reservations，并组合出每单的 orders 流水
// （预支停车费 prepaid / 服务费 service / 退款 refund，三笔都在一张 orders 表里）。
// 只读，允许 ops_admin 与 lot_admin 查看。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { requireAdmin } = require('./auth')

const STATUSES = ['pending_entry', 'entered', 'completed', 'cancelled', 'released']

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

exports.main = async (event) => {
  const gate = requireAdmin(event)
  if (gate.error) return gate.error

  const db = cloud.database()
  const _ = db.command
  const reservations = db.collection('reservations')
  const orders = db.collection('orders')

  const { plateNo, orderNo, status, page = 1, pageSize = 20 } = event || {}
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100)
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size

  const cond = {}
  if (typeof plateNo === 'string' && plateNo.trim() !== '') {
    cond.plateNo = db.RegExp({ regexp: escapeRegExp(plateNo.trim().toUpperCase()), options: 'i' })
  }
  if (typeof orderNo === 'string' && orderNo.trim() !== '') {
    cond.orderNo = orderNo.trim()
  }
  if (typeof status === 'string' && status !== '' && STATUSES.includes(status)) {
    cond.status = status
  }

  const hasCond = Object.keys(cond).length > 0
  const base = hasCond ? reservations.where(cond) : reservations
  const countRes = await base.count()
  const res = await base.orderBy('createdAt', 'desc').skip(offset).limit(size).get()
  const list = res.data

  // 组合流水：这批 reservation 的所有 orders，按 reservationId 归组
  const ordersByRes = {}
  if (list.length > 0) {
    const ids = list.map((r) => r._id)
    const orderRes = await orders.where({ reservationId: _.in(ids) }).limit(1000).get()
    for (const o of orderRes.data) {
      if (!ordersByRes[o.reservationId]) ordersByRes[o.reservationId] = []
      ordersByRes[o.reservationId].push(o)
    }
  }

  console.log('[webLookup] 查询流水 plateNo=' + (plateNo || '') + ' orderNo=' + (orderNo || '') + ' status=' + (status || '') + ' 命中=' + countRes.total)
  return {
    code: 0,
    data: {
      total: countRes.total,
      list: list.map((r) => ({ ...r, orders: ordersByRes[r._id] || [] })),
    },
  }
}
