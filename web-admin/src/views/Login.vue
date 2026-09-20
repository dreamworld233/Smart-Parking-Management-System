<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { webLogin } from '../api'
import { setSession } from '../store/auth'
import LogoMark from '../components/LogoMark.vue'
import heroImg from '../assets/img/login-hero-1.jpg'

const router = useRouter()
const route = useRoute()
const form = reactive({ username: '', password: '' })
const loading = ref(false)

const features = [
  { icon: 'OfficeBuilding', title: '车场签约与公示价管理', desc: '改价全程留痕，来源如实标注' },
  { icon: 'Tickets', title: '订单流水与车牌核销', desc: '预约单一目了然，OCR 复核' },
  { icon: 'Printer', title: '凭证打印与账号管理', desc: '预约凭证即查即打' },
]

async function onSubmit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    const res = await webLogin(form.username, form.password)
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    setSession(res.data)
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string) || '/lots'
    router.push(redirect)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <!-- 左侧品牌区：实拍车库图 + 深蓝青压暗 -->
    <aside class="brand">
      <img :src="heroImg" alt="" class="brand__img" />
      <div class="brand__veil" aria-hidden="true" />
      <div class="brand-inner">
        <div class="brand-head">
          <LogoMark :size="52" />
          <div>
            <div class="brand-name">智慧停车</div>
            <div class="brand-en">SMART PARKING OPS</div>
          </div>
        </div>

        <h1>让每一个车位<br />都被看见、被预约</h1>
        <p class="brand-sub">平台运营后台 · 车场、预约、核销、余位统一调度</p>

        <ul class="feature-list">
          <li v-for="(f, i) in features" :key="f.title" :style="{ animationDelay: 0.25 + i * 0.1 + 's' }">
            <span class="feature-icon"><el-icon><component :is="f.icon" /></el-icon></span>
            <div>
              <div class="feature-title">{{ f.title }}</div>
              <div class="feature-desc">{{ f.desc }}</div>
            </div>
          </li>
        </ul>

        <div class="brand-foot">
          <span class="brand-foot__dot" />
          微信云开发托管 · 与车主 / 车场小程序共用同一套数据
        </div>
      </div>
    </aside>

    <!-- 右侧表单区 -->
    <main class="panel">
      <div class="login-card">
        <div class="mobile-brand">
          <LogoMark :size="40" />
          <span>智慧停车 · 平台运营后台</span>
        </div>

        <div class="form-head">
          <h2>管理员登录</h2>
          <p class="sub">使用平台运营或车场管理账号登录</p>
        </div>

        <el-form label-position="top" class="form" @submit.prevent="onSubmit">
          <el-form-item label="用户名">
            <el-input v-model="form.username" placeholder="请输入用户名" size="large" autocomplete="username">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="请输入密码"
              size="large"
              autocomplete="current-password"
              @keyup.enter="onSubmit"
            >
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button type="primary" size="large" :loading="loading" class="submit" @click="onSubmit">
            登 录
          </el-button>
        </el-form>

        <p class="panel-foot">仅限授权运营人员使用 · 登录行为将被记录</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(420px, 47%) 1fr;
  background: var(--sp-bg);
}

/* —— 品牌图区 —— */
.brand {
  position: relative;
  overflow: hidden;
  color: #fff;
  display: flex;
  align-items: flex-end;
  isolation: isolate;
}
.brand__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  z-index: -2;
}
.brand__veil {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(180deg, rgba(8, 17, 40, 0.32) 0%, rgba(8, 17, 40, 0.06) 36%, rgba(8, 17, 40, 0.72) 100%),
    linear-gradient(90deg, rgba(8, 17, 40, 0.58) 0%, rgba(8, 17, 40, 0.18) 58%, rgba(8, 17, 40, 0.02) 100%);
}
.brand-inner {
  position: relative;
  padding: 52px 56px 46px;
  width: 100%;
}
.brand-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 44px;
  animation: sp-fade-up 0.6s 0.05s ease both;
}
.brand-name {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.brand-en {
  font-family: var(--sp-font-num);
  font-size: 10.5px;
  letter-spacing: 0.28em;
  color: rgba(213, 232, 255, 0.75);
  margin-top: 3px;
}
.brand h1 {
  margin: 0;
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.28;
  text-shadow: 0 2px 20px rgba(4, 10, 26, 0.5);
  animation: sp-fade-up 0.6s 0.14s ease both;
}
.brand-sub {
  margin: 14px 0 34px;
  font-size: 15px;
  color: rgba(226, 237, 255, 0.88);
  animation: sp-fade-up 0.6s 0.2s ease both;
}
.feature-list {
  list-style: none;
  margin: 0 0 40px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.feature-list li {
  display: flex;
  align-items: center;
  gap: 13px;
  animation: sp-fade-up 0.55s ease both;
}
.feature-icon {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  flex-shrink: 0;
  background: rgba(10, 21, 48, 0.38);
  border: 1px solid rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 18px rgba(6, 14, 36, 0.25);
}
.feature-title {
  font-size: 14.5px;
  font-weight: 600;
}
.feature-desc {
  font-size: 12.5px;
  color: rgba(213, 232, 255, 0.72);
  margin-top: 2px;
}
.brand-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(213, 232, 255, 0.66);
  animation: sp-fade-up 0.6s 0.55s ease both;
}
.brand-foot__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.9);
}

/* —— 表单区 —— */
.panel {
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(50% 40% at 80% 0%, rgba(37, 99, 255, 0.06), transparent 70%),
    var(--sp-bg);
  padding: 40px 24px;
}
.login-card {
  width: 392px;
  max-width: 100%;
  animation: sp-fade-up 0.6s 0.1s ease both;
}
.mobile-brand {
  display: none;
}
.form-head h2 {
  margin: 0;
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--sp-text);
}
.sub {
  margin: 9px 0 30px;
  color: var(--sp-text-3);
  font-size: 14px;
}
.form {
  width: 100%;
}
.submit {
  width: 100%;
  margin-top: 6px;
  letter-spacing: 6px;
  font-weight: 700;
  height: 46px;
  font-size: 15px;
}
.panel-foot {
  margin: 26px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--sp-text-3);
}

/* —— 响应式 —— */
@media (max-width: 900px) {
  .login {
    grid-template-columns: 1fr;
  }
  .brand {
    display: none;
  }
  .panel {
    align-items: stretch;
    padding: 0;
    background: var(--sp-bg);
  }
  .login-card {
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
    padding: 0 22px 32px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    min-height: 100vh;
  }
  .mobile-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--sp-text);
    font-weight: 700;
    font-size: 16px;
    margin: 0 -22px 34px;
    padding: 40px 22px 34px;
    background: linear-gradient(158deg, #ffffff 0%, #eef4ff 100%);
    border-bottom: 1px solid var(--sp-border);
  }
  .panel-foot {
    margin-top: auto;
    padding-top: 28px;
  }
  .form-head h2,
  .form-head .sub {
    text-align: center;
  }
}
</style>
