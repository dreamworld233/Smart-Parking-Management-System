import { request as httpsRequest } from 'https'

interface RequestOption {
  url: string
  timeout?: number
  success: (res: { data: unknown; statusCode: number }) => void
  fail: (err: { errMsg: string }) => void
}

/**
 * 把 `wx.request` 接到 Node 的 https 上，好让 services 里的真实实现
 * （含 URL 拼装、信封解析、重试）跑在 node 里。只给 live 测试用，
 * 不进默认单测套件 —— 那套必须能在断网机器上跑。
 */
export function installWxRequestShim(): void {
  const g = globalThis as unknown as { wx: { request: (o: RequestOption) => void } }
  g.wx = {
    request: o => {
      const req = httpsRequest(o.url, { timeout: o.timeout }, res => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          body += chunk
        })
        res.on('end', () => {
          try {
            o.success({ data: JSON.parse(body), statusCode: res.statusCode ?? 0 })
          } catch {
            o.fail({ errMsg: 'request:fail body is not json' })
          }
        })
      })
      req.on('timeout', () => {
        req.destroy()
        o.fail({ errMsg: 'request:fail timeout' })
      })
      req.on('error', err => o.fail({ errMsg: `request:fail ${err.message}` }))
      req.end()
    },
  }
}
