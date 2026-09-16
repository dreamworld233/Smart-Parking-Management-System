// 车场绑定页用的车场列表：全部签约车场（名称/地址），供车场主选一家绑定。
//
// 车场主初次选身份后还没有绑定任何车场，所以这个函数**不做角色鉴权**——
// 任何登录用户都能列出车场（绑定入口本来就在角色切换之后）。绑定证明验证留后续。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  const db = cloud.database()
  const lots = db.collection('lots')

  let list = []
  try {
    const r = await lots.limit(100).get()
    list = r.data.map(x => ({
      _id: x._id,
      name: x.name,
      address: x.address || '',
      // 已绑定给谁：前端可显示「已被 X 绑定」，避免误选已被管的车场
      adminUserId: x.adminUserId || null,
    }))
  } catch (e) {
    return { code: 'UNKNOWN', message: '车场列表读取失败' }
  }

  return { code: 0, data: { list } }
}
