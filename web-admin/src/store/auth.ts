// 登录态本地持久化（任务书 §6「登录态持久化（本地存储）」）。
// 不引 pinia：单个 session 对象用 reactive + localStorage 就够，少一个依赖。
import { reactive } from 'vue'
import type { Session } from '../types'

const KEY = 'spms_web_session'

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
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
