import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import { router } from './router'
import './styles/theme.css'

const app = createApp(App)
app.use(ElementPlus, { locale: zhCn })
// 全局注册所有图标：模板里可直接 <OfficeBuilding /> 等
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
app.use(router)
app.mount('#app')

// 动效安全闸：双 rAF 确认渲染时钟在跑之后才允许入场动画；
// 若时钟被冻结（后台标签 / 某些无头渲染），类名不加，CSS 会让所有内容保持可见终态。
const rootEl = document.documentElement
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  rootEl.classList.add('motion-ready')
} else {
  requestAnimationFrame(() => requestAnimationFrame(() => rootEl.classList.add('motion-ready')))
}
