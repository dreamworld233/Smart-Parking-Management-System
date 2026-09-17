<script setup lang="ts">
// 统一空状态：AI 生成的空车位插画 + 文案 + 可选操作插槽。
import emptyBay from '../assets/img/empty-bay.png'

withDefaults(defineProps<{ title?: string; description?: string; imageSize?: number }>(), {
  title: '暂无数据',
  description: '',
  imageSize: 168,
})
</script>

<template>
  <div class="empty-art">
    <img :src="emptyBay" :width="imageSize" :height="imageSize" alt="" class="empty-art__img" />
    <div class="empty-art__title">{{ title }}</div>
    <p v-if="description" class="empty-art__desc">{{ description }}</p>
    <div v-if="$slots.default" class="empty-art__action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-art {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 36px 16px 40px;
}
.empty-art__img {
  object-fit: contain;
  animation: sp-fade-up 0.5s ease both;
}
.empty-art__title {
  margin-top: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sp-text);
}
.empty-art__desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--sp-text-3);
  max-width: 360px;
}
.empty-art__action {
  margin-top: 16px;
}
</style>
