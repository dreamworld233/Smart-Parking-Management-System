// 故意用假 Key 打真接口：确认服务端错误码确实落进 QQMapError 分支、且不重试。
// jest.mock 是按文件生效的，所以这一条单独一个文件，免得污染真 Key 的那组
jest.mock('../../miniprogram/config', () => ({
  QQMAP_KEY: 'INVALIDKEY',
  REQUEST_TIMEOUT_MS: 3000,
  DEFAULT_RADIUS_M: 3000,
}))

import { QQMapError, searchByKeyword } from '../../miniprogram/services/qqmap'
import { installWxRequestShim } from './wx-node-shim'

describe('qqmap 真接口 · 失败路径', () => {
  let calls = 0

  beforeAll(() => {
    installWxRequestShim()
    const g = globalThis as unknown as {
      wx: { request: (o: { url: string; success: (r: { data: unknown }) => void; fail: (e: { errMsg: string }) => void }) => void }
    }
    const real = g.wx.request
    g.wx.request = o => {
      calls++
      real(o)
    }
  })

  it(
    'Key 格式错误时抛 QQMapError，且只打一次（业务错误不重试）',
    async () => {
      calls = 0
      await expect(searchByKeyword('泉城广场', '济南')).rejects.toBeInstanceOf(QQMapError)
      // 重试会白烧每日配额，而 311 这种错误重试一万次也还是 311
      expect(calls).toBe(1)
    },
    20000,
  )

  it(
    '抛出的错误带服务端原始状态码与文案',
    async () => {
      // 页面要能区分「Key 错」（配置问题）和「网络失败」（可重试），
      // code 与 message 原样带出来才做得到
      const err = await searchByKeyword('泉城广场', '济南').then(
        () => null,
        (e: unknown) => e as QQMapError,
      )

      expect(err).toBeInstanceOf(QQMapError)
      expect(err?.code).toBe(311)
      expect(err?.message).toContain('key')
    },
    20000,
  )
})
