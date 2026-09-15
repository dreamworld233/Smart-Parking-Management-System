import { formatDistance } from './format'
import type { ParkingLot, Recommendation } from './types'

/** 图钉常态字号 / 选中时放大的字号。选中必须一眼看得出来 */
const PIN_FONT = 12
const PIN_FONT_SELECTED = 14
const PIN_PADDING = 6
const PIN_PADDING_SELECTED = 8
/** 选中底色：主色（与 tokens.wxss 的 --color-primary 一致，marker 是原生绘制，取不到 CSS 变量） */
const PIN_BG_ON = '#2563eb'
const PIN_BG_OFF = '#ffffff'
const PIN_FG_ON = '#ffffff'
const PIN_FG_OFF = '#0f172a'

/** 一个地图图钉。首页与搜索页共用同一套结构，避免两页各写一份又慢慢漂移 */
export interface MapPin {
  id: string
  latitude: number
  longitude: number
  label: string
  /** 用户当前选中的那条。图钉只有这一种高亮，见 pinLabel 的注释 */
  selected: boolean
}

/** 地图 marker 的形状（`map` 组件的 markers 属性） */
export interface MapMarker {
  id: number
  latitude: number
  longitude: number
  width: number
  height: number
  label: {
    content: string
    fontSize: number
    color: string
    bgColor: string
    borderRadius: number
    padding: number
    textAlign: string
  }
}

/**
 * 地图图钉标签。**只有价格与距离**。
 *
 * - **车场名不进图钉**：名字动辄 8~10 字，20 条这样的标签塞进高约 200px 的地图里
 *   必然互相压死（2026-09-13 真机踩到）；名字交给卡片列表
 * - **也没有 `★ 推荐` 前缀了**（同日用户去掉）：搜索完自动选中第一条已经表达了重点，
 *   再给推荐那条加前缀会出现两个蓝块，用户换选别的车场时看着很怪
 */
export function pinLabel(lot: ParkingLot): string {
  // 未签约没有价格：图钉只标距离，别用「¥」糊弄
  if (!lot.signed || !lot.pricing) return formatDistance(lot.distanceM)
  return `¥${lot.pricing.firstHour} · ${formatDistance(lot.distanceM)}`
}

export function pinOf(rec: Recommendation, state: { selected: boolean }): MapPin {
  return {
    id: rec.lot.id,
    latitude: rec.lot.location.lat,
    longitude: rec.lot.location.lng,
    label: pinLabel(rec.lot),
    selected: state.selected,
  }
}

/**
 * 地图上真正画出来的图钉：已排序数组的前 `max` 个，外加「必须在场」的那些。
 *
 * 为什么要补：两页各有「点卡片与点图钉联动」的要求 —— 首页高亮**选中项**、
 * 搜索页还要保住 **★ 推荐**。这两个身份都不随排序跑，切换排序就可能掉出前 max 个，
 * 于是「卡片点了地图上没反应」「★ 不见了」。搜索页的两个 id 都要传进来，
 * 补回来最多 max + 2 个。
 *
 * 入参要求**已排序**（调用方本来就要用同一份排序结果渲染卡片列表），
 * 所以这里不再自己排一次 —— 排两遍难免有一遍忘了改。
 * 不在本批数据里、或重复的 id 会被忽略
 */
export function pickPins(sorted: Recommendation[], mustIncludeIds: string[], max: number): Recommendation[] {
  const shown = sorted.slice(0, Math.max(0, max))
  const picked = new Set(shown.map(r => r.lot.id))
  const missing: Recommendation[] = []
  for (const id of mustIncludeIds) {
    // 重复 id 只补一次，而且以**已补进去的**为准而不是只看前 max 个：
    // 搜索页把「★ 推荐」与「选中项」一起传进来，用户点的正好是推荐那家时两个 id 相同，
    // 只跟 shown 比就会在同一坐标画出两个重叠图钉
    if (!id || picked.has(id)) continue
    const rec = sorted.find(r => r.lot.id === id)
    if (!rec) continue
    picked.add(id)
    missing.push(rec)
  }
  // concat 而非 push：不修改 slice 出来的数组语义上无所谓，但保持与 sortLots 一致的「返回新数组」约定
  return missing.length ? shown.concat(missing) : shown
}

/**
 * 图钉 → 地图 marker。
 *
 * `marker.id` 必须是数字（地图组件的要求），所以用数组下标做 id，
 * 页面再靠下标从 `pins` 反查是哪个车场 —— 两页都依赖这个约定，不能各改各的。
 *
 * **只有选中态会高亮**，且比默认大一档：选中是「我正在看的」，
 * 要一眼看得出来（2026-09-13 真机反馈「选中不明显」）
 */
export function toMarkers(pins: MapPin[]): MapMarker[] {
  return pins.map((p, i) => ({
    id: i,
    latitude: p.latitude,
    longitude: p.longitude,
    width: 1,
    height: 1,
    label: {
      content: p.label,
      fontSize: p.selected ? PIN_FONT_SELECTED : PIN_FONT,
      color: p.selected ? PIN_FG_ON : PIN_FG_OFF,
      bgColor: p.selected ? PIN_BG_ON : PIN_BG_OFF,
      borderRadius: 11,
      padding: p.selected ? PIN_PADDING_SELECTED : PIN_PADDING,
      textAlign: 'center',
    },
  }))
}
