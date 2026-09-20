/**
 * 云开发环境 ID。从 .env.local 的 VITE_CLOUD_ENV 读取（本仓库公开，环境 ID 不写死）。
 * 未配置（新克隆）时为空串，api/cloudbase.ts 据此给出明确报错，不做静默兜底。
 */
export const CLOUD_ENV = import.meta.env.VITE_CLOUD_ENV || ''
