<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminLookup } from '../api'
import { STATUS_LABELS, ORDER_TYPE_LABELS, formatAmount, formatTime } from '../utils/format'
import type { Reservation, ReservationStatus } from '../types'
import PageHeader from '../components/PageHeader.vue'
import PlateChip from '../components/PlateChip.vue'
import EmptyArt from '../components/EmptyArt.vue'

const query = reactive({ plateNo: '', orderNo: '', status: '' })
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const list = ref<Reservation[]>([])
const loading = ref(false)

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending_entry', label: '待入场' },
  { value: 'entered', label: '已入场' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
  { value: 'released', label: '已释放' },
]

/** 状态 → 软底药丸样式 */
const STATUS_PILL: Record<ReservationStatus, string> = {
  pending_entry: 'sp-tag--warning',
  entered: 'sp-tag--primary',
  completed: 'sp-tag--teal',
  cancelled: 'sp-tag--info',
  released: 'sp-tag--danger',
}

async function load() {
  loading.value = true
  try {
    const res = await adminLookup({
      plateNo: query.plateNo,
      orderNo: query.orderNo,
      status: query.status,
      page: page.value,
      pageSize: pageSize.value,
    })
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    list.value = res.data.list
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}
onMounted(load)

function search() {
  page.value = 1
  load()
}

function reset() {
  query.plateNo = ''
  query.orderNo = ''
  query.status = ''
  search()
}

// 明细弹窗
const detailVisible = ref(false)
const detail = ref<Reservation | null>(null)
function openDetail(row: Reservation) {
  detail.value = row
  detailVisible.value = true
}

function orderAmount(row: Reservation, type: string): string {
  const orders = row.orders || []
  const sum = orders.filter((o) => o.type === type).reduce((acc, o) => acc + o.amount, 0)
  return orders.some((o) => o.type === type) ? formatAmount(sum) : '--'
}

/** 流水时间线图标 / 配色 */
const FLOW_META: Record<string, { icon: string; color: string }> = {
  prepaid: { icon: 'Wallet', color: '#2563ff' },
  service: { icon: 'Coin', color: '#0891b2' },
  refund: { icon: 'RefreshLeft', color: '#059669' },
}
</script>

<template>
  <div>
    <PageHeader title="订单流水" subtitle="按车牌 / 订单号 / 状态查询预约单与流水" />

    <el-card shadow="never">
      <div class="toolbar">
        <el-input v-model="query.plateNo" placeholder="车牌号，如 皖A12345" clearable style="width: 210px" @keyup.enter="search">
          <template #prefix><el-icon><Van /></el-icon></template>
        </el-input>
        <el-input v-model="query.orderNo" placeholder="订单号" clearable style="width: 210px" @keyup.enter="search">
          <template #prefix><el-icon><Tickets /></el-icon></template>
        </el-input>
        <el-select v-model="query.status" placeholder="全部状态" style="width: 148px">
          <el-option v-for="o in statusOptions" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
        <el-button type="primary" @click="search">
          <el-icon><Search /></el-icon><span style="margin-left: 4px">查询</span>
        </el-button>
        <el-button @click="reset">
          重置
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list">
        <template #empty>
          <EmptyArt title="没有匹配的预约单" description="试试放宽车牌、订单号或状态筛选条件" />
        </template>
        <el-table-column prop="orderNo" label="订单号" width="182">
          <template #default="{ row }"><span class="num order-no">{{ row.orderNo }}</span></template>
        </el-table-column>
        <el-table-column label="车牌" width="120">
          <template #default="{ row }"><PlateChip :plate="row.plateNo" size="sm" /></template>
        </el-table-column>
        <el-table-column label="车场" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="lot-name"><el-icon><OfficeBuilding /></el-icon>{{ row.lotName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="到达时间" width="150">
          <template #default="{ row }">
            <span class="num time">{{ formatTime(row.arriveTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="92">
          <template #default="{ row }">
            <span class="sp-tag" :class="STATUS_PILL[row.status as ReservationStatus]">
              <span class="sp-tag__dot" />{{ STATUS_LABELS[row.status as ReservationStatus] }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="预支停车费" width="96" align="right">
          <template #default="{ row }">
            <span v-if="orderAmount(row, 'prepaid') !== '--'" class="num amount">¥{{ orderAmount(row, 'prepaid') }}</span>
            <span v-else class="amount-empty">--</span>
          </template>
        </el-table-column>
        <el-table-column label="服务费" width="80" align="right">
          <template #default="{ row }">
            <span v-if="orderAmount(row, 'service') !== '--'" class="num amount amount--sub">¥{{ orderAmount(row, 'service') }}</span>
            <span v-else class="amount-empty">--</span>
          </template>
        </el-table-column>
        <el-table-column label="退款" width="90" align="right">
          <template #default="{ row }">
            <span v-if="orderAmount(row, 'refund') !== '--'" class="num amount amount--refund">-¥{{ orderAmount(row, 'refund').replace('-', '') }}</span>
            <span v-else class="amount-empty">--</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="84">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">
              <el-icon><View /></el-icon>明细
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        class="pager"
        @current-change="load"
      />
    </el-card>

    <el-dialog v-model="detailVisible" title="预约单明细" width="660px">
      <template v-if="detail">
        <!-- 概要条 -->
        <div class="summary">
          <PlateChip :plate="detail.plateNo" />
          <span class="sp-tag" :class="STATUS_PILL[detail.status]">
            <span class="sp-tag__dot" />{{ STATUS_LABELS[detail.status] }}
          </span>
          <span class="num summary__no">{{ detail.orderNo }}</span>
        </div>

        <el-descriptions :column="2" border class="detail-desc">
          <el-descriptions-item label="车场">{{ detail.lotName }}</el-descriptions-item>
          <el-descriptions-item label="核销方式">{{ detail.entryMethod || '--' }}</el-descriptions-item>
          <el-descriptions-item label="到达时间">{{ formatTime(detail.arriveTime) }}</el-descriptions-item>
          <el-descriptions-item label="入场截止">{{ formatTime(detail.enterDeadline) }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="核销码">
            <span v-if="detail.verifyCode" class="code-box num">{{ detail.verifyCode }}</span>
            <span v-else>--</span>
          </el-descriptions-item>
          <el-descriptions-item label="金额合计" :span="2">
            <span class="num total-amount">¥{{ formatAmount(detail.totalAmount) }}</span>
            <span class="hint" style="margin-left: 8px">支付为模拟</span>
          </el-descriptions-item>
        </el-descriptions>

        <div class="flow-title">资金流水</div>
        <ul v-if="detail.orders && detail.orders.length" class="flow">
          <li v-for="o in detail.orders" :key="o._id">
            <span class="flow__icon" :style="{ background: (FLOW_META[o.type]?.color || '#64748b') + '1a', color: FLOW_META[o.type]?.color || '#64748b' }">
              <el-icon><component :is="FLOW_META[o.type]?.icon || 'Money'" /></el-icon>
            </span>
            <div class="flow__main">
              <span class="flow__label">{{ ORDER_TYPE_LABELS[o.type] || o.type }}</span>
              <span class="num flow__time">{{ formatTime(o.paidAt) }} · {{ o.status }}</span>
            </div>
            <span class="num flow__amount" :class="{ 'flow__amount--neg': o.amount < 0 }">
              {{ o.amount < 0 ? '-' : '+' }}¥{{ formatAmount(Math.abs(o.amount)) }}
            </span>
          </li>
        </ul>
        <el-empty v-else description="无流水" :image-size="64" />
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pager {
  margin-top: 14px;
}
.order-no {
  font-size: 12.5px;
  color: var(--sp-text-2);
  letter-spacing: 0.02em;
}
.lot-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--sp-text);
}
.lot-name .el-icon {
  color: var(--sp-text-3);
}
.time {
  font-size: 12.5px;
  color: var(--sp-text-2);
}
.amount {
  font-weight: 700;
  color: var(--sp-text);
}
.amount--sub {
  font-weight: 600;
  color: var(--sp-text-2);
}
.amount--refund {
  color: #059669;
  font-weight: 700;
}
.amount-empty {
  color: var(--sp-text-3);
}

/* 明细弹窗 */
.summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--sp-radius);
  background: var(--sp-surface-2);
  border: 1px solid var(--sp-border);
  margin-bottom: 16px;
}
.summary__no {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--sp-text-3);
}
.detail-desc {
  margin-bottom: 4px;
}
.code-box {
  display: inline-block;
  background: #fff7e6;
  border: 1px solid #f5d599;
  color: #c07e00;
  border-radius: 6px;
  padding: 2px 12px;
  font-weight: 700;
  letter-spacing: 3px;
  font-size: 15px;
}
.total-amount {
  font-size: 17px;
  font-weight: 700;
  color: #c0271c;
}
.flow-title {
  font-weight: 700;
  font-size: 14px;
  margin: 18px 0 12px;
}
.flow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.flow li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--sp-border);
}
.flow li:last-child {
  border-bottom: none;
}
.flow__icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}
.flow__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.flow__label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--sp-text);
}
.flow__time {
  font-size: 11.5px;
  color: var(--sp-text-3);
}
.flow__amount {
  margin-left: auto;
  font-weight: 700;
  color: #1a52e6;
  font-size: 14.5px;
}
.flow__amount--neg {
  color: #059669;
}
</style>
