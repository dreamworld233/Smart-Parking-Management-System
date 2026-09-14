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

/**
 * 定位失败 / 被拒时的兜底中心：合肥大学（南艳湖校区）。
 *
 * 坐标不是估的，是 2026-09-13 用本项目 Key 打
 * `/ws/place/v1/search?keyword=合肥大学&boundary=region(合肥,0)` 返回的
 * 首条「教育学校:大学」POI（31.752727 / 117.254098，地址：蜀山区锦绣大道 99 号）。
 * 课程红线不许模拟数据，所以这里必须留来源；换城市时照同样的路子重新查一次。
 *
 * 用法：首页定位失败时**直接拿它当定位点继续拉周边车场**，并在面板上明说是兜底
 * （文案见 `domain/format.ts` 的 `fallbackNotice`）—— 地图停在一个点上却不说，
 * 用户会以为「已经定位到那儿了」
 */
export const FALLBACK_PLACE = {
  name: '合肥大学',
  point: { lat: 31.752727, lng: 117.254098 },
}

/** 请求超时（毫秒）。失败重试 1 次 */
export const REQUEST_TIMEOUT_MS = 3000

/** 步行速度（米/分钟），约 4.8 km/h。接口给了耗时就用接口的，这个只作兜底 */
export const WALK_METERS_PER_MINUTE = 80

/** 直线距离换算成步行距离的绕行系数：路线一般比直线长 */
export const WALK_DETOUR_FACTOR = 1.3

/** 首页查真实步行路线的车场个数上限（路径矩阵按目的地计费，实测约 5 点/秒） */
export const WALK_LOOKUP_TOP_N = 3

/**
 * 地图上最多画几个图钉。
 *
 * 接口一次最多给 20 个车场，全画出来标签必然互相压死 —— 2026-09-13 真机实测
 * 搜索页地图高约 200px，20 条标签糊成一片。列表仍是全部 20 条，只压图钉；
 * 选中项 / ★ 推荐那一条由 `pickPins` 补回来，不受这个上限影响
 */
export const MAX_PINS = 8

/**
 * 搜索页目的地检索的「排序提示半径」（米）。
 *
 * 接口**不按它筛**：实测传 50000 也照样返回 545 公里外的同名地点，它只是
 * `boundary=nearby(lat,lng,r)` 语法上必填的一位（`boundary` 整个省掉会直接
 * 报 `348 参数错误`）。真正决定顺序的是相关度，中心点只把附近的结果往前排。
 * **别把它调小当「只搜附近」用** —— 那只会让跨城的目的地搜不到，范围一点没变
 */
export const SEARCH_BIAS_RADIUS_M = 50000

/**
 * 周边检索结果的缓存时长（毫秒）。
 * 地点搜索的每日额度很小（实测档位约 200 次/天），每次刷新都重查的话，
 * 开发期几天就能把额度打光
 */
export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000
