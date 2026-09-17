<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSession, isOpsAdmin, clearSession } from '../store/auth'
import LogoMark from '../components/LogoMark.vue'

const route = useRoute()
const router = useRouter()
const session = computed(() => getSession())
const ops = computed(() => isOpsAdmin())

// 菜单分组：作业流 + 数据/系统（账号管理仅 ops_admin 可见）
const groups = [
  {
    label: '运营作业',
    items: [
      { path: '/lots', title: '车场管理', icon: 'OfficeBuilding' },
      { path: '/orders', title: '订单流水', icon: 'Tickets' },
      { path: '/verify', title: '车牌识别', icon: 'Camera' },
      { path: '/print', title: '打印管理', icon: 'Printer' },
    ],
  },
  {
    label: '数据与系统',
    items: [
      { path: '/dashboard', title: '运营看板', icon: 'DataLine' },
      { path: '/users', title: '账号管理', icon: 'User', adminOnly: true },
    ],
  },
]

const visibleGroups = computed(() =>
  groups.map((g) => ({ ...g, items: g.items.filter((m) => !m.adminOnly || ops.value) })).filter((g) => g.items.length),
)

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
    <el-aside width="240px" class="aside">
      <div class="aside-glow" aria-hidden="true" />
      <div class="brand">
        <LogoMark :size="42" />
        <div class="brand-text">
          <div class="name">智慧停车</div>
          <div class="tag">平台运营后台</div>
        </div>
      </div>

      <el-menu :default-active="route.path" router class="side-menu">
        <template v-for="g in visibleGroups" :key="g.label">
          <div class="side-group">{{ g.label }}</div>
          <el-menu-item v-for="m in g.items" :key="m.path" :index="m.path">
            <el-icon><component :is="m.icon" /></el-icon>
            <span class="side-label">{{ m.title }}</span>
          </el-menu-item>
        </template>
      </el-menu>

      <div class="aside-foot">
        <span class="dot" aria-hidden="true" />
        <span class="side-label">云开发托管 · v1.0</span>
      </div>
    </el-aside>

    <el-container class="body">
      <el-header class="header" height="60px">
        <div class="crumb">
          <span class="crumb-root">运营后台</span>
          <el-icon class="crumb-sep"><ArrowRight /></el-icon>
          <span class="crumb-cur">{{ route.meta.title }}</span>
        </div>
        <div class="user">
          <span class="role-chip">{{ roleLabel }}</span>
          <div class="avatar">{{ initial }}</div>
          <div class="user-meta">
            <span class="username">{{ session?.nickname || session?.username }}</span>
            <span class="user-role">{{ roleLabel }}账号</span>
          </div>
          <el-divider direction="vertical" />
          <el-button link class="logout-btn" @click="logout">
            <el-icon><SwitchButton /></el-icon>
            <span class="side-label">退出</span>
          </el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}

/* —— 浅色导航脊 —— */
.aside {
  position: relative;
  background: linear-gradient(184deg, var(--side-bg) 0%, var(--side-bg-2) 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--side-line);
  box-shadow: 1px 0 0 rgba(255, 255, 255, 0.6) inset;
}
/* 品牌区极淡蓝色光氛，浅色下只做层次不抢内容 */
.aside-glow {
  position: absolute;
  top: -120px;
  left: -60px;
  right: -60px;
  height: 300px;
  background: radial-gradient(60% 60% at 50% 30%, rgba(15, 23, 42, 0.05), transparent 70%);
  pointer-events: none;
}
.brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 18px 18px;
}
.brand-text .name {
  color: var(--side-text-strong);
  font-size: 16.5px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.01em;
}
.brand-text .tag {
  color: var(--side-text-2);
  font-size: 11px;
  margin-top: 2px;
  letter-spacing: 0.04em;
}

/* —— 菜单 —— */
.side-menu {
  position: relative;
  border-right: none;
  padding: 4px 12px;
  flex: 1;
  overflow-y: auto;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--side-text);
  --el-menu-hover-text-color: var(--el-color-primary);
  --el-menu-active-color: #fff;
  --el-menu-hover-bg-color: var(--side-hover);
  --el-menu-border-color: transparent;
}
.side-group {
  padding: 16px 12px 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--side-text-2);
  font-weight: 600;
}
.side-group:first-child {
  padding-top: 6px;
}
.side-menu :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  margin: 3px 0;
  border-radius: 10px;
  color: var(--side-text);
  font-weight: 500;
  font-size: 14px;
  position: relative;
}
.side-menu :deep(.el-menu-item .el-icon) {
  font-size: 18px;
  margin-right: 10px;
}
.side-menu :deep(.el-menu-item:hover) {
  background: var(--side-hover);
  color: var(--el-color-primary);
}
.side-menu :deep(.el-menu-item.is-active) {
  background: var(--grad-brand);
  color: #fff;
  font-weight: 600;
  box-shadow: var(--sp-shadow-brand);
}
.side-menu :deep(.el-menu-item.is-active::after) {
  content: '';
  position: absolute;
  right: 9px;
  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.9);
}

.aside-foot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  font-size: 11px;
  color: var(--side-text-2);
  border-top: 1px solid var(--side-line);
}
.aside-foot .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.45);
  flex-shrink: 0;
}

/* —— 顶栏 —— */
.body {
  min-width: 0;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(180%) blur(8px);
  border-bottom: 1px solid var(--sp-border);
  padding: 0 26px;
}
.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
}
.crumb-root {
  color: var(--sp-text-3);
}
.crumb-sep {
  font-size: 11px;
  color: var(--sp-text-3);
}
.crumb-cur {
  color: var(--sp-text);
  font-weight: 700;
}
.user {
  display: flex;
  align-items: center;
  gap: 11px;
}
.role-chip {
  font-size: 12px;
  font-weight: 600;
  color: #1a52e6;
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
  padding: 3px 10px;
  border-radius: 999px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--grad-brand);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.18);
  flex-shrink: 0;
}
.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.username {
  color: var(--sp-text);
  font-size: 13.5px;
  font-weight: 600;
}
.user-role {
  font-size: 11.5px;
  color: var(--sp-text-3);
}
.user :deep(.el-divider--vertical) {
  height: 22px;
  border-color: var(--sp-border-strong);
}
.logout-btn {
  font-weight: 500;
  gap: 4px;
}
.main {
  background: var(--sp-bg);
}

/* —— 窄屏：侧栏收为图标轨 —— */
@media (max-width: 1080px) {
  .aside {
    width: 72px !important;
  }
  .brand {
    justify-content: center;
    padding: 20px 0 16px;
  }
  .brand-text,
  .side-group,
  .side-label {
    display: none;
  }
  .side-menu {
    padding: 4px 10px;
  }
  .side-menu :deep(.el-menu-item) {
    justify-content: center;
    padding: 0 !important;
  }
  .side-menu :deep(.el-menu-item .el-icon) {
    margin-right: 0;
    font-size: 20px;
  }
  .side-menu :deep(.el-menu-item.is-active::after) {
    display: none;
  }
  .aside-foot {
    justify-content: center;
    padding: 14px 0;
  }
  .user-meta {
    display: none;
  }
}
@media (max-width: 720px) {
  .role-chip,
  .user .el-divider,
  .logout-btn .side-label {
    display: none;
  }
  .header {
    padding: 0 14px;
  }
  .main {
    padding: 16px 14px 22px;
  }
}
</style>
