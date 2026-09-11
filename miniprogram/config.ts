// config.ts
/**
 * 腾讯位置服务 Key。
 *
 * ⚠️ 本仓库是公开的，**不要把真实 Key 提交进来**。
 * 真实 Key 写到同目录的 `config.local.ts`（已在 .gitignore 中）。
 * 没有那个文件时回退到占位符，保证新克隆的项目仍能编译通过。
 *
 * 配置步骤见 `docs/setup/tencent-map-setup.md`。
 */
let localKey = ''
try {
  localKey = require('./config.local').QQMAP_KEY || ''
} catch {
  // config.local.ts 不存在：保持占位符
}

export const QQMAP_KEY = localKey || 'REPLACE_WITH_YOUR_KEY'

/** 首页默认搜索半径（米） */
export const DEFAULT_RADIUS_M = 3000

/** 请求超时（毫秒）。失败重试 1 次 */
export const REQUEST_TIMEOUT_MS = 3000
