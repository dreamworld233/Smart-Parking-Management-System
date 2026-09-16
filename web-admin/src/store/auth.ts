// 登录态本地持久化（任务书 §6「登录态持久化（本地存储）」）。
// 不引 pinia：单个 session 对象用 reactive + localStorage 就够，少一个依赖。
import { reactive } from 'vue'
import type { Session } from '../types'

const KEY = 'spms_web_session'

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Session
  } catch {
    // ignore
  }
  // —— 临时预览模式：无登录态时返回 mock 会话，方便不部署云环境也能看各页面布局。
  //    部署云函数 / 建好账号后删除下面这行 return（恢复返回 null）。 ——
  return { token: '', userId: 'preview', role: 'ops_admin', username: '预览', nickname: '预览账号', expiresAt: 0 }
}

const state = reactive<{ session: Session | null }>({ session: load() })

export function getSession(): Session | null {
  return state.session
}

export function isLoggedIn(): boolean {
  return !!state.session
}

export function getToken(): string {
  return state.session?.token ?? ''
}

export function isOpsAdmin(): boolean {
  return state.session?.role === 'ops_admin'
}

export function setSession(s: Session): void {
  state.session = s
  localStorage.setItem(KEY, JSON.stringify(s))
}

export function clearSession(): void {
  state.session = null
  localStorage.removeItem(KEY)
}
