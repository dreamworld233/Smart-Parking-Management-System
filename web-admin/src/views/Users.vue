<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminCreateUser } from '../api'

const form = reactive({ username: '', password: '', role: 'lot_admin', nickname: '' })
const saving = ref(false)

async function submit() {
  if (!/^[A-Za-z0-9_]{4,32}$/.test(form.username)) {
    ElMessage.warning('用户名须为 4–32 位字母/数字/下划线')
    return
  }
  if (form.password.length < 6) {
    ElMessage.warning('密码至少 6 位')
    return
  }
  saving.value = true
  try {
    const res = await adminCreateUser({
      username: form.username,
      password: form.password,
      role: form.role,
      nickname: form.nickname,
    })
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success(`已创建账号 ${res.data.username}（${res.data.role}）`)
    form.username = ''
    form.password = ''
    form.nickname = ''
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <el-alert
      title="首次部署后，库中还没有任何「平台运营（ops_admin）」时，本页处于引导模式：可直接创建第一个运营账号；创建后引导自动关闭，之后只有 ops_admin 能建号。"
      type="warning"
      :closable="false"
      style="margin-bottom: 16px"
    />
    <el-card style="max-width: 480px">
      <template #header>创建管理员账号</template>
      <el-form label-width="80px">
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" placeholder="4–32 位字母/数字/下划线" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
        </el-form-item>
        <el-form-item label="角色" required>
          <el-select v-model="form.role" style="width: 100%">
            <el-option value="ops_admin" label="平台运营（ops_admin）" />
            <el-option value="lot_admin" label="车场管理（lot_admin）" />
          </el-select>
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="form.nickname" placeholder="可选" />
        </el-form-item>
        <el-button type="primary" :loading="saving" style="width: 100%" @click="submit">创建</el-button>
      </el-form>
    </el-card>
  </div>
</template>
