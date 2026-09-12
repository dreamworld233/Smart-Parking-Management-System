import type { ParkingLot, ReasonTone } from '../../domain/types'
import type { AvailabilityLevel } from '../../domain/scoring'

/**
 * 卡片的展示字段，由页面预先算好（Task 6 的格式化函数）。
 * 组件不做格式化、不读时钟，只渲染 —— 这样才能被任意排序/筛选后的列表复用
 */
export interface LotCardItem {
  lot: ParkingLot
  /** `formatDistance(lot.distanceM)` */
  distanceText: string
  /** 形如 `12 分钟` */
  walkText: string
  /** `formatSpots(free, total)` */
  spotsText: string
  /** 余位配色档位，由 `availabilityLevel(freeRate)` 产出 */
  freeClass: AvailabilityLevel
  /** 综合得分，0–100 */
  score: number
  reasons: string[]
  tone: ReasonTone
  /** 数据来源标注，如「车位数与收费为估算」；空串则不渲染该标签 */
  estimateText: string
}

function readItem(ctx: { data: { item?: unknown } }): LotCardItem | null {
  // properties 里声明成 Object 时 data.item 被推成 never（value: null 推不出元素类型），
  // 只能在这里收窄一次，避免每处 `this.data.item.lot` 都报 TS2339
  return (ctx.data.item as unknown as LotCardItem | null) || null
}

Component({
  properties: {
    item: { type: Object, value: null },
    selected: { type: Boolean, value: false },
    /** 是否显示底部的「导航前往 / 预约车位」双动作（搜索页用） */
    showActions: { type: Boolean, value: false },
  },

  methods: {
    onCardTap() {
      const item = readItem(this)
      if (item) this.triggerEvent('cardtap', { id: item.lot.id })
    },
    onNavigate() {
      const item = readItem(this)
      if (item) this.triggerEvent('navigate', { id: item.lot.id })
    },
    onReserve() {
      const item = readItem(this)
      if (item) this.triggerEvent('reserve', { id: item.lot.id })
    },
  },
})
