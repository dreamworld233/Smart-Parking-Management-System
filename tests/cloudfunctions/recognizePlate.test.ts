// recognizePlate 云函数（CommonJS .js）的离线测试。
//
// 复用 adminGetLot 的 stub 手法，加：cloud.downloadFile 返回内存 buffer、
// jest.mock('tencentcloud-sdk-nodejs') 模拟 LicensePlateOCR。
// 密钥走 process.env（云函数环境变量），测试里给假值验证「有密钥才调 SDK」。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
/** mock downloadFile 的返回内容（buffer 或抛错） */
let mockFileContent: Buffer | null
let mockDownloadError: boolean
/** mock OCR 结果：{ plates } 或抛错 */
let mockOcrResult: { plates: { Plate: string; PlateConfidence: number }[] } | null
let mockOcrError: Error | null
/** 记录 OCR 调用时拿到的 base64，验证图片确实传过去了 */
let capturedBase64: string | null

jest.mock(
  'wx-server-sdk',
  () => {
    const mkCollection = (collName: string) => ({
      where: (query: Record<string, unknown>) => ({
        limit: () => ({
          get: async () => ({
            data: [...mockStore[collName].values()]
              .filter(d => Object.entries(query).every(([k, v]) => d[k] === v))
              .map(d => ({ ...d })),
          }),
        }),
      }),
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      getWXContext: () => ({ OPENID: mockOpenid }),
      downloadFile: async ({ fileID }: { fileID: string }) => {
        if (mockDownloadError) throw new Error('downloadFile failed')
        if (!mockFileContent) throw new Error('document download fail')
        return { fileContent: mockFileContent }
      },
      database: () => ({ collection: (name: string) => mkCollection(name) }),
    }
  },
  { virtual: true },
)

jest.mock('tencentcloud-sdk-nodejs', () => ({
  ocr: {
    v20181119: {
      Client: class {
        async LicensePlateOCR({ ImageBase64 }: { ImageBase64: string }) {
          capturedBase64 = ImageBase64
          if (mockOcrError) throw mockOcrError
          if (!mockOcrResult) throw new Error('no ocr result')
          return { Plates: mockOcrResult.plates }
        }
      },
    },
  },
}), { virtual: true })

// eslint-disable-next-line @typescript-eslint/no-var-requires
const recognizePlate = require('../../cloudfunctions/recognizePlate/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = recognizePlate.main

function seedUser(overrides: Record<string, unknown> = {}): void {
  mockStore.users.set('openid-test-1', {
    _id: 'openid-test-1',
    _openid: 'openid-test-1',
    role: 'lot_admin',
    ...overrides,
  })
}

describe('recognizePlate', () => {
  beforeEach(() => {
    mockStore = { users: new Map() }
    mockOpenid = 'openid-test-1'
    mockFileContent = Buffer.from('fake-image-bytes')
    mockDownloadError = false
    mockOcrResult = null
    mockOcrError = null
    capturedBase64 = null
    // 云函数环境变量（真实密钥在控制台配，测试用假值只验证「有密钥才走 SDK」）
    process.env.TENCENT_SECRET_ID = 'test-secret-id'
    process.env.TENCENT_SECRET_KEY = 'test-secret-key'
  })

  it('无微信身份 → NO_AUTH', async () => {
    mockOpenid = null
    expect((await main({ fileID: 'cloud://x/1.png' })).code).toBe('NO_AUTH')
  })

  it('缺 fileID → BAD_REQUEST', async () => {
    expect((await main({})).code).toBe('BAD_REQUEST')
  })

  it('非车场管理员 → NO_AUTH', async () => {
    seedUser({ role: 'driver' })
    expect((await main({ fileID: 'cloud://x/1.png' })).code).toBe('NO_AUTH')
  })

  it('图片下载失败 → BAD_FILE', async () => {
    seedUser()
    mockDownloadError = true
    expect((await main({ fileID: 'cloud://x/1.png' })).code).toBe('BAD_FILE')
  })

  it('缺少密钥环境变量 → NO_CREDENTIAL（不调 SDK，报配置错误）', async () => {
    seedUser()
    delete process.env.TENCENT_SECRET_ID
    const r = await main({ fileID: 'cloud://x/1.png' })
    expect(r.code).toBe('NO_CREDENTIAL')
  })

  it('识别成功：返回 plate + confidence，图片 base64 传给了 SDK', async () => {
    seedUser()
    mockOcrResult = { plates: [{ Plate: '皖A88888', PlateConfidence: 98 }] }
    const r = await main({ fileID: 'cloud://x/1.png' })
    expect(r.code).toBe(0)
    expect(r.data.plate).toBe('皖A88888')
    expect(r.data.confidence).toBe(98)
    expect(r.data.fileID).toBe('cloud://x/1.png')
    // 图片确实传过去了：base64 解码回来等于原 buffer
    expect(Buffer.from(capturedBase64!, 'base64').equals(mockFileContent!)).toBe(true)
  })

  it('OCR 抛错（如密钥未授权 UnauthorizedOperation）→ OCR_FAILED', async () => {
    seedUser()
    mockOcrError = new Error('UnauthorizedOperation: not authorized')
    const r = await main({ fileID: 'cloud://x/1.png' })
    expect(r.code).toBe('OCR_FAILED')
    expect(r.message).toContain('UnauthorizedOperation')
  })

  it('OCR 返回无车牌 → OCR_NO_PLATE', async () => {
    seedUser()
    mockOcrResult = { plates: [] }
    expect((await main({ fileID: 'cloud://x/1.png' })).code).toBe('OCR_NO_PLATE')
  })

  it('低置信度：原样返回 confidence，由前端决定是否降级（不做「猜」）', async () => {
    seedUser()
    mockOcrResult = { plates: [{ Plate: '皖A88888', PlateConfidence: 40 }] }
    const r = await main({ fileID: 'cloud://x/1.png' })
    expect(r.code).toBe(0)
    expect(r.data.confidence).toBe(40)
  })

  it('debug 分支：有密钥 → 返回掩码后的前 6 后 4，不调 SDK', async () => {
    process.env.TENCENT_SECRET_ID = 'AKIDabcdef1234567890'
    process.env.TENCENT_SECRET_KEY = 'secretkey1234567890'
    const r = await main({ fileID: 'cloud://x/1.png', debug: true })
    expect(r.code).toBe(0)
    expect(r.data.debug).toBe(true)
    expect(r.data.secretId).toBe('AKIDab…7890')
    expect(r.data.secretKey).toBe('secret…7890')
    expect(capturedBase64).toBeNull() // 没走 SDK
  })

  it('debug 分支：密钥缺失 → NO_CREDENTIAL', async () => {
    delete process.env.TENCENT_SECRET_ID
    const r = await main({ fileID: 'cloud://x/1.png', debug: true })
    expect(r.code).toBe('NO_CREDENTIAL')
  })
})
