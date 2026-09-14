// app.ts
import { CLOUD_ENV } from './config'
import { ensureLogin, getCloudApi } from './services/cloud'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    const api = getCloudApi()
    // 基础库过低等极端环境没有 wx.cloud：不崩，后续服务层调用会给出各自明确报错
    api?.init({ env: CLOUD_ENV || undefined, traceUser: true })
    // 建档 fire-and-forget：失败只告警不阻塞启动，角色页与后续写操作自会重试
    if (api) {
      void ensureLogin().then(r => {
        if (!r.ok) console.warn('ensureLogin failed:', r.code, r.message)
      })
    }
  },
})
