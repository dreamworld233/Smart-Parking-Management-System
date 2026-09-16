<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminLookup } from '../api'
import { STATUS_LABELS, STATUS_TAGS, ORDER_TYPE_LABELS, formatAmount, formatTime, formatPlate } from '../utils/format'
import type { Reservation, ReservationStatus } from '../types'

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
</script>

<template>
  <div>
    <el-card class="page-card">
      <div class="toolbar">
      <el-input v-model="query.plateNo" placeholder="车牌号，如 皖A12345" clearable style="width: 200px" @keyup.enter="search" />
      <el-input v-model="query.orderNo" placeholder="订单号" clearable style="width: 200px" @keyup.enter="search" />
      <el-select v-model="query.status" placeholder="状态" style="width: 140px">
        <el-option v-for="o in statusOptions" :key="o.value" :value="o.value" :label="o.label" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border stripe>
      <el-table-column prop="orderNo" label="订单号" width="200" show-overflow-tooltip />
      <el-table-column label="车牌" width="110">
        <template #default="{ row }">{{ formatPlate(row.plateNo) }}</template>
      </el-table-column>
      <el-table-column prop="lotName" label="车场" min-width="160" show-overflow-tooltip />
      <el-table-column label="到达时间" width="150">
        <template #default="{ row }">{{ formatTime(row.arriveTime) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAGS[row.status as ReservationStatus]" size="small">{{ STATUS_LABELS[row.status as ReservationStatus] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="预支停车费" width="100" align="right">
        <template #default="{ row }">{{ orderAmount(row, 'prepaid') }}</template>
      </el-table-column>
      <el-table-column label="服务费" width="80" align="right">
        <template #default="{ row }">{{ orderAmount(row, 'service') }}</template>
      </el-table-column>
      <el-table-column label="退款" width="90" align="right">
        <template #default="{ row }">{{ orderAmount(row, 'refund') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">明细</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top: 16px; justify-content: flex-end"
      @current-change="load"
    />
    </el-card>

    <el-dialog v-model="detailVisible" title="预约单明细" width="640px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ STATUS_LABELS[detail.status] }}</el-descriptions-item>
          <el-descriptions-item label="车牌">{{ formatPlate(detail.plateNo) }}</el-descriptions-item>
          <el-descriptions-item label="车场">{{ detail.lotName }}</el-descriptions-item>
          <el-descriptions-item label="到达时间">{{ formatTime(detail.arriveTime) }}</el-descriptions-item>
          <el-descriptions-item label="入场截止">{{ formatTime(detail.enterDeadline) }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="核销方式">{{ detail.entryMethod || '--' }}</el-descriptions-item>
          <el-descriptions-item label="核销码">
            <span v-if="detail.verifyCode" class="code">{{ detail.verifyCode }}</span>
            <span v-else>--</span>
          </el-descriptions-item>
          <el-descriptions-item label="金额合计">¥{{ formatAmount(detail.totalAmount) }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">流水</el-divider>
        <el-table :data="detail.orders || []" size="small" border>
          <el-table-column label="类型" width="120">
            <template #default="{ row }">{{ ORDER_TYPE_LABELS[row.type] || row.type }}</template>
          </el-table-column>
          <el-table-column label="金额" align="right">
            <template #default="{ row }">
              <span :class="{ neg: row.amount < 0 }">{{ row.amount < 0 ? '-' : '' }}¥{{ formatAmount(Math.abs(row.amount)) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">{{ row.status }}</template>
          </el-table-column>
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ formatTime(row.paidAt) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!(detail.orders && detail.orders.length)" description="无流水" :image-size="60" />
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.code {
  font-weight: 700;
  letter-spacing: 2px;
  font-size: 16px;
}
.neg {
  color: #67c23a;
}
</style>
