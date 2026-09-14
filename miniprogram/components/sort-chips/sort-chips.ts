import { SORT_LABELS } from '../../domain/format'
import type { SortKey } from '../../domain/types'

interface SortOption {
  key: SortKey
  short: string
  long: string
}

/**
 * 两套文案：首页空间窄用短标签，搜索页用长标签（见 UI 稿 §5.1 / §5.2）。
 * 由 `variant` 在 WXML 里选，不做 observer 回写 data —— 少一次 setData，
 * 也不会出现「属性变了但 options 还是旧的」这种中间态。
 *
 * 文案本身取自 `SORT_LABELS`：首页的「已按 X 排序」提示要用同一份，
 * 组件里再抄一遍就是两处各自演化
 */
const OPTIONS: SortOption[] = (Object.keys(SORT_LABELS) as SortKey[]).map(key => ({
  key,
  short: SORT_LABELS[key].short,
  long: SORT_LABELS[key].long,
}))

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
