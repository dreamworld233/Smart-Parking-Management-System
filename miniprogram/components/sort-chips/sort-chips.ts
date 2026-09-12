import type { SortKey } from '../../domain/types'

interface SortOption {
  key: SortKey
  short: string
  long: string
}

/**
 * 两套文案：首页空间窄用短标签，搜索页用长标签（见 UI 稿 §5.1 / §5.2）。
 * 由 `variant` 在 WXML 里选，不做 observer 回写 data —— 少一次 setData，
 * 也不会出现「属性变了但 options 还是旧的」这种中间态
 */
const OPTIONS: SortOption[] = [
  { key: 'composite', short: '综合', long: '综合推荐' },
  { key: 'distance', short: '距离', long: '距离最近' },
  { key: 'fee', short: '价格', long: '费用最低' },
  { key: 'availability', short: '空位', long: '空位最多' },
]

Component({
  properties: {
    value: { type: String, value: 'composite' },
    /** `short` = 首页，`long` = 搜索页 */
    variant: { type: String, value: 'short' },
  },

  data: {
    options: OPTIONS,
  },

  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const key = e.currentTarget.dataset.key as SortKey
      this.triggerEvent('change', { key })
    },
  },
})
