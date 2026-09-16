// 全项目触碰 @cloudbase/js-sdk 的唯一入口。
// Web 端没有微信身份，调用云函数前先做一次匿名登录建立 CloudBase 登录态（传输层身份）；
// 真正的管理员鉴权靠 webLogin 签发的自签票据，在云函数入口校验（见 cloudfunctions/*/auth.js）。
import cloudbase from '@cloudbase/js-sdk'
import { CLOUD_ENV } from '../config'

// js-sdk 类型声明不全，这里用 any 收敛，避免为不完整的 d.ts 到处断言
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any = null

export function getApp(): any {
  if (!CLOUD_ENV) throw new Error('未配置云开发环境 ID（请建 web-admin/.env.local 填 VITE_CLOUD_ENV）')
  if (!app) app = cloudbase.init({ env: CLOUD_ENV })
  return app
}

let anonReady: Promise<void> | null = null

/** 建立匿名登录态（幂等）。callFunction 之前必须登录，匿名登录是最省配置的一档 */
export function ensureAnonLogin(): Promise<void> {
  if (anonReady) return anonReady
  anonReady = (async () => {
    const auth = getApp().auth()
    const state = await auth.getLoginState()
    if (!state) {
      await auth.signInAnonymously()
    }
    console.log('[web-admin] CloudBase 匿名登录已就绪')
  })()
  return anonReady
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

/**
 * 云函数统一返回 { code, message, data }。网络层异常归一成 NETWORK，
 * 调用方只看 ok 分支，不用各写一遍 try/catch。
 */
export async function callCloud<T>(name: string, data?: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    await ensureAnonLogin()
    const res = await getApp().callFunction({ name, data: data ?? {} })
    const body = res.result as { code?: unknown; message?: unknown; data?: unknown }
    if (body && body.code === 0) return { ok: true, data: body.data as T }
    return { ok: false, code: String(body?.code ?? 'UNKNOWN'), message: String(body?.message ?? '云函数返回异常') }
  } catch (e) {
    return { ok: false, code: 'NETWORK', message: (e as Error)?.message || '调用失败' }
  }
}

export type UploadResult = { ok: true; fileID: string } | { ok: false; message: string }

/** 上传车牌照片到云存储，返回 fileID（交给 adminVerifyPlate 做 OCR） */
export async function uploadImage(file: File): Promise<UploadResult> {
  try {
    await ensureAnonLogin()
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.jpg'
    const cloudPath = `web-admin/plate/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`
    const res = await getApp().uploadFile({ cloudPath, filePath: file })
    const fileID = res && res.fileID
    if (typeof fileID !== 'string' || !fileID) return { ok: false, message: '上传未返回 fileID' }
    return { ok: true, fileID }
  } catch (e) {
    return { ok: false, message: (e as Error)?.message || '上传失败' }
  }
}
