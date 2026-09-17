<script setup lang="ts">
// 数据来源徽标（课程红线：placeholder 必须明确标「示例数据，待核实」，不得显示成已核实）。
import { computed } from 'vue'
import type { LotSource } from '../types'

const props = defineProps<{ source: LotSource | undefined }>()

const meta = computed(() => {
  switch (props.source) {
    case 'public':
      return { cls: 'sp-tag--success', label: '已核实', title: '公示价（已核实）：来自现场公示价牌等可核实渠道', icon: 'CircleCheckFilled' }
    case 'ops':
      return { cls: 'sp-tag--primary', label: '运营声明', title: '运营声明：车场运营方提供，尚未现场复核', icon: 'InfoFilled' }
    default:
      return { cls: 'sp-tag--warning', label: '示例·待核实', title: '示例数据，待核实：演示暂定值，不得当作真实公示价', icon: 'WarningFilled' }
  }
})
</script>

<template>
  <span class="sp-tag" :class="meta.cls" :title="meta.title">
    <el-icon :size="12"><component :is="meta.icon" /></el-icon>
    {{ meta.label }}
  </span>
</template>
