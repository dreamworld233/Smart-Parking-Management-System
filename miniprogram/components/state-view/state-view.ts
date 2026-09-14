/** 加载中给骨架屏，其余三种给「文案 + 提示 + 可选动作」 */
export type StateKind = 'loading' | 'empty' | 'error'

Component({
  properties: {
    kind: { type: String, value: 'empty' },
    text: { type: String, value: '' },
    hint: { type: String, value: '' },
    /** 为空则不渲染动作按钮 */
    actionText: { type: String, value: '' },
  },

  data: {
    // 骨架屏的条数写死在 data 里：WXML 里写 `wx:for="{{[1,2,3]}}"` 也能跑，
    // 但每次 setData 都会重新求值一个数组字面量，不值得
    skeletonRows: [1, 2, 3],
  },

  methods: {
    onAction() {
      this.triggerEvent('action')
    },
  },
})
