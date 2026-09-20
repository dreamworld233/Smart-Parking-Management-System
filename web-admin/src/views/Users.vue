<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminCreateUser } from '../api'
import PageHeader from '../components/PageHeader.vue'

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

const roles = [
  {
    key: 'ops_admin',
    name: '平台运营',
    code: 'ops_admin',
    icon: 'Avatar',
    color: '#2563ff',
    soft: '#edf3ff',
    points: ['车场签约、停用与改价等平台侧写操作', '创建运营 / 车场管理员账号', '可管理任意车场'],
  },
  {
    key: 'lot_admin',
    name: '车场管理',
    code: 'lot_admin',
    icon: 'OfficeBuilding',
    color: '#0891b2',
    soft: '#e5f8fc',
    points: ['日常运营（余位上报、核销）在车场端小程序', 'Web 端可查看车场与订单', '仅能修改自己绑定的车场'],
  },
]
</script>

<template>
  <div>
    <PageHeader title="账号管理" subtitle="创建运营或车场管理员账号" />

    <el-alert
      title="首次部署后，库中还没有任何「平台运营（ops_admin）」时，本页处于引导模式：可直接创建第一个运营账号；创建后引导自动关闭，之后只有 ops_admin 能建号。"
      type="warning"
      :closable="false"
      class="page-alert"
    />

    <div class="users-grid">
      <!-- 创建表单 -->
      <el-card shadow="never" class="form-card">
        <template #header>
          <div class="card-title">
            <span class="card-title__icon"><el-icon><Plus /></el-icon></span>
            创建管理员账号
          </div>
        </template>
        <el-form label-position="top">
          <el-form-item label="用户名" required>
            <el-input v-model="form.username" placeholder="4–32 位字母/数字/下划线">
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" required>
            <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
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
          <el-button type="primary" :loading="saving" class="submit" @click="submit">
            <el-icon><Check /></el-icon><span style="margin-left: 4px">创建账号</span>
          </el-button>
        </el-form>
      </el-card>

      <!-- 角色与安全说明 -->
      <el-card shadow="never" class="info-card">
        <template #header><span class="plain-title">角色与权限</span></template>

        <div v-for="r in roles" :key="r.key" class="role" :class="{ 'role--active': form.role === r.code }">
          <span class="role__icon" :style="{ background: r.soft, color: r.color }">
            <el-icon :size="20"><component :is="r.icon" /></el-icon>
          </span>
          <div class="role__main">
            <div class="role__head">
              <b>{{ r.name }}</b>
              <span class="num role__code">{{ r.code }}</span>
            </div>
            <ul>
              <li v-for="p in r.points" :key="p">{{ p }}</li>
            </ul>
          </div>
        </div>

        <div class="security">
          <div class="security__title"><el-icon><Lock /></el-icon> 安全机制</div>
          <ul>
            <li>口令绝不明文存储：每用户独立 salt，使用 Node 内置 <code>crypto.scrypt</code> 哈希。</li>
            <li>写操作一律走云函数，角色在云函数入口判定，不押在数据库安全规则上。</li>
            <li>不认识的角色按 driver 处理并拒绝登录后台。</li>
          </ul>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.page-alert {
  margin-bottom: 16px;
}
.users-grid {
  display: grid;
  grid-template-columns: 480px 1fr;
  gap: 16px;
  align-items: start;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
  font-size: 15px;
}
.card-title__icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.plain-title {
  font-weight: 700;
  font-size: 15px;
}
.submit {
  width: 100%;
  margin-top: 4px;
}

/* 角色卡 */
.role {
  display: flex;
  gap: 13px;
  padding: 15px;
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius);
  margin-bottom: 12px;
  background: var(--sp-surface);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.role--active {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 0 0 3px rgba(37, 99, 255, 0.08);
}
.role__icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.role__head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 6px;
}
.role__head b {
  font-size: 14px;
  color: var(--sp-text);
}
.role__code {
  font-size: 11px;
  color: var(--sp-text-3);
  background: var(--sp-surface-2);
  border: 1px solid var(--sp-border);
  border-radius: 5px;
  padding: 1px 7px;
}
.role__main ul {
  margin: 0;
  padding-left: 16px;
  color: var(--sp-text-2);
  font-size: 12.5px;
  line-height: 1.75;
}

.security {
  margin-top: 4px;
  padding: 15px 16px;
  border-radius: var(--sp-radius);
  background: var(--sp-surface-2);
  border: 1px solid var(--sp-border);
}
.security__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 700;
  font-size: 13.5px;
  color: var(--sp-text);
  margin-bottom: 8px;
}
.security__title .el-icon {
  color: #0d9488;
}
.security ul {
  margin: 0;
  padding-left: 16px;
  color: var(--sp-text-2);
  font-size: 12.5px;
  line-height: 1.8;
}
.security code {
  font-family: var(--sp-font-num);
  background: #fff;
  border: 1px solid var(--sp-border);
  border-radius: 4px;
  padding: 0 5px;
  font-size: 11.5px;
  color: #1a52e6;
}

@media (max-width: 960px) {
  .users-grid {
    grid-template-columns: 1fr;
  }
}
</style>
