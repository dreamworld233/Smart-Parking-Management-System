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
/**
 * 打矩阵接口的用例先调它，给上一发留出配额窗口。
 *
 * 矩阵按目的地限流（实测约 5 点/秒），而同一张 Key 是几个测试文件共享的：
 * 不开间隔的话，前一发 3 点 + 后一发 3 点落在同一秒 → 后一发拿到 status 120，
 * 断言失败的样子像代码 bug，其实是测试互相挤
 */
export async function throttleMatrix(ms = 1200): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

export function installWxRequestShim(): void {
  // 存储也补一份内存实现：lot.ts 的搜索缓存要走 wx.setStorageSync，
  // 少了它 live 测试会在读缓存那步直接抛
  const memory: Record<string, unknown> = {}
  const g = globalThis as unknown as {
    wx: {
      request: (o: RequestOption) => void
      getStorageSync: (k: string) => unknown
      setStorageSync: (k: string, v: unknown) => void
    }
  }
  g.wx = {
    getStorageSync: k => memory[k],
    setStorageSync: (k, v) => {
      memory[k] = v
    },
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
