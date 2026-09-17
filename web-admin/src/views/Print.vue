<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminLookup } from '../api'
import { STATUS_LABELS, formatAmount, formatTime, formatPlate } from '../utils/format'
import type { Reservation, ReservationStatus } from '../types'
import PageHeader from '../components/PageHeader.vue'

const query = reactive({ plateNo: '', orderNo: '' })
const list = ref<Reservation[]>([])
const loading = ref(false)

async function search() {
  if (!query.plateNo.trim() && !query.orderNo.trim()) {
    ElMessage.warning('请输入车牌号或订单号')
    return
  }
  loading.value = true
  try {
    const res = await adminLookup({ plateNo: query.plateNo, orderNo: query.orderNo, page: 1, pageSize: 20 })
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    list.value = res.data.list
  } finally {
    loading.value = false
  }
}

const printVisible = ref(false)
const printRow = ref<Reservation | null>(null)

function openPrint(row: Reservation) {
  printRow.value = row
  printVisible.value = true
}

function doPrint() {
  window.print()
}
</script>

<template>
  <div>
    <PageHeader title="打印管理" subtitle="按预约单打印凭证；固定车主 = 已绑定车牌，临时车主 = 单次预约" />

    <el-card>
      <el-alert
        title="打印预约凭证。固定车主 = 在车主端绑定了车牌的用户；临时车主 = 单次预约时填写车牌。本页按预约单打印凭证与金额。"
        type="info"
        :closable="false"
        style="margin-bottom: 16px"
      />

      <div class="toolbar">
        <el-input v-model="query.plateNo" placeholder="车牌号" clearable style="width: 200px" @keyup.enter="search" />
        <el-input v-model="query.orderNo" placeholder="订单号" clearable style="width: 220px" @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
      </div>

    <el-table v-loading="loading" :data="list" empty-text="请先按车牌号或订单号查询预约单">
      <el-table-column prop="orderNo" label="订单号" width="200" />
      <el-table-column label="车牌" width="110">
        <template #default="{ row }">{{ formatPlate(row.plateNo) }}</template>
      </el-table-column>
      <el-table-column prop="lotName" label="车场" min-width="160" show-overflow-tooltip />
      <el-table-column label="到达时间" width="150">
        <template #default="{ row }">{{ formatTime(row.arriveTime) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">{{ STATUS_LABELS[row.status as ReservationStatus] }}</template>
      </el-table-column>
      <el-table-column label="金额" width="100" align="right">
        <template #default="{ row }">¥{{ formatAmount(row.totalAmount) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openPrint(row)">打印凭证</el-button>
        </template>
      </el-table-column>
    </el-table>
    </el-card>

    <el-dialog v-model="printVisible" title="预约凭证预览" width="520px">
      <div class="print-area">
        <h2 class="v-title">智慧停车 · 预约凭证</h2>
        <template v-if="printRow">
          <table class="voucher">
            <tbody>
              <tr><td class="k">订单号</td><td>{{ printRow.orderNo }}</td></tr>
              <tr><td class="k">车牌</td><td>{{ formatPlate(printRow.plateNo) }}</td></tr>
              <tr><td class="k">车场</td><td>{{ printRow.lotName }}</td></tr>
              <tr><td class="k">到达时间</td><td>{{ formatTime(printRow.arriveTime) }}</td></tr>
              <tr><td class="k">入场截止</td><td>{{ formatTime(printRow.enterDeadline) }}</td></tr>
              <tr><td class="k">状态</td><td>{{ STATUS_LABELS[printRow.status] }}</td></tr>
              <tr v-if="printRow.verifyCode"><td class="k">核销码</td><td class="code">{{ printRow.verifyCode }}</td></tr>
              <tr><td class="k">预支停车费</td><td>¥{{ formatAmount(printRow.prepaidParkingFee) }}</td></tr>
              <tr><td class="k">平台服务费</td><td>¥{{ formatAmount(printRow.serviceFee) }}</td></tr>
              <tr><td class="k">合计</td><td>¥{{ formatAmount(printRow.totalAmount) }}</td></tr>
              <tr v-if="printRow.refundTotal !== undefined"><td class="k">退款</td><td>¥{{ formatAmount(printRow.refundTotal) }}</td></tr>
            </tbody>
          </table>
          <p class="foot">本凭证为预约锁位凭证；入场后实际停放费用由车场自行计收。支付为模拟。</p>
        </template>
      </div>
      <template #footer>
        <el-button @click="printVisible = false">关闭</el-button>
        <el-button type="primary" @click="doPrint">打印</el-button>
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
.v-title {
  text-align: center;
  margin: 0 0 16px;
}
.voucher {
  width: 100%;
  border-collapse: collapse;
}
.voucher td {
  border: 1px solid #dcdfe6;
  padding: 8px 10px;
  font-size: 14px;
}
.voucher .k {
  width: 110px;
  color: #909399;
  background: #f5f7fa;
}
.code {
  font-weight: 700;
  letter-spacing: 3px;
  font-size: 18px;
}
.foot {
  margin-top: 12px;
  color: #909399;
  font-size: 12px;
}
</style>

<style>
@media print {
  body * {
    visibility: hidden;
  }
  .print-area,
  .print-area * {
    visibility: visible;
  }
  .print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 24px;
  }
}
</style>
