import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '../store/auth'

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
  {
    path: '/',
    component: () => import('../layout/AdminLayout.vue'),
    redirect: '/lots',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '运营看板' } },
      { path: 'lots', name: 'lots', component: () => import('../views/Lots.vue'), meta: { title: '车场管理' } },
      { path: 'orders', name: 'orders', component: () => import('../views/Orders.vue'), meta: { title: '订单流水' } },
      { path: 'verify', name: 'verify', component: () => import('../views/Verify.vue'), meta: { title: '车牌识别' } },
      { path: 'print', name: 'print', component: () => import('../views/Print.vue'), meta: { title: '打印管理' } },
      { path: 'users', name: 'users', component: () => import('../views/Users.vue'), meta: { title: '账号管理' } },
    ],
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由守卫：未登录只能去 /login，已登录不再回登录页
router.beforeEach((to) => {
  if (to.name !== 'login' && !isLoggedIn()) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && isLoggedIn()) {
    return { path: '/lots' }
  }
  return true
})
