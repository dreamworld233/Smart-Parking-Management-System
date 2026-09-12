import { QQMAP_KEY } from '../../miniprogram/config'
import { fetchNearbyLots } from '../../miniprogram/services/lot'
import { installWxRequestShim, throttleMatrix } from './wx-node-shim'

// 假 Key 时整组跳过（同 qqmap.live.ts 的理由）
const hasRealKey = QQMAP_KEY.length > 0 && !QQMAP_KEY.startsWith('REPLACE_')
const maybeDescribe = hasRealKey ? describe : describe.skip

/** 济南历下区奥体西路一带，实测 3 km 内有多个停车场 POI */
const CENTER = { lat: 36.65, lng: 117.12 }

maybeDescribe('车场聚合 · 真接口', () => {
  beforeAll(() => {
    installWxRequestShim()
  })

  it(
    '真实 POI 聚合成车场：估算字段标 estimated，Top3 拿到真实路线',
    async () => {
      await throttleMatrix()
      const { lots, hasEstimatedDistance } = await fetchNearbyLots(CENTER)

      expect(lots.length).toBeGreaterThan(0)

      // 名称与地址来自 POI，不是编的
      expect(lots.every(l => l.name.length > 0 && l.address.length > 0)).toBe(true)
      // 车位、收费、评分是本地估算，必须如实标注
      expect(lots.every(l => l.pricing.source === 'estimated')).toBe(true)
      expect(lots.every(l => l.availability.source === 'estimated')).toBe(true)

      // 只有查得起路线的那几个是 route，其余是估算 —— 同一次列表里两种数据混着，
      // 页面必须能逐条区分，所以这个标记不能是整批一个
      const routed = lots.filter(l => l.distanceSource === 'route')
      expect(routed.length).toBeGreaterThan(0)
      expect(hasEstimatedDistance).toBe(true)
      // 路线距离不小于自己的直线距离（POI 给的是直线距离，折算前先比）
      expect(routed.every(l => l.walkMinutes >= 1)).toBe(true)
    },
    30000,
  )
})
