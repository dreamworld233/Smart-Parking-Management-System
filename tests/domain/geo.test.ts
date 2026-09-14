import { haversineM } from '../../miniprogram/domain/geo'

describe('haversineM', () => {
  it('同点为 0', () => {
    const p = { lat: 31.752727, lng: 117.254098 }
    expect(haversineM(p, p)).toBe(0)
  })

  it('南北向 1 纬度约 111.2km', () => {
    const m = haversineM({ lat: 31, lng: 117 }, { lat: 32, lng: 117 })
    expect(m).toBeGreaterThan(110000)
    expect(m).toBeLessThan(112500)
  })

  it('东西向距离随纬度收缩（纬度 31° 处 1 经度约 95km）', () => {
    const m = haversineM({ lat: 31, lng: 117 }, { lat: 31, lng: 118 })
    expect(m).toBeGreaterThan(93000)
    expect(m).toBeLessThan(97000)
  })

  it('对径点不超过半周长', () => {
    const m = haversineM({ lat: 31, lng: 117 }, { lat: -31, lng: -63 })
    expect(m).toBeLessThanOrEqual(Math.PI * 6371000)
  })
})
