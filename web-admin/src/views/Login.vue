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
  <div class="login-wrap">
    <div class="login-card">
      <div class="logo">P</div>
      <h1>智慧停车</h1>
      <p class="sub">平台运营后台 · 管理员登录</p>
      <el-form label-position="top" class="form" @submit.prevent="onSubmit">
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" size="large">
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
            @keyup.enter="onSubmit"
          >
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-button type="primary" size="large" :loading="loading" class="submit" @click="onSubmit">登 录</el-button>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sp-bg);
  padding: 24px;
}
.login-card {
  width: 400px;
  max-width: 100%;
  background: #fff;
  border: 1px solid var(--sp-border);
  border-radius: 16px;
  box-shadow: 0 8px 30px rgba(16, 24, 40, 0.06);
  padding: 40px 36px;
  text-align: center;
}
.logo {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  margin: 0 auto 16px;
  background: linear-gradient(135deg, #2f6bff, #6a5cff);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
h1 {
  margin: 0;
  font-size: 20px;
  color: var(--sp-text);
}
.sub {
  margin: 6px 0 28px;
  color: var(--sp-text-3);
  font-size: 13px;
}
.form {
  text-align: left;
}
.submit {
  width: 100%;
  margin-top: 4px;
  letter-spacing: 4px;
  font-weight: 600;
}
</style>
