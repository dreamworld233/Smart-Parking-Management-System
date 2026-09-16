// 车场端余位上报。
//
// 实时余位只由车场端上报（数据模型 §4：seedLots 不种 freeSpots，种了就是编的）。
// 写入 lots.availability = { freeSpots, totalSpots, reportedAt, source: 'reported' }，
// 顺带落一条 availability_samples（上报时即采样，历史数据喂预测与及时率统计）。
//
// 权限：OPENID 必须是该车场的 adminUserId。角色判定在云函数入口（§5.6 原则）。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ROLE_WHITELIST = ['driver', 'lot_admin', 'ops_admin']

/** 取用户角色；users 缺失或读取失败按 driver（不误判成管理员） */
async function readRole(users, openid) {
  try {
    const u = (await users.where({ _openid: openid }).limit(1).get()).data[0]
    return u ? (ROLE_WHITELIST.includes(u.role) ? u.role : 'driver') : 'driver'
  } catch (e) {
    return 'driver'
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const { lotId, freeSpots } = event || {}
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }
  if (typeof freeSpots !== 'number' || !Number.isFinite(freeSpots)) {
    return { code: 'BAD_REQUEST', message: '余位必须是数字' }
  }

  const db = cloud.database()
  const users = db.collection('users')
  const lots = db.collection('lots')
  const samples = db.collection('availability_samples')

  // 1. 角色：车场管理员才允许上报
  const role = await readRole(users, OPENID)
  if (role !== 'lot_admin') {
    return { code: 'NO_AUTH', message: '非车场管理员' }
  }

  // 2. 读车场：确认是本人管理、取 totalSpots（freeSpots 不能超总位数）
  let lotDoc
  try {
    lotDoc = (await lots.doc(lotId).get()).data
  } catch (e) {
    return { code: 'NOT_FOUND', message: '车场不存在' }
  }
  if (lotDoc.adminUserId !== OPENID) {
    // 不是「没有权限」就说「没有权限」，别把越权报成车场不存在
    return { code: 'FORBIDDEN', message: '只能上报自己管理的车场' }
  }
  const totalSpots = (lotDoc.availability && lotDoc.availability.totalSpots) || 0
  if (typeof totalSpots !== 'number' || !Number.isFinite(totalSpots) || totalSpots <= 0) {
    return { code: 'CONFLICT', message: '车场总车位数缺失，无法上报' }
  }
  if (freeSpots < 0 || freeSpots > totalSpots) {
    return { code: 'BAD_REQUEST', message: `余位需在 0 ~ ${totalSpots} 之间` }
  }

  // 3. 写实时余位 + 顺带落采样
  const now = Date.now()
  await lots.doc(lotId).update({
    data: {
      availability: {
        freeSpots,
        totalSpots,
        reportedAt: now,
        source: 'reported',
      },
    },
  })
  try {
    await samples.add({
      data: {
        lotId,
        sampledAt: now,
        freeSpots,
        totalSpots,
        occupancyRate: Math.round((freeSpots / totalSpots) * 100),
        source: 'reported',
      },
    })
  } catch (e) {
    // 采样失败不影响上报本身；历史缺口由定时采样任务补（已知未完成）
  }

  return {
    code: 0,
    data: { reportedAt: now, freeSpots, totalSpots },
  }
}
