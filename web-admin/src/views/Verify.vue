<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { adminVerifyPlate } from '../api'
import { uploadImage } from '../api/cloudbase'
import { formatPlate } from '../utils/format'

interface VerifyResult {
  matched?: boolean
  plate?: string
  confidence?: number | null
  reservationId?: string
  orderNo?: string
  lotName?: string
  method?: string
}

// —— OCR 模式 ——
const ocrLoading = ref(false)
const ocrFile = ref<File | null>(null)
const ocrResult = ref<VerifyResult | null>(null)

function onFileChange(uploadFile: UploadFile) {
  ocrFile.value = (uploadFile.raw as File) || null
  ocrResult.value = null
}

async function runOcr() {
  if (!ocrFile.value) {
    ElMessage.warning('请先选择停车照片')
    return
  }
  ocrLoading.value = true
  try {
    const up = await uploadImage(ocrFile.value)
    if (!up.ok) {
      ElMessage.error(up.message)
      return
    }
    const res = await adminVerifyPlate({ mode: 'ocr', imageFileID: up.fileID })
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    ocrResult.value = res.data as VerifyResult
  } finally {
    ocrLoading.value = false
  }
}

// —— 手动核销 ——
const codeLoading = ref(false)
const code = ref('')
const manualLoading = ref(false)
const reservationId = ref('')

async function verifyByCode() {
  if (!/^\d{6}$/.test(code.value)) {
    ElMessage.warning('核销码须为 6 位数字')
    return
  }
  codeLoading.value = true
  try {
    const res = await adminVerifyPlate({ mode: 'code', verifyCode: code.value })
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success('核销成功')
    code.value = ''
  } finally {
    codeLoading.value = false
  }
}

async function verifyManual() {
  if (!reservationId.value.trim()) {
    ElMessage.warning('请输入预约单 id')
    return
  }
  manualLoading.value = true
  try {
    const res = await adminVerifyPlate({ mode: 'manual', reservationId: reservationId.value.trim() })
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success('核销成功')
    reservationId.value = ''
  } finally {
    manualLoading.value = false
  }
}
</script>

<template>
  <div>
    <el-alert
      title="OCR 是核销的增强，不是单点依赖：识别失败 / 无预约 / 未配置密钥时，转到右侧手动核销（输码 / 预约单）即可。"
      type="info"
      :closable="false"
      style="margin-bottom: 16px"
    />

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card>
          <template #header>车牌识别（OCR）</template>
          <el-upload :auto-upload="false" :show-file-list="false" :on-change="onFileChange" accept="image/*">
            <el-button>选择停车照片</el-button>
          </el-upload>
          <div v-if="ocrFile" class="filename">已选：{{ ocrFile.name }}</div>
          <el-button type="primary" :loading="ocrLoading" style="margin-top: 12px" @click="runOcr">识别并核销</el-button>

          <el-result v-if="ocrResult && ocrResult.matched" icon="success" title="识别成功，已核销" style="margin-top: 12px">
            <template #sub-title>
              <p>车牌：{{ formatPlate(ocrResult.plate || '') }}（置信度 {{ ocrResult.confidence ?? '--' }}）</p>
              <p>匹配预约：{{ ocrResult.orderNo }} · {{ ocrResult.lotName }}</p>
            </template>
          </el-result>

          <el-alert
            v-else-if="ocrResult && !ocrResult.matched"
            :title="`识别到车牌 ${formatPlate(ocrResult.plate || '')}，但无待入场预约，可转手动核销`"
            type="warning"
            :closable="false"
            style="margin-top: 12px"
          />
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card>
          <template #header>手动核销</template>
          <el-form label-width="100px">
            <el-form-item label="核销码">
              <el-input v-model="code" maxlength="6" placeholder="6 位核销码" style="width: 200px" />
              <el-button type="primary" :loading="codeLoading" style="margin-left: 8px" @click="verifyByCode">核销</el-button>
            </el-form-item>
            <el-form-item label="预约单 id">
              <el-input v-model="reservationId" placeholder="reservationId" style="width: 260px" />
              <el-button type="primary" :loading="manualLoading" style="margin-left: 8px" @click="verifyManual">核销</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.filename {
  color: #909399;
  font-size: 12px;
  margin-top: 8px;
}
</style>
