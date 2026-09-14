// app.ts
App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 会话在 Task 10 的 api 层按需建立，这里不做任何请求
  },
})
