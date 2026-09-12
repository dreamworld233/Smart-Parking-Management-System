import type { GeoPoint } from '../domain/types'

export type LocationResult =
  | { ok: true; point: GeoPoint }
  | { ok: false; reason: 'denied' | 'failed' }

/**
 * 是否为「用户拒绝授权」。旧基础库给 `getLocation:fail auth deny`，
 * 新版给 `getLocation:fail:auth denied` —— 后者**不是**前者的延长
 * （"auth deny" 的 y 对不上 "denied" 的 i），只判 'auth deny' 会漏掉新版，
 * 把「用户拒绝」误报成「定位失败」，页面就跳过了引导授权的分支。
 * 设备级定位未开启的文案（system permission denied）两者都不含，归为 failed
 */
const AUTH_DENIED = /auth den(y|ied)/

/**
 * 获取当前位置。用户拒绝授权时返回 denied，不抛异常 —— 调用方要对这两种失败
 * 说不同的话（引导去设置页授权 vs 提示定位失败），所以这里必须分开。
 *
 * 坐标系固定 gcj02：车场坐标来自腾讯地图，用 wgs84 会让地图上的点整体偏移。
 */
export function getCurrentPoint(): Promise<LocationResult> {
  return new Promise(resolve => {
    wx.getLocation({
      type: 'gcj02',
      success: res => resolve({ ok: true, point: { lat: res.latitude, lng: res.longitude } }),
      fail: err => {
        const msg = typeof err.errMsg === 'string' ? err.errMsg : ''
        resolve({ ok: false, reason: AUTH_DENIED.test(msg) ? 'denied' : 'failed' })
      },
    })
  })
}

/** 用系统内置地图打开导航。无需额外 SDK 与域名配置 */
export function openNavigation(point: GeoPoint, name: string, address: string): void {
  wx.openLocation({
    latitude: point.lat,
    longitude: point.lng,
    name,
    address,
    scale: 15,
  })
}
