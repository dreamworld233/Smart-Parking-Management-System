import { QQMAP_KEY } from '../../miniprogram/config'
import { QQMapError, searchByKeyword, searchNearby, walkingDistance } from '../../miniprogram/services/qqmap'
import { installWxRequestShim } from './wx-node-shim'

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
        // 距离字段只有传了 orderby=_distance 才有值。这条挂了就说明排序参数丢了，
        // 页面会把所有车场显示成 0 米
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
    '步行矩阵给出路线距离与耗时',
    async () => {
      const pois = await searchNearby('停车场', CENTER, RADIUS_M)
      const target = pois[0]

      const walk = await walkingDistance(CENTER, target.location)

      expect(walk).not.toBeNull()
      // 路线距离不会短于直线距离，但会按绕行放大 —— 用它替掉直线距离才有意义
      expect(walk!.distanceM).toBeGreaterThanOrEqual(Math.floor(target.distanceM))
      expect(walk!.durationMin).toBeGreaterThanOrEqual(1)
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
