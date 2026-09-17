<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { webLogin } from '../api'
import { setSession } from '../store/auth'

const router = useRouter()
const route = useRoute()
const form = reactive({ username: '', password: '' })
const loading = ref(false)

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
    <!-- 左侧品牌区：深蓝紫渐变 + 同心圆几何，第一印象更鲜明 -->
    <aside class="brand">
      <div class="brand-inner">
        <div class="brand-logo">P</div>
        <h1>智慧停车</h1>
        <p class="brand-sub">平台运营后台</p>
        <ul class="brand-list">
          <li>车场签约与公示价管理</li>
          <li>订单流水查询与车牌核销</li>
          <li>预约凭证打印与账号管理</li>
        </ul>
      </div>
    </aside>

    <main class="panel">
      <div class="login-card">
        <div class="mobile-brand">智慧停车 · 平台运营后台</div>
        <h2>管理员登录</h2>
        <p class="sub">使用运营或车场管理账号登录</p>
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
          <el-button type="primary" size="large" :loading="loading" class="submit" @click="onSubmit">登 录</el-button>
        </el-form>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(380px, 46%) 1fr;
}
/* 品牌区：深蓝紫渐变 + 同心圆 + 柔和径向光 */
.brand {
  position: relative;
  overflow: hidden;
  background: linear-gradient(150deg, #1e3fd8 0%, #3b6cff 48%, #7c5cff 100%);
  color: #fff;
  display: flex;
  align-items: center;
  padding: 56px;
}
.brand::before {
  content: '';
  position: absolute;
  right: -160px;
  top: -160px;
  width: 460px;
  height: 460px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.16);
}
.brand::after {
  content: '';
  position: absolute;
  right: -90px;
  top: -90px;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.brand-inner {
  position: relative;
  max-width: 380px;
}
.brand-logo {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.26);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 30px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.brand h1 {
  margin: 0;
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
}
.brand-sub {
  margin: 10px 0 40px;
  font-size: 16px;
  opacity: 0.85;
}
.brand-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.brand-list li {
  position: relative;
  padding-left: 30px;
  font-size: 15px;
  opacity: 0.94;
}
.brand-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.55);
}

/* 表单区 */
.panel {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sp-bg);
  padding: 40px 24px;
}
.login-card {
  width: 380px;
  max-width: 100%;
}
.mobile-brand {
  display: none;
}
h2 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--sp-text);
}
.sub {
  margin: 8px 0 28px;
  color: var(--sp-text-3);
  font-size: 14px;
}
.form {
  width: 100%;
}
.submit {
  width: 100%;
  margin-top: 4px;
  letter-spacing: 4px;
  font-weight: 600;
}

/* 移动端：收起品牌区 */
@media (max-width: 768px) {
  .login {
    grid-template-columns: 1fr;
  }
  .brand {
    display: none;
  }
  .mobile-brand {
    display: block;
    text-align: center;
    margin-bottom: 24px;
    font-weight: 600;
    color: var(--sp-text);
    font-size: 16px;
  }
}
</style>
