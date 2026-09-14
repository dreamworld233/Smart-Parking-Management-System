import type { LotDetailVM } from '../../domain/detail'

function readVM(ctx: { data: { vm?: unknown } }): LotDetailVM | null {
  // properties 里声明成 Object 时 data.vm 被推成 never（value: null 推不出元素类型），
  // 在这里收窄一次，避免每处 this.data.vm.lot 都报 TS2339（与 lot-card 的 readItem 同一处妥协）
  return (ctx.data.vm as unknown as LotDetailVM | null) || null
}

Component({
  properties: {
    /** 由页面用 `toDetailVM(rec)` 算好；组件不格式化、不读时钟 */
    vm: { type: Object, value: null },
  },

  methods: {
    onBack() {
      this.triggerEvent('back')
    },
    onNavigate() {
      const vm = readVM(this)
      if (vm) this.triggerEvent('navigate', { id: vm.lot.id })
    },
    onReserve() {
      const vm = readVM(this)
      if (vm) this.triggerEvent('reserve', { id: vm.lot.id })
    },
  },
})
