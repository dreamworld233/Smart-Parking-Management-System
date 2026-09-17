<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminStats } from '../api'
import type { StatsData } from '../types'
import PageHeader from '../components/PageHeader.vue'

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
onMounted(load)

/** 千分位格式化（看板大数字用） */
const fmt = (n: number) => n.toLocaleString('zh-CN')

/* —— 顶部 KPI（一行四枚，渐变图标芯片 + 大数字）—— */
interface Kpi {
  key: string
  label: string
  value: string
  note: string
  icon: string
  grad: string
}
const kpis = computed<Kpi[]>(() => {
  const s = stats.value
  if (!s) return []
  return [
    { key: 'signed', label: '签约车场', value: fmt(s.signedLots), note: '签约且可预约', icon: 'OfficeBuilding', grad: 'linear-gradient(135deg, #3b6cff, #6a8eff)' },
    { key: 'total', label: '预约总数', value: fmt(s.totalReservations), note: '累计预约单', icon: 'Tickets', grad: 'linear-gradient(135deg, #7c5cff, #a78bfa)' },
    { key: 'entered', label: '已核销入场', value: fmt(s.entered), note: '已入场核销', icon: 'CircleCheck', grad: 'linear-gradient(135deg, #16a34a, #34d399)' },
    { key: 'fresh', label: '余位及时率', value: `${s.reportFreshRate}%`, note: '近 15 分钟上报占比', icon: 'Monitor', grad: 'linear-gradient(135deg, #0891b2, #22d3ee)' },
  ]
})

/* —— 预约状态分布（部分对整体 → 横向堆叠条 + 图例）—— */
const STATUS_META = [
  { key: 'pending_entry', label: '待入场', color: '#f59e0b' },
  { key: 'entered', label: '已入场', color: '#16a34a' },
  { key: 'completed', label: '已完成', color: '#0d9488' },
  { key: 'cancelled', label: '已取消', color: '#64748b' },
  { key: 'released', label: '已释放', color: '#e5484d' },
] as const

const statusTotal = computed(() => {
  const s = stats.value
  if (!s) return 0
  return s.pending + s.entered + s.completed + s.cancelled + s.released
})

const segments = computed(() => {
  const s = stats.value
  if (!s || statusTotal.value === 0) return []
  const counts: Record<string, number> = {
    pending_entry: s.pending,
    entered: s.entered,
    completed: s.completed,
    cancelled: s.cancelled,
    released: s.released,
  }
  return STATUS_META.map((m) => {
    const count = counts[m.key]
    return { ...m, count, pct: (count / statusTotal.value) * 100 }
  }).filter((x) => x.count > 0)
})
</script>

<template>
  <div v-loading="loading">
    <PageHeader title="运营看板" subtitle="车场 · 预约 · 核销 · 余位 概览">
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
          <span style="margin-left: 4px">刷新</span>
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="stats && stats.reportFreshRate === 0"
      title="车场端（余位上报）尚未接入，余位及时率为 0"
      type="info"
      :closable="false"
      style="margin-bottom: 16px"
    />

    <template v-if="stats">
      <!-- KPI 行 -->
      <div class="kpi-grid">
        <el-card v-for="k in kpis" :key="k.key" shadow="never" class="kpi">
          <div class="kpi__top">
            <div class="kpi__icon" :style="{ background: k.grad }">
              <el-icon :size="22" color="#fff"><component :is="k.icon" /></el-icon>
            </div>
          </div>
          <div class="kpi__label">{{ k.label }}</div>
          <div class="kpi__value">{{ k.value }}</div>
          <div class="kpi__note">{{ k.note }}</div>
        </el-card>
      </div>

      <!-- 分布 + 余位 -->
      <div class="panel-grid">
        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">预约状态分布</span>
            <span class="panel-meta">共 {{ fmt(statusTotal) }} 单</span>
          </template>

          <div v-if="segments.length" class="status-bar" role="img" :aria-label="`预约状态分布：${segments.map(s => `${s.label} ${fmt(s.count)}`).join('，')}`">
            <div
              v-for="s in segments"
              :key="s.key"
              class="status-bar__seg"
              :style="{ width: s.pct + '%', background: s.color }"
            />
          </div>
          <el-empty v-else description="暂无预约数据" :image-size="72" />

          <ul v-if="segments.length" class="legend">
            <li v-for="s in segments" :key="s.key">
              <span class="legend__dot" :style="{ background: s.color }" />
              <span class="legend__label">{{ s.label }}</span>
              <span class="legend__count">{{ fmt(s.count) }}</span>
              <span class="legend__pct">{{ Math.round(s.pct) }}%</span>
            </li>
          </ul>
        </el-card>

        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">余位上报</span>
          </template>

          <div class="fresh">
            <div class="fresh__value">{{ stats.reportFreshRate }}<span class="fresh__unit">%</span></div>
            <div class="fresh__label">及时率</div>
            <div class="meter" role="img" :aria-label="`余位及时率 ${stats.reportFreshRate}%`">
              <div class="meter__track">
                <div class="meter__fill" :style="{ width: Math.min(stats.reportFreshRate, 100) + '%' }" />
              </div>
            </div>
            <div class="fresh__sub">及时上报 {{ stats.reportFreshLots }} / {{ stats.signedLots }} 家车场</div>
            <p class="fresh__note">「及时」= 最近 15 分钟内有余位上报。车场端上报由小程序侧完成。</p>
          </div>
        </el-card>
      </div>
    </template>

    <el-skeleton v-else :rows="4" animated style="padding: 8px 0" />
  </div>
</template>

<style scoped>
/* KPI 行：渐变图标芯片 + 大数字 + 悬停轻抬 */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}
.kpi {
  border-radius: var(--sp-radius-lg);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.kpi :deep(.el-card__body) {
  padding: 20px;
}
.kpi:hover {
  transform: translateY(-3px);
  box-shadow: var(--sp-shadow-md);
}
.kpi__top {
  margin-bottom: 16px;
}
.kpi__icon {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.14);
}
.kpi__label {
  font-size: 13px;
  color: var(--sp-text-2);
}
.kpi__value {
  margin-top: 3px;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sp-text);
  line-height: 1.1;
}
.kpi__note {
  margin-top: 6px;
  font-size: 12px;
  color: var(--sp-text-3);
}

/* 双栏面板 */
.panel-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 16px;
}
.panel-title {
  font-weight: 600;
  color: var(--sp-text);
}
.panel-meta {
  float: right;
  font-size: 12px;
  color: var(--sp-text-3);
  font-weight: 400;
}

/* 堆叠条：2px 表面间隙分隔，整体圆角 */
.status-bar {
  display: flex;
  gap: 2px;
  height: 14px;
  border-radius: 999px;
  background: var(--sp-border);
  overflow: hidden;
}
.status-bar__seg {
  height: 100%;
  min-width: 4px;
}
.status-bar__seg:first-child {
  border-radius: 999px 0 0 999px;
}
.status-bar__seg:last-child {
  border-radius: 0 999px 999px 0;
}

/* 图例：色点 + 标签 + 数量 + 占比 */
.legend {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px 20px;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.legend__dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
}
.legend__label {
  color: var(--sp-text-2);
}
.legend__count {
  color: var(--sp-text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.legend__pct {
  margin-left: auto;
  color: var(--sp-text-3);
  font-variant-numeric: tabular-nums;
}

/* 余位及时率：量规（浅轨道 + 渐变填充） */
.fresh {
  text-align: center;
  padding: 4px 0 2px;
}
.fresh__value {
  font-size: 46px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sp-text);
  line-height: 1;
}
.fresh__unit {
  font-size: 22px;
  font-weight: 600;
  color: var(--sp-text-2);
  margin-left: 2px;
}
.fresh__label {
  margin-top: 8px;
  font-size: 13px;
  color: var(--sp-text-2);
}
.meter {
  margin: 22px 8px 0;
}
.meter__track {
  height: 10px;
  border-radius: 999px;
  background: var(--el-color-primary-light-8);
  overflow: hidden;
}
.meter__fill {
  height: 100%;
  border-radius: 999px;
  background: var(--grad-brand);
  transition: width 0.4s ease;
}
.fresh__sub {
  margin-top: 16px;
  font-size: 13px;
  color: var(--sp-text);
}
.fresh__note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--sp-text-3);
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .panel-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 560px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
