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
let localEnv = ''
try {
  const local = require('./config.local')
  localKey = local.QQMAP_KEY || ''
  localEnv = local.CLOUD_ENV || ''
} catch {
  // config.local.ts 不存在：保持占位符
}

export const QQMAP_KEY = localKey || 'REPLACE_WITH_YOUR_KEY'

/**
 * 云开发环境 ID。未配置（新克隆）时为空串，服务层据此给出明确报错，
 * 不做静默兜底 —— 环境配错的表现应该是「一句话说清」，而不是 undefined 行为
 */
export const CLOUD_ENV = localEnv

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
 * `boundary=nearby(lat,lng,r)` 语法上必填的一位（`boundary` 整个省掉会直接
 * 报 `348 参数错误`），接口不按它筛。**能不能返回远处结果取决于关键词，不在页面
 * 控制内**：2026-09-15 实测以合肥为心，「南京理工」155km、「郑州东站」465km、
 * 「西湖」323km 都能出，「南京大学」「北京大学」「德基广场」一律 0 条，
 * 且与距离/城市/类别无关（南京理工 vs 南京大学同城同距，一个出 20 一个出 0）。
 * 搜索页已改用 `suggestPlaces`（region=合肥 的联想接口），本常量只剩 live 测试在用
 */
export const SEARCH_BIAS_RADIUS_M = 50000

/**
 * 目的地检索的行政区限定。合肥为主场景，但**允许全国兜底**（用户 2026-09-15）：
 * suggestion 配 `region_fix=0` 时合肥结果排前面、全国候选保留 —— 本地常用词（万象城）
 * 不被成都/南通挤掉，跨城目的地（南京大学）也还能搜到
 */
export const SEARCH_REGION = '合肥'

/**
 * 周边检索结果的缓存时长（毫秒）。
 * 地点搜索的每日额度很小（实测档位约 200 次/天），每次刷新都重查的话，
 * 开发期几天就能把额度打光
 */
export const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000

/**
 * 签约车场与未签约 POI 合并时的近邻去重半径（米）。
 * 同一片物理车位在腾讯库里常有相邻的两条 POI（改名前后的校名入口等），
 * 距签约车场小于该值的未签约 POI 视为同一处，丢弃
 */
export const NEARBY_DEDUP_M = 150
