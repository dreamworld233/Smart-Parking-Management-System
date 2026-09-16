// 车场库列表（任务书 §5 adminListLots）。读操作，但仍在入口校验登录态与角色。
//
// 支持按名称/地址模糊搜索 + 分页。Web 后台的读也走云函数：角色判定一致、
// 且列表要按 admin 的口径做字段清洗（freeSpots 为 null 时要如实显示「待上报」，
// 不能像小程序端那样直接消费）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { requireAdmin } = require('./auth')

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

exports.main = async (event) => {
  const gate = requireAdmin(event)
  if (gate.error) return gate.error

  const db = cloud.database()
  const _ = db.command
  const lots = db.collection('lots')

  const { keyword = '', page = 1, pageSize = 20 } = event || {}
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100)
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size

  let query = lots
  if (typeof keyword === 'string' && keyword.trim() !== '') {
    const re = db.RegExp({ regexp: escapeRegExp(keyword.trim()), options: 'i' })
    query = lots.where(_.or([{ name: re }, { address: re }]))
  }

  const countRes = await query.count()
  const res = await query.orderBy('updatedAt', 'desc').skip(offset).limit(size).get()

  console.log('[adminListLots] 查询车场 keyword=' + (keyword || '') + ' page=' + page + ' 命中=' + countRes.total)
  return { code: 0, data: { total: countRes.total, list: res.data } }
}
