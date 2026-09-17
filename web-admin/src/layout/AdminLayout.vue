<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSession, isOpsAdmin, clearSession } from '../store/auth'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession())
const ops = computed(() => isOpsAdmin())

// 菜单：前五项为通用功能，账号管理仅 ops_admin 可见
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
    <el-aside width="236px" class="aside">
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
      <div class="aside-foot">
        <span class="dot" aria-hidden="true" />
        <span>云开发托管 · v1.0</span>
      </div>
    </el-aside>

    <el-container class="body">
      <el-header class="header">
        <div class="crumb">
          <span class="crumb-root">运营后台</span>
          <span class="crumb-sep">/</span>
          <span class="crumb-cur">{{ route.meta.title }}</span>
        </div>
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
  background: linear-gradient(180deg, var(--side-bg) 0%, var(--side-bg-2) 100%);
  display: flex;
  flex-direction: column;
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 22px 20px 16px;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--grad-brand);
  color: #fff;
  font-weight: 700;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(59, 108, 255, 0.4);
}
.brand-text .name {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.01em;
}
.brand-text .tag {
  color: var(--side-text-2);
  font-size: 11px;
}

/* 侧栏菜单：深色底 + 渐变激活态 */
.side-menu {
  border-right: none;
  padding: 6px 12px;
  flex: 1;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--side-text);
  --el-menu-hover-text-color: #fff;
  --el-menu-active-color: #fff;
  --el-menu-hover-bg-color: var(--side-hover);
  --el-menu-border-color: transparent;
}
.side-menu :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  margin: 3px 0;
  border-radius: 10px;
  color: var(--side-text);
  font-weight: 500;
}
.side-menu :deep(.el-menu-item .el-icon) {
  font-size: 17px;
}
.side-menu :deep(.el-menu-item:hover) {
  background: var(--side-hover);
  color: #fff;
}
.side-menu :deep(.el-menu-item.is-active) {
  background: var(--grad-brand);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(59, 108, 255, 0.36);
}
.aside-foot {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 14px 20px;
  font-size: 11px;
  color: var(--side-text-2);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.aside-foot .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #34d399;
}

.body {
  min-width: 0;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid var(--sp-border);
}
.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.crumb-root {
  color: var(--sp-text-3);
}
.crumb-sep {
  color: var(--sp-text-3);
}
.crumb-cur {
  color: var(--sp-text);
  font-weight: 600;
}
.user {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--grad-brand);
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
