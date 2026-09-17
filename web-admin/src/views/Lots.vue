<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminListLots, adminUpsertLot, adminDeleteLot, adminPriceChange } from '../api'
import { SOURCE_LABELS, SOURCE_TAGS, formatSpots } from '../utils/format'
import type { Lot, LotSource } from '../types'
import PageHeader from '../components/PageHeader.vue'

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

// 模板里 el-table 的 row 是 any，直接下标索引类型化 Record 会被 TS 拦；
// 用函数收窄，调用处传 row.pricing?.source 即可
function sourceLabel(s: LotSource | undefined): string {
  return s ? SOURCE_LABELS[s] : '--'
}
function sourceTag(s: LotSource | undefined): 'success' | 'primary' | 'warning' {
  return s ? SOURCE_TAGS[s] : 'warning'
}

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

    <el-card>
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="按名称 / 地址搜索" clearable style="width: 260px" @keyup.enter="search">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button @click="search">查询</el-button>
      </div>

    <el-table v-loading="loading" :data="list" empty-text="还没有签约车场，点击右上角「新增车场」录入">
      <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="address" label="地址" min-width="200" show-overflow-tooltip />
      <el-table-column label="坐标" width="160">
        <template #default="{ row }">{{ row.location?.lat?.toFixed(5) }}, {{ row.location?.lng?.toFixed(5) }}</template>
      </el-table-column>
      <el-table-column label="收费" width="130">
        <template #default="{ row }">首{{ row.pricing?.firstHour }} / 续{{ row.pricing?.perHourAfter }} / 封顶{{ row.pricing?.capPerDay }}</template>
      </el-table-column>
      <el-table-column label="收费来源" width="130">
        <template #default="{ row }">
          <el-tag :type="sourceTag(row.pricing?.source)" size="small">{{ sourceLabel(row.pricing?.source) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="总车位" width="90">
        <template #default="{ row }">{{ row.availability?.totalSpots ?? '--' }}</template>
      </el-table-column>
      <el-table-column label="余位" width="90">
        <template #default="{ row }">{{ formatSpots(row.availability?.freeSpots ?? null, row.availability?.totalSpots ?? null) }}</template>
      </el-table-column>
      <el-table-column label="额度" width="80">
        <template #default="{ row }">{{ row.reservedCount ?? 0 }}/{{ row.reservableQuota }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.contract?.status === 'disabled' ? 'info' : 'success'" size="small">
            {{ row.contract?.status === 'disabled' ? '停用' : '签约' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="warning" @click="openPrice(row)">改价</el-button>
          <el-button link :type="row.contract?.status === 'disabled' ? 'success' : 'danger'" @click="toggle(row)">
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
      style="margin-top: 16px; justify-content: flex-end"
      @current-change="load"
    />
    </el-card>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑车场' : '新增车场'" width="640px">
      <el-form label-width="110px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="地址" required>
          <el-input v-model="form.address" />
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
          <span class="hint">可空（无夜间费则留空）</span>
        </el-form-item>
        <el-form-item label="收费来源" required>
          <el-select v-model="form.pricingSource" :disabled="isEdit" style="width: 260px">
            <el-option v-for="o in sourceOptions" :key="o.value" :value="o.value" :label="o.label" />
          </el-select>
        </el-form-item>

        <el-divider content-position="left">车位与额度</el-divider>
        <el-form-item label="总车位数" required>
          <el-input-number v-model="form.totalSpots" :min="0" style="width: 180px" />
        </el-form-item>
        <el-form-item label="车位来源" required>
          <el-select v-model="form.spotsSource" style="width: 260px">
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
          <el-select v-model="priceForm.source" style="width: 260px">
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
  margin-bottom: 16px;
}
.coords {
  display: flex;
  gap: 8px;
  width: 100%;
}
.hint {
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
}
</style>
