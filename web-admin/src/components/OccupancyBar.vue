<script setup lang="ts">
// 余位灯条：用停车场导视灯语表达余位状态（绿=充裕 / 琥珀=紧张 / 红=满位 / 灰=待上报）。
import { computed } from 'vue'

const props = defineProps<{ free: number | null; total: number | null | undefined }>()

const state = computed<{ label: string; color: string; soft: string; fillPct: number | null }>(() => {
  const { free, total } = props
  if (free === null || free === undefined || typeof total !== 'number') {
    return { label: '待上报', color: '#93a0b5', soft: '#f1f4f8', fillPct: null }
  }
  const ratio = total > 0 ? free / total : 0
  const occupied = total > 0 ? Math.min(100, Math.round(((total - free) / total) * 100)) : 0
  if (free <= 0) return { label: '满位', color: '#e11d48', soft: '#fee9ee', fillPct: occupied }
  if (ratio <= 0.1) return { label: '紧张', color: '#f59e0b', soft: '#fef3e0', fillPct: occupied }
  if (ratio <= 0.3) return { label: '紧张', color: '#f59e0b', soft: '#fef3e0', fillPct: occupied }
  return { label: '空闲', color: '#059669', soft: '#e7f8f0', fillPct: occupied }
})
</script>

<template>
  <div v-if="state.fillPct === null" class="occ">
    <span class="sp-tag sp-tag--outline">
      <span class="sp-tag__dot" style="background: #93a0b5" />待上报
    </span>
  </div>
  <div v-else class="occ">
    <div class="occ__top">
      <span class="num occ__num">{{ free }}<em>/{{ total }}</em></span>
      <span class="sp-tag" :style="{ color: state.color, background: state.soft }">
        <span class="sp-tag__dot" />{{ state.label }}
      </span>
    </div>
    <div class="occ__track">
      <div
        class="occ__fill"
        :style="{ width: state.fillPct + '%', background: state.color }"
      />
    </div>
  </div>
</template>

<style scoped>
.occ {
  min-width: 132px;
}
.occ__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.occ__num {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--sp-text);
}
.occ__num em {
  font-style: normal;
  font-weight: 500;
  color: var(--sp-text-3);
  font-size: 12px;
}
.occ__track {
  height: 6px;
  border-radius: 999px;
  background: #edf1f7;
  overflow: hidden;
}
.occ__fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
