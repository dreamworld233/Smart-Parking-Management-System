<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminStats } from '../api'
import type { StatsData } from '../types'

const stats = ref<StatsData | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await adminStats()
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    stats.value = res.data
  } finally {
    loading.value = false
  }
}

interface StatCard {
  key: string
  label: string
  value: string
  tip: string
  icon: string
  color: string
  bg: string
}

const cards = computed<StatCard[]>(() => {
  const s = stats.value
  if (!s) return []
  return [
    { key: 'signed', label: '签约车场', value: String(s.signedLots), tip: '签约且可预约', icon: 'OfficeBuilding', color: '#2f6bff', bg: '#eef4ff' },
    { key: 'total', label: '预约总数', value: String(s.totalReservations), tip: '全部预约单', icon: 'Tickets', color: '#7c3aed', bg: '#f5f0ff' },
    { key: 'entered', label: '已核销入场', value: String(s.entered), tip: 'entered', icon: 'CircleCheck', color: '#16a34a', bg: '#ecfdf5' },
    { key: 'pending', label: '待入场', value: String(s.pending), tip: 'pending_entry', icon: 'Clock', color: '#f59e0b', bg: '#fff7ed' },
    { key: 'completed', label: '已完成', value: String(s.completed), tip: 'completed', icon: 'TrendCharts', color: '#0d9488', bg: '#ecfeff' },
    { key: 'cancelled', label: '已取消', value: String(s.cancelled), tip: '用户取消', icon: 'CloseBold', color: '#64748b', bg: '#f1f5f9' },
    { key: 'released', label: '已释放', value: String(s.released), tip: '超时未入场', icon: 'WarningFilled', color: '#dc2626', bg: '#fef2f2' },
    { key: 'fresh', label: '余位及时率', value: s.reportFreshRate + '%', tip: '最近 15 分钟有上报的车场占比', icon: 'Monitor', color: '#0891b2', bg: '#ecfeff' },
  ]
})

onMounted(load)
</script>

<template>
  <div v-loading="loading">
    <div class="dash-head">
      <div>
        <h2>运营看板</h2>
        <p class="sub">车场 · 预约 · 核销 · 余位 概览</p>
      </div>
      <el-button @click="load">
        <el-icon><Refresh /></el-icon>
        <span style="margin-left: 4px">刷新</span>
      </el-button>
    </div>

    <el-alert
      v-if="stats && stats.reportFreshRate === 0"
      title="车场端（余位上报）尚未接入，余位及时率为 0"
      type="info"
      :closable="false"
      style="margin-bottom: 16px"
    />

    <el-row :gutter="16">
      <el-col v-for="c in cards" :key="c.key" :span="6" style="margin-bottom: 16px">
        <el-card shadow="hover" class="stat-card">
          <div class="stat">
            <div class="icon" :style="{ color: c.color, background: c.bg }">
              <el-icon :size="22"><component :is="c.icon" /></el-icon>
            </div>
            <div class="meta">
              <div class="value">{{ c.value }}</div>
              <div class="label">{{ c.label }}</div>
            </div>
          </div>
          <div class="tip">{{ c.tip }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.dash-head h2 {
  margin: 0;
  font-size: 20px;
  color: var(--sp-text);
}
.dash-head .sub {
  margin: 4px 0 0;
  color: var(--sp-text-3);
  font-size: 13px;
}
.stat-card :deep(.el-card__body) {
  padding: 18px 20px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 14px;
}
.icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.value {
  font-size: 26px;
  font-weight: 700;
  color: var(--sp-text);
  line-height: 1.1;
}
.label {
  margin-top: 2px;
  font-size: 13px;
  color: var(--sp-text-2);
}
.tip {
  margin-top: 14px;
  font-size: 12px;
  color: var(--sp-text-3);
}
</style>
