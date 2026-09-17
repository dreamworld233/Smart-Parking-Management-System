<script setup lang="ts">
// 品牌标识：黑底圆角导视牌 + 橙色 P + 白色灯条（与 favicon 同一视觉）。
withDefaults(defineProps<{ size?: number }>(), { size: 40 })
</script>

<template>
  <span class="logo-mark" :style="{ width: size + 'px', height: size + 'px' }" aria-hidden="true">
    <svg viewBox="0 0 64 64" :width="size" :height="size">
      <rect x="1" y="1" width="62" height="62" rx="16" fill="#000000" />
      <rect
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="15.5"
        fill="none"
        stroke="#ffffff"
        stroke-opacity="0.18"
        stroke-width="1.5"
      />
      <text
        x="30"
        y="45"
        text-anchor="middle"
        font-family="Bahnschrift, 'Segoe UI', Arial, sans-serif"
        font-size="36"
        font-weight="700"
        fill="orange"
        letter-spacing="-1"
      >P</text>
      <rect x="22" y="50" width="20" height="3.4" rx="1.7" fill="#ffffff" />
    </svg>
  </span>
</template>

<style scoped>
.logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  flex-shrink: 0;
  filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.25));
}
.logo-mark svg {
  display: block;
}
</style>
