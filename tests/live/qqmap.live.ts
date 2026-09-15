import { QQMAP_KEY } from '../../miniprogram/config'
import {
  QQMapError,
  searchByKeyword,
  searchDestination,
  searchNearby,
  suggestPlaces,
  walkingDistance,
  walkingDistances,
} from '../../miniprogram/services/qqmap'
import { installWxRequestShim, throttleMatrix } from './wx-node-shim'

// 假 Key 时整组跳过并说明原因：公开仓库新克隆的机器上跑 test:live 不该给个
// 看不懂的失败，但也不能静默当成通过
const hasRealKey = QQMAP_KEY.length > 0 && !QQMAP_KEY.startsWith('REPLACE_')
if (!hasRealKey) {
  console.warn('[live] 未配置 miniprogram/config.local.ts 的真实 Key，整组跳过')
}

/** 济南市历下区（奥体西路一带），实测该点 3 km 内有多个停车场 POI */
const CENTER = { lat: 36.65, lng: 117.12 }
const RADIUS_M = 3000

const maybeDescribe = hasRealKey ? describe : describe.skip

maybeDescribe('qqmap 真接口', () => {
  beforeAll(() => {
    installWxRequestShim()
  })

  it(
    '周边检索返回真实车场，且带得出距离',
    async () => {
      const pois = await searchNearby('停车场', CENTER, RADIUS_M)

      expect(pois.length).toBeGreaterThan(0)
      for (const poi of pois) {
        expect(poi.id).not.toBe('')
        expect(poi.title).not.toBe('')
        // 距离字段挂 0 说明接口没下发 _distance，页面会把车场全显示成 0 米。
        // （不是 orderby 的问题：2026-09-13 实测 nearby 边界下不传 orderby 也有值）
        expect(poi.distanceM).toBeGreaterThan(0)
        expect(poi.distanceM).toBeLessThanOrEqual(RADIUS_M)
        expect(poi.location.lat).toBeCloseTo(CENTER.lat, 1)
        expect(poi.location.lng).toBeCloseTo(CENTER.lng, 1)
      }
    },
    20000,
  )

  it(
    '城市检索能按关键词命中',
    async () => {
      const pois = await searchByKeyword('泉城广场', '济南')

      expect(pois.length).toBeGreaterThan(0)
      expect(pois.some(p => p.title.indexOf('泉城广场') >= 0)).toBe(true)
    },
    20000,
  )

  it(
    'nearby 目的地检索对部分关键词能跨城返回远处结果',
    async () => {
      // 2026-09-15 实测：以合肥为心，「南京理工大学」返回 155 公里外、「郑州东站」465 公里外、
      // 「合肥大学」（以济南为心）545 公里外的结果 —— 跨城可行。
      // 但同批实测「南京大学」「北京大学」「德基广场」一律 0 条，与距离、城市、类别都无关
      // （南京理工 vs 南京大学：同城、同距、同类，一个出 20 一个出 0）。
      // 决定因素在腾讯侧的关键词索引，页面无法预测 —— 这正是搜索页改用 suggestion
      // 做目的地检索的原因，searchDestination 只剩历史回点兜底在用
      const pois = await searchDestination('南京理工大学', CENTER, 50000)

      expect(pois.length).toBeGreaterThan(0)
      // 结果确确实实来自南京，不是被纠偏成本地同名地点
      expect(pois[0].distanceM).toBeGreaterThan(100000)
    },
    20000,
  )

  it(
    'suggestion 本地优先 + 全国兜底：本地词排第一，跨城也能出',
    async () => {
      // 合肥为主场景：本地词必须排第一（万象城 → 合肥万象城，不是成都万象城）
      const local = await suggestPlaces('合肥大学', '合肥')
      expect(local.length).toBeGreaterThan(0)
      expect(local[0].title).toContain('合肥大学')

      // 全国兜底：region_fix=0 下跨城目的地也进得来（用户 2026-09-15 拍板全国可搜）
      const mall = await suggestPlaces('万象城', '合肥')
      expect(mall[0].title).toContain('合肥万象城')

      const cross = await suggestPlaces('南京大学', '合肥')
      expect(cross.some(p => p.title.indexOf('南京大学') >= 0)).toBe(true)
    },
    20000,
  )

  it(
    '步行矩阵给出路线距离与耗时',
    async () => {
      const pois = await searchNearby('停车场', CENTER, RADIUS_M)
      const target = pois[0]

      await throttleMatrix()
      const walk = await walkingDistance(CENTER, target.location)

      expect(walk).not.toBeNull()
      // 路线距离不会短于直线距离，但会按绕行放大 —— 用它替掉直线距离才有意义
      expect(walk!.distanceM).toBeGreaterThanOrEqual(Math.floor(target.distanceM))
      expect(walk!.durationMin).toBeGreaterThanOrEqual(1)
    },
    20000,
  )

  it(
    '批量矩阵一次问 3 个目的地，结果与入参同序',
    async () => {
      const pois = await searchNearby('停车场', CENTER, RADIUS_M)

      const targets = pois.slice(0, 3).map(p => p.location)

      await throttleMatrix()
      const results = await walkingDistances(CENTER, targets)

      expect(results).toHaveLength(3)
      expect(results.every(r => r !== null)).toBe(true)
      // 顺序错位会让某个车场拿到别人的距离 —— 路线距离不可能短于自己的直线距离，
      // 逐项比对就能抓到错位（拿远处的路线配近处的直线时会立刻矛盾）
      results.forEach((r, i) => {
        expect(r!.distanceM).toBeGreaterThanOrEqual(Math.floor(pois[i].distanceM))
        expect(r!.durationMin).toBeGreaterThanOrEqual(1)
      })
    },
    20000,
  )

  it(
    '按坐标周边检索与城市检索走的是同一路径，互不串味',
    async () => {
      // 两条都是 /ws/place/v1/search，只有 boundary 不同：一条挂了另一条绿
      // 会让人误判成「接口正常」。分开断言，出问题时指向清楚
      const nearby = await searchNearby('停车场', CENTER, 500)
      const region = await searchByKeyword('停车场', '济南')

      expect(nearby.every(p => p.distanceM <= 500)).toBe(true)
      expect(region.length).toBeGreaterThan(nearby.length)
    },
    20000,
  )

  it(
    '半径小到没有结果时返回空数组，不抛错',
    async () => {
      // 空结果是正常业务态，必须与「调用失败」区分开：页面要显示「附近暂无车场」
      // 而不是「加载失败」
      await expect(searchNearby('停车场', { lat: 0.5, lng: 0.5 }, 100)).resolves.toEqual([])
    },
    20000,
  )

})
