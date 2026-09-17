<script setup lang="ts">
// 统一的页头：标题 + 副标题 + 右侧操作区（各页面共用，保证「同一套词汇」）。
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="page-head">
    <div class="page-head__text">
      <h1>{{ title }}</h1>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <div class="page-head__actions">
      <slot name="actions" />
    </div>
  </div>
</template>
