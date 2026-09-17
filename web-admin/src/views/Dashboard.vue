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
    tweenTo(res.data)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const fmt = (n: number) => Math.round(n).toLocaleString('zh-CN')

/* —— 数字滚动（exponential ease-out，900ms）—— */
const anim = ref({ signed: 0, total: 0, entered: 0, rate: 0 })
let raf = 0
function tweenTo(s: StatsData) {
  cancelAnimationFrame(raf)
  const from = { ...anim.value }
  const to = { signed: s.signedLots, total: s.totalReservations, entered: s.entered, rate: s.reportFreshRate }
  const start = performance.now()
  const dur = 900
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    anim.value = to
    return
  }
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / dur)
    const e = 1 - Math.pow(2, -10 * t)
    anim.value = {
      signed: from.signed + (to.signed - from.signed) * e,
      total: from.total + (to.total - from.total) * e,
      entered: from.entered + (to.entered - from.entered) * e,
      rate: from.rate + (to.rate - from.rate) * e,
    }
    if (t < 1) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

/* —— KPI —— */
interface Kpi {
  key: string
  label: string
  value: string
  note: string
  icon: string
  color: string
  soft: string
}
const kpis = computed<Kpi[]>(() => {
  const a = anim.value
  return [
    { key: 'signed', label: '签约车场', value: fmt(a.signed), note: '签约且可预约', icon: 'OfficeBuilding', color: '#2563ff', soft: '#edf3ff' },
    { key: 'total', label: '预约总数', value: fmt(a.total), note: '累计预约单（全状态）', icon: 'Tickets', color: '#0891b2', soft: '#e5f8fc' },
    { key: 'entered', label: '已核销入场', value: fmt(a.entered), note: 'OCR / 输码 / 手动', icon: 'CircleCheck', color: '#059669', soft: '#e6f7f0' },
    { key: 'fresh', label: '余位及时率', value: `${Math.round(a.rate)}%`, note: '近 15 分钟上报占比', icon: 'Monitor', color: '#0d9488', soft: '#e6f6f4' },
  ]
})

/* —— 预约状态环形图 —— */
const STATUS_META = [
  { key: 'pending_entry', label: '待入场', color: '#f59e0b' },
  { key: 'entered', label: '已入场', color: '#0ea5e9' },
  { key: 'completed', label: '已完成', color: '#0d9488' },
  { key: 'cancelled', label: '已取消', color: '#94a3b8' },
  { key: 'released', label: '已释放', color: '#f43f5e' },
] as const

const statusTotal = computed(() => {
  const s = stats.value
  if (!s) return 0
  return s.pending + s.entered + s.completed + s.cancelled + s.released
})

const donutSegments = computed(() => {
  const s = stats.value
  if (!s || statusTotal.value === 0) return []
  const counts: Record<string, number> = {
    pending_entry: s.pending,
    entered: s.entered,
    completed: s.completed,
    cancelled: s.cancelled,
    released: s.released,
  }
  const R = 74
  const C = 2 * Math.PI * R
  let acc = 0
  return STATUS_META.map((m) => {
    const count = counts[m.key]
    const frac = count / statusTotal.value
    const seg = {
      ...m,
      count,
      pct: frac * 100,
      dash: `${Math.max(frac * C - 2.5, 0)} ${C}`,
      offset: -acc * C,
    }
    acc += frac
    return seg
  }).filter((x) => x.count > 0)
})

/* —— 余位及时率半圆仪表 —— */
const gauge = computed(() => {
  const rate = stats.value?.reportFreshRate ?? 0
  const R = 80
  const arcLen = Math.PI * R // 半周长
  const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#0ea5e9' : rate > 0 ? '#f59e0b' : '#cbd5e1'
  return {
    color,
    dash: `${(Math.min(rate, 100) / 100) * arcLen} ${arcLen}`,
    lots: stats.value?.reportFreshLots ?? 0,
    signed: stats.value?.signedLots ?? 0,
  }
})

/* —— 状态流转漏斗（同一时点各状态单量，非队列转化）—— */
const funnel = computed(() => {
  const s = stats.value
  if (!s) return { stages: [], side: [] }
  const stages = [
    { label: '待入场', count: s.pending, color: '#f59e0b' },
    { label: '已入场', count: s.entered, color: '#0ea5e9' },
    { label: '已完成', count: s.completed, color: '#0d9488' },
  ]
  const max = Math.max(...stages.map((x) => x.count), 1)
  const denom = s.pending + s.entered + s.completed + s.cancelled + s.released
  const withRatio = stages.map((x) => {
    const share = denom === 0 ? 0 : Math.round((x.count / denom) * 100)
    return { ...x, width: Math.max((x.count / max) * 100, x.count > 0 ? 10 : 0), share }
  })
  return {
    stages: withRatio,
    side: [
      { label: '已取消', count: s.cancelled, color: '#94a3b8' },
      { label: '已释放', count: s.released, color: '#f43f5e' },
    ],
  }
})
</script>

<template>
  <div v-loading="loading" class="dash">
    <PageHeader title="运营看板" subtitle="车场 · 预约 · 核销 · 余位 概览">
      <template #actions>
        <el-button @click="load">
          <el-icon><Refresh /></el-icon>
          <span style="margin-left: 4px">刷新数据</span>
        </el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="stats && stats.reportFreshRate === 0"
      title="车场端（余位上报）尚未接入，余位及时率为 0"
      type="info"
      :closable="false"
      class="dash-alert"
    />

    <template v-if="stats">
      <!-- KPI -->
      <div class="kpi-grid">
        <div v-for="k in kpis" :key="k.key" class="kpi">
          <div class="kpi__main">
            <span class="kpi__icon" :style="{ background: k.soft, color: k.color }">
              <el-icon :size="21"><component :is="k.icon" /></el-icon>
            </span>
            <div>
              <div class="kpi__label">{{ k.label }}</div>
              <div class="kpi__value num">{{ k.value }}</div>
            </div>
          </div>
          <div class="kpi__note">{{ k.note }}</div>
          <el-icon class="kpi__watermark" :style="{ color: k.color }"><component :is="k.icon" /></el-icon>
        </div>
      </div>

      <div class="panel-grid">
        <!-- 状态环形图 -->
        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">预约状态分布</span>
            <span class="panel-meta">共 <b class="num">{{ fmt(statusTotal) }}</b> 单</span>
          </template>

          <div v-if="donutSegments.length" class="donut-wrap">
            <div class="donut">
              <svg viewBox="0 0 180 180" class="donut__svg">
                <circle cx="90" cy="90" r="74" fill="none" stroke="#eef2f8" stroke-width="17" />
                <circle
                  v-for="(s, i) in donutSegments"
                  :key="s.key"
                  cx="90"
                  cy="90"
                  r="74"
                  fill="none"
                  :stroke="s.color"
                  stroke-width="17"
                  :stroke-dasharray="s.dash"
                  :stroke-dashoffset="s.offset"
                  stroke-linecap="butt"
                  transform="rotate(-90 90 90)"
                  :style="{ transition: `stroke-dasharray .8s cubic-bezier(.22,1,.36,1) ${i * 0.08}s` }"
                />
              </svg>
              <div class="donut__center">
                <div class="num donut__total">{{ fmt(statusTotal) }}</div>
                <div class="donut__total-label">预约单</div>
              </div>
            </div>
            <ul class="legend">
              <li v-for="s in donutSegments" :key="s.key">
                <span class="legend__dot" :style="{ background: s.color }" />
                <span class="legend__label">{{ s.label }}</span>
                <span class="num legend__count">{{ fmt(s.count) }}</span>
                <span class="num legend__pct">{{ Math.round(s.pct) }}%</span>
              </li>
            </ul>
          </div>
          <el-empty v-else description="暂无预约数据" :image-size="80" />
        </el-card>

        <!-- 余位仪表 -->
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">余位上报及时率</span></template>
          <div class="gauge">
            <svg viewBox="0 0 200 118" class="gauge__svg">
              <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#edf1f7" stroke-width="14" stroke-linecap="round" />
              <path
                d="M20 100 A80 80 0 0 1 180 100"
                fill="none"
                :stroke="gauge.color"
                stroke-width="14"
                stroke-linecap="round"
                :stroke-dasharray="gauge.dash"
                style="transition: stroke-dasharray .9s cubic-bezier(.22,1,.36,1)"
              />
            </svg>
            <div class="gauge__readout">
              <span class="num gauge__value">{{ Math.round(anim.rate) }}</span><span class="gauge__unit">%</span>
            </div>
            <div class="gauge__sub">
              及时上报 <b class="num">{{ gauge.lots }}</b> / <span class="num">{{ gauge.signed }}</span> 家车场
            </div>
            <p class="gauge__note">「及时」= 最近 15 分钟内有余位上报；上报由车场端小程序完成。</p>
          </div>
        </el-card>
      </div>

      <div class="panel-grid panel-grid--second">
        <!-- 状态流转 -->
        <el-card shadow="never" class="panel">
          <template #header>
            <span class="panel-title">预约流转（当前各环节单量）</span>
            <span class="panel-meta">同一时点快照，非队列转化率</span>
          </template>
          <div class="funnel">
            <div v-for="s in funnel.stages" :key="s.label" class="funnel__row">
              <div class="funnel__bar-wrap">
                <div class="funnel__bar" :style="{ width: s.width + '%', background: `linear-gradient(90deg, ${s.color}, ${s.color}cc)` }">
                  <span class="funnel__label">{{ s.label }}</span>
                </div>
              </div>
              <span class="num funnel__count">{{ fmt(s.count) }}</span>
              <span class="funnel__ratio">占比 {{ s.share }}%</span>
            </div>
          </div>
          <div class="funnel__side">
            <span v-for="x in funnel.side" :key="x.label" class="sp-tag" :style="{ color: x.color, background: x.color + '1a' }">
              <span class="sp-tag__dot" />{{ x.label }} {{ fmt(x.count) }}
            </span>
          </div>
        </el-card>

        <!-- 口径说明 -->
        <el-card shadow="never" class="panel">
          <template #header><span class="panel-title">统计口径</span></template>
          <ul class="notes">
            <li>
              <el-icon class="notes__icon" style="color: #2563ff"><DataAnalysis /></el-icon>
              <span>数据由 <b>adminStats</b> 云函数实时聚合，点击「刷新数据」重新拉取。</span>
            </li>
            <li>
              <el-icon class="notes__icon" style="color: #0d9488"><Timer /></el-icon>
              <span>余位及时率 = 近 15 分钟内上报余位的签约车场 ÷ 全部签约车场。</span>
            </li>
            <li>
              <el-icon class="notes__icon" style="color: #f59e0b"><WarningFilled /></el-icon>
              <span>预约总数含待入场、已入场、已完成、已取消、已释放全部状态。</span>
            </li>
            <li>
              <el-icon class="notes__icon" style="color: #94a3b8"><Monitor /></el-icon>
              <span>余位由车场端小程序上报，Web 后台只做监控，不直接改写。</span>
            </li>
          </ul>
        </el-card>
      </div>
    </template>

    <el-skeleton v-else :rows="6" animated style="padding: 8px 0" />
  </div>
</template>

<style scoped>
.dash-alert {
  margin-bottom: 16px;
}

/* —— KPI —— */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-bottom: 14px;
}
.kpi {
  position: relative;
  overflow: hidden;
  border-radius: var(--sp-radius-lg);
  background: var(--sp-surface);
  border: 1px solid var(--sp-border);
  box-shadow: var(--sp-shadow-sm);
  padding: 17px 18px 15px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.kpi:hover {
  transform: translateY(-3px);
  box-shadow: var(--sp-shadow-md);
  border-color: var(--sp-border-strong);
}
.kpi__main {
  display: flex;
  align-items: center;
  gap: 12px;
}
.kpi__icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.kpi__label {
  font-size: 12.5px;
  color: var(--sp-text-2);
}
.kpi__value {
  margin-top: 2px;
  font-size: 27px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--sp-text);
  letter-spacing: -0.01em;
}
.kpi__note {
  margin-top: 11px;
  font-size: 11.5px;
  color: var(--sp-text-3);
  padding-left: 54px;
}
.kpi__watermark {
  position: absolute;
  right: 12px;
  bottom: 8px;
  font-size: 62px;
  opacity: 0.07;
}

/* —— 双栏面板 —— */
.panel-grid {
  display: grid;
  grid-template-columns: 1.65fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}
.panel-grid--second {
  margin-bottom: 0;
}
.panel-title {
  font-weight: 700;
  color: var(--sp-text);
  font-size: 15px;
}
.panel-meta {
  float: right;
  font-size: 12.5px;
  color: var(--sp-text-3);
  font-weight: 400;
}
.panel-meta b {
  color: var(--sp-text);
  font-weight: 700;
}

/* —— 环形图 —— */
.donut-wrap {
  display: flex;
  align-items: center;
  gap: 26px;
  padding: 8px 6px;
}
.donut {
  position: relative;
  width: 190px;
  height: 190px;
  flex-shrink: 0;
  animation: sp-pop 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.donut__svg {
  width: 100%;
  height: 100%;
}
.donut__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.donut__total {
  font-size: 30px;
  font-weight: 700;
  color: var(--sp-text);
  line-height: 1;
}
.donut__total-label {
  font-size: 12px;
  color: var(--sp-text-3);
  margin-top: 5px;
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px 22px;
}
.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.legend__dot {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}
.legend__label {
  color: var(--sp-text-2);
}
.legend__count {
  color: var(--sp-text);
  font-weight: 700;
  margin-left: auto;
}
.legend__pct {
  color: var(--sp-text-3);
  width: 38px;
  text-align: right;
}

/* —— 仪表 —— */
.gauge {
  text-align: center;
  padding: 6px 8px 2px;
}
.gauge__svg {
  width: 220px;
  max-width: 100%;
}
.gauge__readout {
  margin-top: -34px;
}
.gauge__value {
  font-size: 46px;
  font-weight: 700;
  color: var(--sp-text);
  letter-spacing: -0.02em;
}
.gauge__unit {
  font-size: 20px;
  font-weight: 600;
  color: var(--sp-text-2);
  margin-left: 2px;
}
.gauge__sub {
  margin-top: 10px;
  font-size: 13.5px;
  color: var(--sp-text);
}
.gauge__note {
  margin: 10px auto 0;
  max-width: 300px;
  font-size: 12px;
  color: var(--sp-text-3);
  line-height: 1.7;
}

/* —— 漏斗 —— */
.funnel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 4px 6px;
}
.funnel__row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.funnel__bar-wrap {
  flex: 1;
}
.funnel__bar {
  height: 38px;
  min-width: 96px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  padding: 0 13px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transform-origin: left center;
  animation: sp-grow-x 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
  box-shadow: 0 4px 12px rgba(15, 27, 51, 0.1);
}
.funnel__row:nth-child(2) .funnel__bar { animation-delay: 0.1s; }
.funnel__row:nth-child(3) .funnel__bar { animation-delay: 0.2s; }
.funnel__count {
  width: 64px;
  text-align: right;
  font-size: 17px;
  font-weight: 700;
  color: var(--sp-text);
}
.funnel__ratio {
  width: 78px;
  font-size: 11.5px;
  color: var(--sp-text-3);
}
.funnel__side {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--sp-border-strong);
}

/* —— 口径说明 —— */
.notes {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.notes li {
  display: flex;
  gap: 10px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--sp-text-2);
}
.notes__icon {
  margin-top: 3px;
  flex-shrink: 0;
  font-size: 16px;
}

@media (max-width: 1180px) {
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
  .donut-wrap {
    flex-direction: column;
  }
  .legend {
    width: 100%;
  }
}
</style>
