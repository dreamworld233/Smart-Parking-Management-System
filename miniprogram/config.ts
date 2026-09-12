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

/** 步行速度（米/分钟），约 4.8 km/h。接口给了耗时就用接口的，这个只作兜底 */
export const WALK_METERS_PER_MINUTE = 80

/** 直线距离换算成步行距离的绕行系数：路线一般比直线长 */
export const WALK_DETOUR_FACTOR = 1.3

/** 首页查真实步行路线的车场个数上限（路径矩阵按目的地计费，实测约 5 点/秒） */
export const WALK_LOOKUP_TOP_N = 3

/**
 * 周边检索结果的缓存时长（毫秒）。
 * 地点搜索的每日额度很小（实测档位约 200 次/天），每次刷新都重查的话，
 * 开发期几天就能把额度打光
 */
export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000
