/**
 * 全项目触碰 wx.cloud 形状的唯一入口。
 * 不扩全局 typings：云开发 API 面很大，d.ts 里抄官方签名迟早失配，
 * 这里只声明本项目实际用到的那一小块，多出来的能力一概不认
 */
export interface CloudDb {
  collection(name: string): {
    where(cond: Record<string, unknown>): {
      limit(n: number): {
        get(): Promise<{ data: Record<string, unknown>[] }>
      }
    }
  }
}

export interface CloudApi {
  init(opt: { env?: string; traceUser?: boolean }): void
  callFunction(opt: { name: string; data?: Record<string, unknown> }): Promise<{ result: unknown }>
  database(): CloudDb
}

/**
 * 懒取 wx.cloud，而不是模块加载时快照成常量：
 * 测试在 beforeEach 里才 stub 全局 wx，加载时就固化会让 stub 永远不生效；
 * 运行时 wx 恒存在，取不到是基础库过低，返回 null，调用方给明确报错
 */
export function getCloudApi(): CloudApi | null {
  try {
    return (wx as unknown as { cloud?: CloudApi }).cloud ?? null
  } catch {
    return null
  }
}
