import type { GeoPoint } from './types'

const EARTH_RADIUS_M = 6371000

/**
 * 两坐标的球面距离（米）。
 *
 * 签约车场库个位数，不需要 geoNear/地理索引（见计划头部偏差表）：
 * 全量拉回后用本函数本地算直线距离，页面展示的步行距离 = 直线 × 绕行系数，
 * 与退役前 POI 路径的兜底口径一致
 */
export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
}
