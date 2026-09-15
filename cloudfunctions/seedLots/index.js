// 签约车场种子写入。按 poiId 幂等 upsert，重跑覆盖同一家、不会建出第二条。
//
// 门槛：**关键字段没核实的一律不写**（见 seed-data.js 顶部清单）。这是课程红线
// 「不许模拟数据」在代码里的落点 —— 门槛放在云函数里而不是靠人记得，是因为
// 编辑 seed-data.js 时手滑留个 null 太容易，而写进去的假价格没人会再回头查。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const { SEED_LOTS } = require('./seed-data')

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * 收费与车位数的来源白名单（数据模型 §4 的 `public` / `ops`，加一档 `placeholder`），
 * 别的一律当没核实。
 *
 * `placeholder` 是**演示用暂定值**：界面会照实标注「示例数据，待核实」，
 * 所以放进来的数据是诚实的；但它绝不能长成 `public` 的样子 —— 那才是编数据。
 */
function isSource(v) {
  return v === 'public' || v === 'ops' || v === 'placeholder'
}

/**
 * 列出这条种子还缺哪些字段，空数组才可入库。
 *
 * 返回字段名而不是布尔值：云端测试的结果里直接能看到「还缺 pricing.capPerDay」，
 * 否则每次都要去翻 seed-data.js 数哪一格还是 null。
 */
function missingFields(lot) {
  const out = []
  const pricing = lot.pricing || {}
  const availability = lot.availability || {}
  if (typeof lot.name !== 'string' || lot.name === '') out.push('name')
  if (typeof lot.address !== 'string' || lot.address === '') out.push('address')
  const loc = lot.location || {}
  if (typeof loc.lat !== 'number' || typeof loc.lng !== 'number') out.push('location')
  if (!isFiniteNum(pricing.firstHour)) out.push('pricing.firstHour')
  if (!isFiniteNum(pricing.perHourAfter)) out.push('pricing.perHourAfter')
  if (!isFiniteNum(pricing.capPerDay)) out.push('pricing.capPerDay')
  if (!isSource(pricing.source)) out.push('pricing.source')
  if (!isFiniteNum(availability.totalSpots)) out.push('availability.totalSpots')
  if (!isSource(availability.source)) out.push('availability.source')
  if (!isFiniteNum(lot.reservableQuota)) out.push('reservableQuota')
  if (!Array.isArray(lot.facilities)) out.push('facilities')
  return out
}

exports.main = async () => {
  const db = cloud.database()
  const lots = db.collection('lots')
  const written = []
  const skipped = []
  const now = Date.now()

  for (const lot of SEED_LOTS) {
    const missing = missingFields(lot)
    if (missing.length > 0) {
      skipped.push({ poiId: lot.poiId, name: lot.name, missing })
      continue
    }

    const doc = {
      poiId: lot.poiId,
      name: lot.name,
      address: lot.address,
      location: lot.location,
      pricing: lot.pricing,
      // 余位恒写 null 入库：只由车场端上报（Plan 3），种子不给初始值
      availability: { freeSpots: null, totalSpots: lot.availability.totalSpots, source: lot.availability.source },
      reservableQuota: lot.reservableQuota,
      // 已预约数从 0 起：预约下单云函数用等值 CAS 抢额度（reservedCount 随预约 +1，
      // 与 reservableQuota 比较判满）
      reservedCount: 0,
      facilities: lot.facilities,
      ratingSummary: null,
      note: lot.note || '',
      updatedAt: now,
    }

    const got = await lots.where({ poiId: lot.poiId }).limit(1).get()
    if (got.data.length > 0) {
      // 签约时间只在首次落库时写：重跑种子不该把「什么时候签的」改成今天
      const prev = got.data[0].contract
      const signedAt = prev && isFiniteNum(prev.signedAt) ? prev.signedAt : now
      await lots
        .doc(got.data[0]._id)
        .update({ data: { ...doc, contract: { status: 'signed', signedAt } } })
    } else {
      await lots.add({ data: { ...doc, contract: { status: 'signed', signedAt: now } } })
    }
    written.push(lot.name)
  }

  return { code: 0, data: { written, skipped } }
}
