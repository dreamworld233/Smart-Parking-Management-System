// 【本地验收预览用】不影响 npm run dev / npm run build。
// 用法：npx vite --config vite.shot.config.ts   → http://localhost:5199/?mock=default
// 做两件事：① 把 cloudbase 换成假数据模块；② 注入登录态，免登录直接进内页。
// 若要看登录页，加 ?auth=0 即可（不注入登录态）。
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
    {
      // 相对路径导入（./cloudbase、../api/cloudbase）用 resolve.alias 拦不住，这里 pre 阶段直接改指向
      name: 'shot-swap-cloudbase',
      enforce: 'pre',
      resolveId(source: string) {
        if (/^(\.\.?\/)+(api\/)?cloudbase$/.test(source)) {
          return fileURLToPath(new URL('./src/api/__shot-cloudbase.ts', import.meta.url))
        }
        return null
      },
    },
    {
      name: 'shot-seed-session',
      transformIndexHtml() {
        return [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            children: `try{
  var q = new URLSearchParams(location.search);
  localStorage.setItem('spms_shot_mock', q.get('mock') || 'default');
  if (q.get('auth') === '0') {
    localStorage.removeItem('spms_web_session');
  } else {
    localStorage.setItem('spms_web_session', JSON.stringify({
      token:'mock', userId:'u_admin', role: q.get('role') || 'ops_admin',
      username:'admin', nickname:'运营', expiresAt: Date.now()+86400000
    }));
  }
}catch(e){}`,
          },
        ]
      },
    },
  ],
  server: { port: 5199 },
})
