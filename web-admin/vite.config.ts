import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 部署到云开发静态网站托管时，若挂在子路径下需改 base；默认根路径即可。
export default defineConfig({
  plugins: [vue()],
  server: { port: 5173 },
  build: { outDir: 'dist' },
})
