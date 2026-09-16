<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSession, isOpsAdmin, clearSession } from '../store/auth'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession())
const ops = computed(() => isOpsAdmin())

const menu = [
  { path: '/lots', title: '车场管理', icon: 'OfficeBuilding' },
  { path: '/orders', title: '订单流水', icon: 'Tickets' },
  { path: '/verify', title: '车牌识别', icon: 'Camera' },
  { path: '/print', title: '打印管理', icon: 'Printer' },
  { path: '/dashboard', title: '运营看板', icon: 'DataLine' },
  { path: '/users', title: '账号管理', icon: 'User', adminOnly: true },
]

const visibleMenu = computed(() => menu.filter((m) => !m.adminOnly || ops.value))

const roleLabel = computed(() => (session.value?.role === 'ops_admin' ? '平台运营' : '车场管理'))
const initial = computed(() => {
  const name = session.value?.nickname || session.value?.username || '管'
  return name.charAt(0).toUpperCase()
})

function logout() {
  clearSession()
  router.push('/login')
}
</script>

<template>
  <el-container class="layout">
    <el-aside width="232px" class="aside">
      <div class="brand">
        <div class="logo">P</div>
        <div class="brand-text">
          <div class="name">智慧停车</div>
          <div class="tag">平台运营后台</div>
        </div>
      </div>
      <el-menu :default-active="route.path" router class="side-menu">
        <el-menu-item v-for="m in visibleMenu" :key="m.path" :index="m.path">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="page-title">{{ route.meta.title }}</div>
        <div class="user">
          <el-tag size="small" effect="plain">{{ roleLabel }}</el-tag>
          <div class="avatar">{{ initial }}</div>
          <span class="username">{{ session?.nickname || session?.username }}</span>
          <el-button link type="primary" @click="logout">退出登录</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  background: var(--sp-bg);
  border-right: 1px solid var(--sp-border);
  display: flex;
  flex-direction: column;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 20px 16px;
}
.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2f6bff, #6a5cff);
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.brand-text .name {
  color: var(--sp-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
}
.brand-text .tag {
  color: var(--sp-text-3);
  font-size: 11px;
}
.side-menu {
  border-right: none;
  padding: 8px 12px;
  flex: 1;
}
.side-menu :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  margin: 2px 0;
  border-radius: 8px;
  color: var(--sp-text-2);
}
.side-menu :deep(.el-menu-item:hover) {
  background: #f1f3f6;
  color: var(--sp-text);
}
.side-menu :deep(.el-menu-item.is-active) {
  background: #eef4ff;
  color: #2f6bff;
  font-weight: 600;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid var(--sp-border);
}
.page-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--sp-text);
}
.user {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2f6bff, #6a5cff);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.username {
  color: var(--sp-text);
  font-size: 14px;
}
.main {
  background: var(--sp-bg);
}
</style>
