<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminLookup } from '../api'
import { STATUS_LABELS, formatAmount, formatTime } from '../utils/format'
import type { Reservation, ReservationStatus } from '../types'
import PageHeader from '../components/PageHeader.vue'
import PlateChip from '../components/PlateChip.vue'
import EmptyArt from '../components/EmptyArt.vue'
import LogoMark from '../components/LogoMark.vue'

const query = reactive({ plateNo: '', orderNo: '' })
const list = ref<Reservation[]>([])
const loading = ref(false)
const searched = ref(false)

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
    searched.value = true
  } finally {
    loading.value = false
  }
}

const STATUS_PILL: Record<ReservationStatus, string> = {
  pending_entry: 'sp-tag--warning',
  entered: 'sp-tag--primary',
  completed: 'sp-tag--teal',
  cancelled: 'sp-tag--info',
  released: 'sp-tag--danger',
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

    <el-card shadow="never">
      <div class="owner-banner">
        <div class="owner-banner__item">
          <span class="owner-banner__icon" style="color: #2563ff; background: #edf3ff"><el-icon><User /></el-icon></span>
          <div>
            <b>固定车主</b>
            <p>在车主端小程序绑定了车牌的注册用户，凭证带其车牌与预约信息。</p>
          </div>
        </div>
        <div class="owner-banner__sep" />
        <div class="owner-banner__item">
          <span class="owner-banner__icon" style="color: #0891b2; background: #e5f8fc"><el-icon><Van /></el-icon></span>
          <div>
            <b>临时车主</b>
            <p>单次预约时填写车牌，未注册绑定，同样可按预约单打印凭证。</p>
          </div>
        </div>
      </div>

      <div class="toolbar" style="margin-top: 16px">
        <el-input v-model="query.plateNo" placeholder="车牌号" clearable style="width: 210px" @keyup.enter="search">
          <template #prefix><el-icon><Postcard /></el-icon></template>
        </el-input>
        <el-input v-model="query.orderNo" placeholder="订单号" clearable style="width: 230px" @keyup.enter="search">
          <template #prefix><el-icon><Tickets /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="search">
          <el-icon><Search /></el-icon><span style="margin-left: 4px">查询</span>
        </el-button>
      </div>

      <el-table v-loading="loading" :data="list">
        <template #empty>
          <EmptyArt
            :title="searched ? '没有匹配的预约单' : '请先查询预约单'"
            :description="searched ? '核对车牌号或订单号后重试' : '输入车牌号或订单号，查询后可打印预约凭证'"
          />
        </template>
        <el-table-column prop="orderNo" label="订单号" width="190">
          <template #default="{ row }"><span class="num order-no">{{ row.orderNo }}</span></template>
        </el-table-column>
        <el-table-column label="车牌" width="112">
          <template #default="{ row }"><PlateChip :plate="row.plateNo" size="sm" /></template>
        </el-table-column>
        <el-table-column prop="lotName" label="车场" min-width="160" show-overflow-tooltip />
        <el-table-column label="到达时间" width="150">
          <template #default="{ row }"><span class="num">{{ formatTime(row.arriveTime) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="92">
          <template #default="{ row }">
            <span class="sp-tag" :class="STATUS_PILL[row.status as ReservationStatus]">
              <span class="sp-tag__dot" />{{ STATUS_LABELS[row.status as ReservationStatus] }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="96" align="right">
          <template #default="{ row }"><span class="num amount">¥{{ formatAmount(row.totalAmount) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="108" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openPrint(row)">
              <el-icon><Printer /></el-icon>打印凭证
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 凭证预览 -->
    <el-dialog v-model="printVisible" title="预约凭证预览" width="540px">
      <div class="print-area">
        <div class="ticket">
          <div class="ticket__band">
            <LogoMark :size="38" />
            <div class="ticket__band-text">
              <div class="ticket__title">智慧停车 · 预约凭证</div>
              <div class="ticket__sub">SMART PARKING VOUCHER</div>
            </div>
            <span
              v-if="printRow"
              class="sp-tag"
              :class="STATUS_PILL[printRow.status]"
              style="background: rgba(255,255,255,.16); color: #fff"
            >{{ STATUS_LABELS[printRow.status] }}</span>
          </div>

          <template v-if="printRow">
            <div class="ticket__plate">
              <PlateChip :plate="printRow.plateNo" />
              <div class="ticket__lot">{{ printRow.lotName }}</div>
            </div>

            <dl class="ticket__rows">
              <div class="tr"><dt>订单号</dt><dd class="num">{{ printRow.orderNo }}</dd></div>
              <div class="tr"><dt>到达时间</dt><dd class="num">{{ formatTime(printRow.arriveTime) }}</dd></div>
              <div class="tr"><dt>入场截止</dt><dd class="num">{{ formatTime(printRow.enterDeadline) }}</dd></div>
              <div v-if="printRow.verifyCode" class="tr">
                <dt>核销码</dt>
                <dd><span class="v-code num">{{ printRow.verifyCode }}</span></dd>
              </div>
            </dl>

            <div class="ticket__perforation" />

            <dl class="ticket__rows ticket__rows--fee">
              <div class="tr"><dt>预支停车费</dt><dd class="num">¥{{ formatAmount(printRow.prepaidParkingFee) }}</dd></div>
              <div class="tr"><dt>平台服务费</dt><dd class="num">¥{{ formatAmount(printRow.serviceFee) }}</dd></div>
              <div v-if="printRow.refundTotal !== undefined" class="tr tr--refund">
                <dt>退款</dt><dd class="num">-¥{{ formatAmount(printRow.refundTotal) }}</dd>
              </div>
              <div class="tr tr--total"><dt>合计</dt><dd class="num">¥{{ formatAmount(printRow.totalAmount) }}</dd></div>
            </dl>

            <div class="ticket__foot">
              <p>本凭证为预约锁位凭证；入场后实际停放费用由车场自行计收。</p>
              <p class="ticket__mock">支付为模拟 · 请于入场截止前到达，超时预约自动释放</p>
            </div>
          </template>
        </div>
      </div>
      <template #footer>
        <el-button @click="printVisible = false">关闭</el-button>
        <el-button type="primary" @click="doPrint">
          <el-icon><Printer /></el-icon><span style="margin-left: 4px">打印</span>
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.owner-banner {
  display: flex;
  align-items: stretch;
  gap: 18px;
  padding: 14px 16px;
  border-radius: var(--sp-radius);
  background: var(--sp-surface-2);
  border: 1px solid var(--sp-border);
}
.owner-banner__item {
  display: flex;
  gap: 12px;
  flex: 1;
}
.owner-banner__icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  flex-shrink: 0;
}
.owner-banner__item b {
  font-size: 13.5px;
  color: var(--sp-text);
}
.owner-banner__item p {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--sp-text-3);
  line-height: 1.6;
}
.owner-banner__sep {
  width: 1px;
  background: var(--sp-border-strong);
}
.order-no {
  font-size: 12.5px;
  color: var(--sp-text-2);
}
.amount {
  font-weight: 700;
}

/* —— 票据 —— */
.print-area {
  background: #f6f8fc;
  border-radius: var(--sp-radius);
  padding: 14px;
}
.ticket {
  background: #fff;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--sp-border-strong);
  box-shadow: 0 10px 30px rgba(15, 27, 51, 0.1);
}
.ticket__band {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(120deg, #0a1530 0%, #123a8f 58%, #0e7490 100%);
  color: #fff;
}
.ticket__band-text {
  flex: 1;
}
.ticket__title {
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.ticket__sub {
  font-family: var(--sp-font-num);
  font-size: 9.5px;
  letter-spacing: 0.24em;
  color: rgba(213, 232, 255, 0.75);
  margin-top: 2px;
}
.ticket__plate {
  text-align: center;
  padding: 20px 20px 14px;
}
.ticket__lot {
  margin-top: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--sp-text);
}
.ticket__rows {
  margin: 0;
  padding: 4px 20px;
}
.tr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 13.5px;
}
.tr dt {
  color: var(--sp-text-3);
}
.tr dd {
  margin: 0;
  color: var(--sp-text);
  font-weight: 500;
}
.v-code {
  display: inline-block;
  background: #fff7e6;
  border: 1px solid #f5d599;
  color: #c07e00;
  border-radius: 7px;
  padding: 3px 16px;
  font-weight: 700;
  letter-spacing: 5px;
  font-size: 17px;
}
.ticket__perforation {
  margin: 10px 16px;
  border-top: 2px dashed var(--sp-border-strong);
}
.ticket__rows--fee {
  padding-bottom: 10px;
}
.tr--refund dd { color: #059669; }
.tr--total {
  border-top: 1px solid var(--sp-border);
  margin-top: 4px;
  padding-top: 12px;
  font-size: 15px;
}
.tr--total dt { color: var(--sp-text); font-weight: 600; }
.tr--total dd { font-size: 19px; font-weight: 700; color: #c0271c; }
.ticket__foot {
  padding: 12px 20px 18px;
  background: var(--sp-surface-2);
}
.ticket__foot p {
  margin: 0;
  font-size: 11.5px;
  color: var(--sp-text-3);
  line-height: 1.7;
}
.ticket__mock {
  margin-top: 2px;
}

@media (max-width: 600px) {
  .owner-banner {
    flex-direction: column;
  }
  .owner-banner__sep {
    width: auto;
    height: 1px;
  }
}
</style>

<style>
/* 打印：只保留票据，铺满纸面 */
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
    padding: 0;
    background: #fff;
  }
  .ticket {
    border: none;
    box-shadow: none;
    border-radius: 0;
  }
}
</style>
