<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { adminVerifyPlate } from '../api'
import { uploadImage } from '../api/cloudbase'
import { formatPlate } from '../utils/format'
import PageHeader from '../components/PageHeader.vue'
import PlateChip from '../components/PlateChip.vue'
import ocrImg from '../assets/img/ocr-scan.png'

interface VerifyCandidate {
  reservationId: string
  orderNo: string
  lotName: string
  plateNo: string
}

interface VerifyResult {
  matched?: boolean
  plate?: string
  confidence?: number | null
  imageFileID?: string
  candidate?: VerifyCandidate | null
  // 核销成功后回填
  reservationId?: string
  orderNo?: string
  lotName?: string
  method?: string
}

// —— OCR 模式（识别与核销分离：识别 → 核对 → 确认核销，与小程序同流程）——
const ocrLoading = ref(false)
const ocrConfirmLoading = ref(false)
const ocrFile = ref<File | null>(null)
const previewUrl = ref('')
const ocrResult = ref<VerifyResult | null>(null)
const verified = ref(false)

// 低置信度不做「猜」（与小程序同口径）：<80 仍显示结果但明确提示核对，由运营决定
const lowConfidence = computed(() => {
  const c = ocrResult.value?.confidence
  return typeof c === 'number' && c < 80
})

function onFileChange(uploadFile: UploadFile) {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  ocrFile.value = (uploadFile.raw as File) || null
  previewUrl.value = ocrFile.value ? URL.createObjectURL(ocrFile.value) : ''
  ocrResult.value = null
  verified.value = false
}

async function runOcr() {
  if (!ocrFile.value) {
    ElMessage.warning('请先选择停车照片')
    return
  }
  ocrLoading.value = true
  verified.value = false
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

/** 运营核对识别结果后确认核销（mode=plate，云函数校验识别车牌 == 预约车牌） */
async function confirmVerify() {
  const r = ocrResult.value
  if (!r?.candidate) return
  ocrConfirmLoading.value = true
  try {
    const res = await adminVerifyPlate({
      mode: 'plate',
      reservationId: r.candidate.reservationId,
      plateNo: r.plate || '',
      confidence: r.confidence ?? null,
      imageFileID: r.imageFileID,
    })
    if (!res.ok) {
      ElMessage.error(res.message)
      // 车牌与预约不一致：识别错了车，清掉结果让重拍或转手动，别留下可误点的确认
      if (res.code === 'PLATE_MISMATCH') {
        ocrResult.value = null
        verified.value = false
      }
      return
    }
    const d = res.data as VerifyResult
    ocrResult.value = { ...r, ...d }
    verified.value = true
    ElMessage.success('已核销入场')
  } finally {
    ocrConfirmLoading.value = false
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
    <PageHeader title="车牌识别" subtitle="上传停车照片 OCR 识别并核销；识别失败可转手动核销" />

    <el-alert
      title="OCR 是核销的增强，不是单点依赖：识别失败 / 无预约 / 未配置密钥时，转到右侧手动核销（输码 / 预约单）即可。"
      type="info"
      :closable="false"
      class="page-alert"
    />

    <el-row :gutter="16" class="verify-row">
      <!-- OCR -->
      <el-col :xs="24" :lg="13">
        <el-card shadow="never" class="verify-card">
          <template #header>
            <div class="card-head">
              <span class="card-head__icon card-head__icon--blue"><el-icon><Camera /></el-icon></span>
              <div>
                <div class="card-head__title">车牌识别（OCR）</div>
                <div class="card-head__sub">腾讯云 LicensePlateOCR · 识别后核对车牌再确认核销</div>
              </div>
            </div>
          </template>

          <div class="ocr-body">
            <el-upload drag :auto-upload="false" :show-file-list="false" :on-change="onFileChange" accept="image/*" class="ocr-upload">
              <img v-if="previewUrl" :src="previewUrl" alt="停车照片预览" class="ocr-preview" />
              <template v-else>
                <el-icon class="upload-icon"><UploadFilled /></el-icon>
                <div class="el-upload__text">拖入停车照片，或 <em>点击选择</em></div>
                <div class="el-upload__tip">支持 JPG / PNG，车牌清晰为佳</div>
              </template>
            </el-upload>

            <div class="ocr-side">
              <img :src="ocrImg" alt="车牌识别示意" class="ocr-illu" />
              <ol class="ocr-steps">
                <li><b>1</b><span>上传入场停车照片</span></li>
                <li><b>2</b><span>OCR 识别车牌 + 置信度</span></li>
                <li><b>3</b><span>核对车牌后确认核销入场</span></li>
              </ol>
            </div>
          </div>

          <div v-if="ocrFile" class="filename">
            <el-icon><Document /></el-icon>
            <span class="filename__txt">已选：{{ ocrFile.name }}</span>
          </div>
          <el-button type="primary" :loading="ocrLoading" class="ocr-submit" @click="runOcr">
            <el-icon><MagicStick /></el-icon><span style="margin-left: 4px">识别车牌</span>
          </el-button>

          <!-- 已核销成功 -->
          <div v-if="verified && ocrResult" class="result result--ok">
            <span class="result__icon result__icon--ok"><el-icon><CircleCheckFilled /></el-icon></span>
            <div class="result__main">
              <div class="result__title">已核销入场</div>
              <div class="result__rows">
                <PlateChip :plate="ocrResult.plate || ''" />
                <span v-if="ocrResult.confidence !== null && ocrResult.confidence !== undefined" class="conf">
                  <span class="conf__label">置信度</span>
                  <span class="conf__track"><span class="conf__fill" :style="{ width: (ocrResult.confidence || 0) + '%' }" /></span>
                  <span class="num conf__val">{{ ocrResult.confidence }}%</span>
                </span>
              </div>
              <div class="result__sub">
                匹配预约：<b class="num">{{ ocrResult.orderNo }}</b> · {{ ocrResult.lotName }}
              </div>
            </div>
          </div>

          <!-- 识别命中候选预约：运营核对后确认核销 -->
          <div v-else-if="ocrResult && ocrResult.matched" class="result result--pending">
            <span class="result__icon result__icon--pending"><el-icon><View /></el-icon></span>
            <div class="result__main">
              <div class="result__title">识别到车牌，请核对后确认核销</div>
              <div class="result__rows">
                <PlateChip :plate="ocrResult.plate || ''" />
                <span v-if="ocrResult.confidence !== null && ocrResult.confidence !== undefined" class="conf">
                  <span class="conf__label">置信度</span>
                  <span class="conf__track"><span class="conf__fill" :style="{ width: (ocrResult.confidence || 0) + '%' }" /></span>
                  <span class="num conf__val">{{ ocrResult.confidence }}%</span>
                </span>
                <span v-if="lowConfidence" class="conf-warn">置信度低，请核对车牌</span>
              </div>
              <div class="result__sub">
                匹配预约：<b class="num">{{ ocrResult.candidate?.orderNo }}</b> · {{ ocrResult.candidate?.lotName }}（{{ formatPlate(ocrResult.candidate?.plateNo || '') }}）
              </div>
              <el-button type="primary" size="small" :loading="ocrConfirmLoading" class="confirm-btn" @click="confirmVerify">
                确认核销
              </el-button>
            </div>
          </div>

          <!-- 未匹配：转手动核销 -->
          <div v-else-if="ocrResult && !ocrResult.matched" class="result result--warn">
            <span class="result__icon result__icon--warn"><el-icon><WarningFilled /></el-icon></span>
            <div class="result__main">
              <div class="result__title">未匹配到待入场预约</div>
              <div class="result__sub">
                识别到车牌 <b>{{ formatPlate(ocrResult.plate || '') }}</b>，请改用右侧手动核销（输码 / 预约单）。
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 手动核销 -->
      <el-col :xs="24" :lg="11">
        <el-card shadow="never" class="verify-card">
          <template #header>
            <div class="card-head">
              <span class="card-head__icon card-head__icon--cyan"><el-icon><EditPen /></el-icon></span>
              <div>
                <div class="card-head__title">手动核销</div>
                <div class="card-head__sub">OCR 不可用时的兜底通道，同样写入 entry_logs</div>
              </div>
            </div>
          </template>

          <div class="manual">
            <div class="manual__item">
              <div class="manual__label">
                <el-icon><Postcard /></el-icon> 6 位核销码
              </div>
              <div class="manual__row">
                <el-input v-model="code" maxlength="6" placeholder="如 102438" class="manual__input code-input" />
                <el-button type="primary" :loading="codeLoading" @click="verifyByCode">核销</el-button>
              </div>
            </div>

            <div class="manual__divider"><span>或</span></div>

            <div class="manual__item">
              <div class="manual__label">
                <el-icon><Tickets /></el-icon> 预约单 ID
              </div>
              <div class="manual__row">
                <el-input v-model="reservationId" placeholder="reservationId" class="manual__input" />
                <el-button type="primary" :loading="manualLoading" @click="verifyManual">核销</el-button>
              </div>
            </div>
          </div>

          <div class="manual-note">
            <el-icon><InfoFilled /></el-icon>
            <span>一次入场可能先识别失败再输码成功，所有尝试都会按顺序留痕，可追溯完整尝试链。</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.page-alert {
  margin-bottom: 16px;
}
.verify-row {
  row-gap: 16px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 11px;
}
.card-head__icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  flex-shrink: 0;
}
.card-head__icon--blue {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.card-head__icon--cyan {
  background: #e5f8fc;
  color: #0891b2;
}
.card-head__title {
  font-weight: 700;
  font-size: 15px;
  color: var(--sp-text);
}
.card-head__sub {
  font-size: 12px;
  color: var(--sp-text-3);
  margin-top: 2px;
}

/* OCR */
.ocr-body {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 16px;
  align-items: stretch;
}
.ocr-upload :deep(.el-upload-dragger) {
  height: 100%;
  min-height: 218px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.upload-icon {
  font-size: 42px;
  color: var(--el-color-primary);
  margin-bottom: 10px;
}
.ocr-preview {
  max-width: 100%;
  max-height: 210px;
  border-radius: 10px;
  object-fit: cover;
}
.ocr-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--sp-surface-2);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius);
  padding: 14px;
}
.ocr-illu {
  width: 100%;
  max-width: 168px;
  object-fit: contain;
}
.ocr-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ocr-steps li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--sp-text-2);
}
.ocr-steps b {
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: var(--grad-brand);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.filename {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sp-text-2);
  font-size: 12.5px;
  margin-top: 12px;
}
.filename__txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ocr-submit {
  margin-top: 12px;
}

/* 结果 */
.result {
  display: flex;
  gap: 13px;
  margin-top: 16px;
  padding: 15px 16px;
  border-radius: var(--sp-radius);
  border: 1px solid;
  animation: sp-fade-up 0.35s ease both;
}
.result--ok {
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-7);
}
.result--warn {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-7);
}
.result--pending {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-7);
}
.result__icon {
  font-size: 26px;
  flex-shrink: 0;
  margin-top: 2px;
}
.result__icon--ok { color: #059669; }
.result__icon--warn { color: #d98600; }
.result__icon--pending { color: var(--el-color-primary); }
.result__title {
  font-weight: 700;
  font-size: 14.5px;
  color: var(--sp-text);
}
.result__rows {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 10px 0 6px;
  flex-wrap: wrap;
}
.conf {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--sp-text-2);
}
.conf__track {
  width: 90px;
  height: 6px;
  border-radius: 999px;
  background: #d7e4dd;
  overflow: hidden;
  display: inline-block;
}
.conf__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #10b981, #34d399);
}
.conf__val {
  font-weight: 700;
  color: #059669;
}
.conf-warn {
  font-size: 12px;
  color: #d98600;
  font-weight: 600;
}
.confirm-btn {
  margin-top: 12px;
}
.result__sub {
  font-size: 12.5px;
  color: var(--sp-text-2);
  line-height: 1.6;
}

/* 手动核销 */
.manual {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.manual__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sp-text);
  margin-bottom: 8px;
}
.manual__label .el-icon {
  color: #0891b2;
}
.manual__row {
  display: flex;
  gap: 10px;
}
.manual__input {
  flex: 1;
}
.code-input :deep(input) {
  font-family: var(--sp-font-num);
  letter-spacing: 4px;
  font-weight: 700;
}
.manual__divider {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--sp-text-3);
  font-size: 12px;
  margin: 8px 0;
}
.manual__divider::before,
.manual__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--sp-border);
}
.manual-note {
  display: flex;
  gap: 8px;
  margin-top: 18px;
  padding: 11px 13px;
  border-radius: var(--sp-radius);
  background: var(--sp-surface-2);
  font-size: 12px;
  line-height: 1.7;
  color: var(--sp-text-2);
}
.manual-note .el-icon {
  color: #0891b2;
  margin-top: 2px;
  flex-shrink: 0;
}

@media (max-width: 760px) {
  .ocr-body {
    grid-template-columns: 1fr;
  }
}
</style>
