// app.ts
import { CLOUD_ENV } from './config'
import { getCloudApi } from './services/cloud'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 基础库过低等极端环境没有 wx.cloud：不崩，后续服务层调用会给出各自明确报错
    getCloudApi()?.init({ env: CLOUD_ENV || undefined, traceUser: true })
    // 会话与用户建档在 services/cloud 的 ensureLogin（Task 4）里做，这里只负责 init
  },
})
