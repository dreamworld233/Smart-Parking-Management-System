<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminListLots, adminUpsertLot, adminDeleteLot, adminPriceChange } from '../api'
import type { Lot, LotSource } from '../types'
import PageHeader from '../components/PageHeader.vue'
import OccupancyBar from '../components/OccupancyBar.vue'
import SourceBadge from '../components/SourceBadge.vue'
import EmptyArt from '../components/EmptyArt.vue'

const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const list = ref<Lot[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res = await adminListLots({ keyword: keyword.value, page: page.value, pageSize: pageSize.value })
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

const sourceOptions = [
  { value: 'public', label: 'public · 公示价（已核实）' },
  { value: 'ops', label: 'ops · 运营声明' },
  { value: 'placeholder', label: 'placeholder · 示例数据待核实' },
] as { value: LotSource; label: string }[]

// —— 新增 / 编辑 ——
// 收费规则只在「新增」时录入（首版价格，来源字段即出处）；改价必须走「改价」按钮 → adminPriceChange 留痕。
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)

interface LotForm {
  _id: string
  name: string
  address: string
  lat: number | undefined
  lng: number | undefined
  firstHour: number | undefined
  perHourAfter: number | undefined
  stepMinutes: number
  capPerDay: number | undefined
  nightRate: number | undefined
  pricingSource: LotSource
  totalSpots: number | undefined
  spotsSource: LotSource
  reservableQuota: number | undefined
  facilities: string[]
  note: string
}

const blank = (): LotForm => ({
  _id: '',
  name: '',
  address: '',
  lat: undefined,
  lng: undefined,
  firstHour: 3,
  perHourAfter: 2,
  stepMinutes: 60,
  capPerDay: 15,
  nightRate: undefined,
  pricingSource: 'placeholder',
  totalSpots: 100,
  spotsSource: 'placeholder',
  reservableQuota: 10,
  facilities: [],
  note: '',
})

const form = reactive<LotForm>(blank())

function openCreate() {
  Object.assign(form, blank())
  isEdit.value = false
  dialogVisible.value = true
}

function openEdit(row: Lot) {
  Object.assign(form, blank(), {
    _id: row._id,
    name: row.name,
    address: row.address,
    lat: row.location?.lat,
    lng: row.location?.lng,
    firstHour: row.pricing?.firstHour,
    perHourAfter: row.pricing?.perHourAfter,
    stepMinutes: row.pricing?.stepMinutes ?? 60,
    capPerDay: row.pricing?.capPerDay,
    nightRate: row.pricing?.nightRate ?? undefined,
    pricingSource: row.pricing?.source ?? 'placeholder',
    totalSpots: row.availability?.totalSpots,
    spotsSource: row.availability?.source ?? 'placeholder',
    reservableQuota: row.reservableQuota,
    facilities: [...(row.facilities || [])],
    note: row.note || '',
  })
  isEdit.value = true
  dialogVisible.value = true
}

async function submit() {
  if (!form.name.trim() || !form.address.trim()) {
    ElMessage.warning('请填写名称与地址')
    return
  }
  if (typeof form.lat !== 'number' || typeof form.lng !== 'number') {
    ElMessage.warning('请填写坐标（从腾讯 POI 检索带出，不手敲）')
    return
  }
  const lot: Partial<Lot> = {
    _id: form._id,
    name: form.name.trim(),
    address: form.address.trim(),
    location: { lat: form.lat, lng: form.lng },
    pricing: {
      firstHour: Number(form.firstHour),
      perHourAfter: Number(form.perHourAfter),
      stepMinutes: form.stepMinutes,
      capPerDay: Number(form.capPerDay),
      nightRate: typeof form.nightRate === 'number' ? form.nightRate : null,
      source: form.pricingSource,
    },
    availability: {
      freeSpots: null,
      totalSpots: Number(form.totalSpots),
      source: form.spotsSource,
    },
    reservableQuota: Number(form.reservableQuota),
    facilities: form.facilities,
    note: form.note,
  }
  saving.value = true
  try {
    const res = await adminUpsertLot(lot)
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success(res.data.created ? '已新增车场' : '已保存修改')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

// —— 停用 / 启用 ——
async function toggle(row: Lot) {
  const disabled = row.contract?.status === 'disabled'
  try {
    await ElMessageBox.confirm(
      disabled ? `确认启用「${row.name}」？` : `确认停用「${row.name}」？停用后小程序端不可预约。`,
      '提示',
      { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const res = await adminDeleteLot(row._id)
  if (!res.ok) {
    ElMessage.error(res.message)
    return
  }
  ElMessage.success(disabled ? '已启用' : '已停用')
  load()
}

// —— 改价 ——
const priceVisible = ref(false)
const priceSaving = ref(false)
const priceLotId = ref('')
const priceLotName = ref('')
const priceForm = reactive({
  firstHour: undefined as number | undefined,
  perHourAfter: undefined as number | undefined,
  stepMinutes: 60,
  capPerDay: undefined as number | undefined,
  nightRate: undefined as number | undefined,
  source: 'placeholder' as LotSource,
  note: '',
})

function openPrice(row: Lot) {
  priceLotId.value = row._id
  priceLotName.value = row.name
  const p = row.pricing
  priceForm.firstHour = p.firstHour
  priceForm.perHourAfter = p.perHourAfter
  priceForm.stepMinutes = p.stepMinutes
  priceForm.capPerDay = p.capPerDay
  priceForm.nightRate = p.nightRate ?? undefined
  priceForm.source = p.source
  priceForm.note = ''
  priceVisible.value = true
}

async function submitPrice() {
  priceSaving.value = true
  try {
    const res = await adminPriceChange({
      lotId: priceLotId.value,
      pricing: {
        firstHour: Number(priceForm.firstHour),
        perHourAfter: Number(priceForm.perHourAfter),
        stepMinutes: priceForm.stepMinutes,
        capPerDay: Number(priceForm.capPerDay),
        nightRate: typeof priceForm.nightRate === 'number' ? priceForm.nightRate : null,
        source: priceForm.source,
      },
      note: priceForm.note,
    })
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success('已改价，并写入 lot_price_changes 留痕')
    priceVisible.value = false
    load()
  } finally {
    priceSaving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="车场管理" subtitle="管理签约车场与公示价；改价会写入 lot_price_changes 留痕">
      <template #actions>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          <span style="margin-left: 4px">新增车场</span>
        </el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="按名称 / 地址搜索" clearable style="width: 280px" @keyup.enter="search">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" plain @click="search">
          <el-icon><Search /></el-icon><span style="margin-left: 4px">查询</span>
        </el-button>
        <span class="toolbar__count">共 <b class="num">{{ total }}</b> 家签约车场</span>
      </div>

      <el-table v-loading="loading" :data="list" class="lot-table">
        <template #empty>
          <EmptyArt
            title="还没有签约车场"
            description="点击右上角「新增车场」录入第一家签约车场；示例数据请如实标注来源。"
          >
            <el-button type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon><span style="margin-left: 4px">新增车场</span>
            </el-button>
          </EmptyArt>
        </template>

        <el-table-column label="车场" min-width="172">
          <template #default="{ row }">
            <div class="lot-cell">
              <span class="lot-avatar" :class="{ 'is-disabled': row.contract?.status === 'disabled' }">
                <el-icon><OfficeBuilding /></el-icon>
              </span>
              <div class="lot-cell__main">
                <span class="lot-name">{{ row.name }}</span>
                <div v-if="row.facilities && row.facilities.length" class="facilities">
                  <span v-for="f in row.facilities" :key="f" class="fac-chip">
                    <el-icon><Check /></el-icon>{{ f }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="位置" min-width="172">
          <template #default="{ row }">
            <div class="loc">
              <span class="loc__addr"><el-icon><LocationInformation /></el-icon>{{ row.address }}</span>
              <span class="num loc__coord">{{ row.location?.lat?.toFixed(5) }}, {{ row.location?.lng?.toFixed(5) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="收费（元）" width="138">
          <template #default="{ row }">
            <div class="fee">
              <div class="fee__line">
                <span>首小时</span><b class="num">¥{{ row.pricing?.firstHour }}</b>
              </div>
              <div class="fee__line fee__line--sub">
                <span>续时/时</span><b class="num">¥{{ row.pricing?.perHourAfter }}</b>
              </div>
              <div class="fee__line fee__line--sub">
                <span>封顶/日</span><b class="num">¥{{ row.pricing?.capPerDay }}</b>
                <el-icon v-if="row.pricing?.nightRate" class="fee__moon" title="设有夜间费率"><Moon /></el-icon>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="余位" width="144">
          <template #default="{ row }">
            <OccupancyBar :free="row.availability?.freeSpots ?? null" :total="row.availability?.totalSpots ?? null" />
          </template>
        </el-table-column>

        <el-table-column label="收费来源" width="132">
          <template #default="{ row }">
            <SourceBadge :source="row.pricing?.source" />
          </template>
        </el-table-column>

        <el-table-column label="预约额度" width="82" align="center">
          <template #default="{ row }">
            <span class="num quota"><b>{{ row.reservedCount ?? 0 }}</b>/{{ row.reservableQuota }}</span>
          </template>
        </el-table-column>

        <el-table-column label="状态" width="92">
          <template #default="{ row }">
            <span v-if="row.contract?.status === 'disabled'" class="sp-tag sp-tag--info">
              <span class="sp-tag__dot" />已停用
            </span>
            <span v-else class="sp-tag sp-tag--success">
              <span class="sp-tag__dot" />签约中
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="164">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">
              <el-icon><EditPen /></el-icon>编辑
            </el-button>
            <el-button link type="warning" @click="openPrice(row)">
              <el-icon><PriceTag /></el-icon>改价
            </el-button>
            <el-button link :type="row.contract?.status === 'disabled' ? 'success' : 'danger'" @click="toggle(row)">
              <el-icon><component :is="row.contract?.status === 'disabled' ? 'Open' : 'TurnOff'" /></el-icon>
              {{ row.contract?.status === 'disabled' ? '启用' : '停用' }}
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

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑车场' : '新增车场'" width="640px">
      <el-form label-width="110px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：万象城地下停车场" />
        </el-form-item>
        <el-form-item label="地址" required>
          <el-input v-model="form.address" placeholder="详细地址" />
        </el-form-item>
        <el-form-item label="坐标" required>
          <div class="coords">
            <el-input-number v-model="form.lat" :precision="6" :step="0.001" controls-position="right" placeholder="纬度" style="flex: 1" />
            <el-input-number v-model="form.lng" :precision="6" :step="0.001" controls-position="right" placeholder="经度" style="flex: 1" />
          </div>
          <div class="hint">坐标从腾讯 POI 检索带出，避免手敲出错</div>
        </el-form-item>

        <el-divider content-position="left">收费规则（新增时录入，改价请用「改价」按钮留痕）</el-divider>
        <el-form-item label="首小时价" required>
          <el-input-number v-model="form.firstHour" :min="0" :precision="1" :disabled="isEdit" style="width: 180px" />
        </el-form-item>
        <el-form-item label="后续每小时" required>
          <el-input-number v-model="form.perHourAfter" :min="0" :precision="1" :disabled="isEdit" style="width: 180px" />
        </el-form-item>
        <el-form-item label="计费步长">
          <el-select v-model="form.stepMinutes" :disabled="isEdit" style="width: 180px">
            <el-option :value="15" label="15 分钟" />
            <el-option :value="30" label="30 分钟" />
            <el-option :value="60" label="60 分钟" />
          </el-select>
        </el-form-item>
        <el-form-item label="单日封顶" required>
          <el-input-number v-model="form.capPerDay" :min="0" :precision="1" :disabled="isEdit" style="width: 180px" />
        </el-form-item>
        <el-form-item label="夜间费率">
          <el-input-number v-model="form.nightRate" :min="0" :precision="1" :disabled="isEdit" style="width: 180px" />
          <span class="hint" style="margin-left: 8px">可空（无夜间费则留空）</span>
        </el-form-item>
        <el-form-item label="收费来源" required>
          <el-select v-model="form.pricingSource" :disabled="isEdit" style="width: 280px">
            <el-option v-for="o in sourceOptions" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>

        <el-divider content-position="left">车位与额度</el-divider>
        <el-form-item label="总车位数" required>
          <el-input-number v-model="form.totalSpots" :min="0" style="width: 180px" />
        </el-form-item>
        <el-form-item label="车位来源" required>
          <el-select v-model="form.spotsSource" style="width: 280px">
            <el-option v-for="o in sourceOptions" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="可预约额度" required>
          <el-input-number v-model="form.reservableQuota" :min="0" style="width: 180px" />
        </el-form-item>
        <el-form-item label="设施标签">
          <el-select v-model="form.facilities" multiple filterable allow-create default-first-option placeholder="如：充电桩" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="2" placeholder="核价来源、备注等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 改价 -->
    <el-dialog v-model="priceVisible" :title="`改价 · ${priceLotName}`" width="560px">
      <el-alert
        title="改价会写入 lot_price_changes 留痕（前后值 + 操作人 + 时间）。来源请如实选择：placeholder 表示仍是示例数据，待核实。"
        type="warning"
        :closable="false"
        style="margin-bottom: 16px"
      />
      <el-form label-width="110px">
        <el-form-item label="首小时价" required>
          <el-input-number v-model="priceForm.firstHour" :min="0" :precision="1" style="width: 180px" />
        </el-form-item>
        <el-form-item label="后续每小时" required>
          <el-input-number v-model="priceForm.perHourAfter" :min="0" :precision="1" style="width: 180px" />
        </el-form-item>
        <el-form-item label="计费步长">
          <el-select v-model="priceForm.stepMinutes" style="width: 180px">
            <el-option :value="15" label="15 分钟" />
            <el-option :value="30" label="30 分钟" />
            <el-option :value="60" label="60 分钟" />
          </el-select>
        </el-form-item>
        <el-form-item label="单日封顶" required>
          <el-input-number v-model="priceForm.capPerDay" :min="0" :precision="1" style="width: 180px" />
        </el-form-item>
        <el-form-item label="夜间费率">
          <el-input-number v-model="priceForm.nightRate" :min="0" :precision="1" style="width: 180px" />
        </el-form-item>
        <el-form-item label="收费来源" required>
          <el-select v-model="priceForm.source" style="width: 280px">
            <el-option v-for="o in sourceOptions" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="priceForm.note" placeholder="价格出处（公示价牌 / 公开渠道等）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="priceVisible = false">取消</el-button>
        <el-button type="primary" :loading="priceSaving" @click="submitPrice">确认改价</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  align-items: center;
}
.toolbar__count {
  margin-left: auto;
  font-size: 13px;
  color: var(--sp-text-3);
}
.toolbar__count b {
  color: var(--sp-text);
  font-weight: 700;
}
.pager {
  margin-top: 14px;
}

/* 车场单元格 */
.lot-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}
.lot-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  flex-shrink: 0;
}
.lot-avatar.is-disabled {
  background: var(--el-color-info-light-9);
  color: var(--sp-text-3);
}
.lot-name {
  font-weight: 600;
  color: var(--sp-text);
  font-size: 13.5px;
}
.facilities {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.fac-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: #0b7268;
  background: var(--sp-teal-soft);
  border-radius: 5px;
  padding: 1px 6px;
  line-height: 1.5;
}
.fac-chip .el-icon {
  font-size: 10px;
}

/* 位置 */
.loc {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.loc__addr {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  color: var(--sp-text);
  font-size: 13px;
}
.loc__addr .el-icon {
  margin-top: 3px;
  color: var(--sp-text-3);
  flex-shrink: 0;
}
.loc__coord {
  color: var(--sp-text-3);
  font-size: 11.5px;
  padding-left: 18px;
}

/* 收费 */
.fee {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.fee__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
  color: var(--sp-text-2);
}
.fee__line b {
  color: var(--sp-text);
  font-weight: 700;
}
.fee__line--sub {
  color: var(--sp-text-3);
  font-size: 12px;
}
.fee__line--sub b {
  color: var(--sp-text-2);
  font-weight: 600;
}
.fee__moon {
  font-size: 12px;
  color: #64748b;
  margin-left: 2px;
}

.quota {
  white-space: nowrap;
}
.quota b {
  color: var(--sp-text);
  font-weight: 700;
}

.coords {
  display: flex;
  gap: 8px;
  width: 100%;
}

@media (max-width: 640px) {
  .toolbar__count {
    display: none;
  }
}
</style>
