/// <reference types="miniprogram-api-typings" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo
    session?: { token: string; userId: string; expireAt: number } | null
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback
}
