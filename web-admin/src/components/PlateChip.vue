<script setup lang="ts">
// 车牌芯片：蓝牌样式展示车牌（皖A·12345）。formatPlate 与全站口径一致。
import { computed } from 'vue'
import { formatPlate } from '../utils/format'

const props = withDefaults(defineProps<{ plate: string; size?: 'sm' | 'md' }>(), { size: 'md' })
const text = computed(() => formatPlate(props.plate || ''))
</script>

<template>
  <span class="plate" :class="{ 'plate--sm': size === 'sm' }">{{ text }}</span>
</template>
