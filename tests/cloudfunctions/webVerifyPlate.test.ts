// webVerifyPlate 云函数（CommonJS .js）的离线测试。
//
// 复用 verifyReservation 的 stub 手法（doc().get() + where().limit().get() + CAS update + add）。
// web 鉴权走自签票据（auth.js requireOps），测试里用 signSessionToken 发真票据。
// 测试重点是：识别与核销分离（mode=ocr 不核销）、plate 车牌一致性校验、
// 低置信度原样透传、entry_logs 留痕（method 'plate' + confidence + imageFileID）、CAS 并发。

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockCasConflictOnce: boolean
let mockCasConflictUsed: boolean
let mockOcrImpl: ((payload: { ImageBase64: string }) => Promise<Record<string, unknown>>) | null
let mockImageBase64: string

jest.mock(
  'wx-server-sdk',
  () => {
    const applyData = (doc: Record<string, unknown>, data: Record<string, unknown>): void => {
      for (const [k, v] of Object.entries(data)) {
        const op = v as { __op?: string; value?: number } | null
        if (op && typeof op === 'object' && op.__op === 'inc') {
          const base = typeof doc[k] === 'number' ? (doc[k] as number) : 0
          doc[k] = base + (op.value ?? 0)
        } else {
          doc[k] = v
        }
      }
    }

    const mkDocApi = (collName: string, id: string) => ({
      get: async () => {
        const doc = mockStore[collName].get(id)
        if (!doc) throw new Error('document.get:fail document not exists')
        return { data: { ...doc } }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const doc = mockStore[collName].get(id)
        if (!doc) return { stats: { updated: 0 } }
        applyData(doc, data)
        return { stats: { updated: 1 } }
      },
    })

    const matchQuery = (query: Record<string, unknown>) => (doc: Record<string, unknown>): boolean =>
      Object.entries(query).every(([k, v]) => doc[k] === v)

    const mkCollection = (collName: string) => ({
      doc: (id: string) => mkDocApi(collName, id),
      add: async ({ data }: { data: Record<string, unknown> }) => {
        const id = 'auto_' + (mockStore[collName].size + 1)
        mockStore[collName].set(id, { ...data, _id: id })
        return { _id: id }
      },
      where: (query: Record<string, unknown>) => {
        const filtered = () =>
          [...mockStore[collName].values()].filter(matchQuery(query)).sort((a, b) => {
            const ca = Number(a.createdAt ?? 0)
            const cb = Number(b.createdAt ?? 0)
            return ca - cb
          })
        const getFirst = async () => ({ data: filtered().slice(0, 1).map((d) => ({ ...d })) })
        return {
          orderBy: () => ({ limit: () => ({ get: getFirst }) }),
          limit: () => ({ get: getFirst }),
          update: async ({ data }: { data: Record<string, unknown> }) => {
            if (collName === 'reservations' && mockCasConflictOnce && !mockCasConflictUsed) {
              // 模拟并发方抢先核销：预检读到的还是 pending_entry（通过），
              // 但 CAS 更新时状态已变 → updated 0，走 ALREADY_PROCESSED 分支
              mockCasConflictUsed = true
              return { stats: { updated: 0 } }
            }
            for (const [id, doc] of mockStore[collName]) {
              if (matchQuery(query)(doc)) {
                Object.assign(doc, data)
                return { stats: { updated: 1 } }
              }
            }
            return { stats: { updated: 0 } }
          },
        }
      },
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      downloadFile: jest.fn(async () => ({ fileContent: Buffer.from(mockImageBase64, 'base64') })),
      database: () => ({
        command: { inc: (n: number) => ({ __op: 'inc', value: n }) },
        collection: (name: string) => mkCollection(name),
      }),
    }
  },
  { virtual: true },
)

jest.mock(
  'tencentcloud-sdk-nodejs',
  () => ({
    ocr: {
      v20181119: {
        Client: class {
          async LicensePlateOCR(payload: { ImageBase64: string }) {
            if (!mockOcrImpl) throw new Error('mockOcrImpl 未设置')
            return mockOcrImpl(payload)
          }
        },
      },
    },
  }),
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const webVerifyPlate = require('../../cloudfunctions/webVerifyPlate/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = webVerifyPlate.main
// eslint-disable-next-line @typescript-eslint/no-var-requires
const auth = require('../../cloudfunctions/webVerifyPlate/auth.js')

const SECRET = 'test-session-secret-abc123'
function opsToken(role = 'ops_admin', userId = 'web_ops_1'): string {
  return auth.signSessionToken({ userId, role, exp: Date.now() + 60 * 1000 })
}

function seedReservation(id: string, overrides: Record<string, unknown> = {}): void {
  mockStore.reservations.set(id, {
    _id: id,
    lotId: 'lot1',
    lotName: '合肥大学(南艳湖校区)停车场',
    orderNo: 'SO' + id.toUpperCase(),
    plateNo: '京A12345',
    arriveTime: Date.now() + 60 * 60 * 1000,
    verifyCode: '123456',
    status: 'pending_entry',
    createdAt: Date.now(),
    ...overrides,
  })
}

describe('webVerifyPlate', () => {
  beforeEach(() => {
    mockStore = { users: new Map(), lots: new Map(), reservations: new Map(), entry_logs: new Map() }
    mockCasConflictOnce = false
    mockCasConflictUsed = false
    mockOcrImpl = null
    mockImageBase64 = 'aW1hZ2UtYnl0ZXM=' // "image-bytes"
    process.env.WEB_ADMIN_SESSION_SECRET = SECRET
    process.env.TENCENT_SECRET_ID = 'AKIDtest'
    process.env.TENCENT_SECRET_KEY = 'secretkey-test'
  })

  it('无票据 → NO_AUTH', async () => {
    expect((await main({ mode: 'code', verifyCode: '123456' })).code).toBe('NO_AUTH')
    expect((await main({ token: 'bad.token.here', mode: 'code', verifyCode: '123456' })).code).toBe('NO_AUTH')
  })

  it('lot_admin 走 webVerifyPlate → FORBIDDEN（这里只许 ops_admin）', async () => {
    const r = await main({ token: opsToken('lot_admin'), mode: 'code', verifyCode: '123456' })
    expect(r.code).toBe('FORBIDDEN')
  })

  it('未知 mode → BAD_REQUEST', async () => {
    expect((await main({ token: opsToken(), mode: 'x' })).code).toBe('BAD_REQUEST')
  })

  // —— OCR 识别（不核销） ——

  it('mode=ocr 缺图片 → BAD_REQUEST', async () => {
    expect((await main({ token: opsToken(), mode: 'ocr' })).code).toBe('BAD_REQUEST')
  })

  it('mode=ocr 未配置 OCR 密钥 → OCR_NOT_CONFIGURED', async () => {
    delete process.env.TENCENT_SECRET_ID
    const r = await main({ token: opsToken(), mode: 'ocr', imageFileID: 'cloud://x/plate.png' })
    expect(r.code).toBe('OCR_NOT_CONFIGURED')
  })

  it('mode=ocr 识别成功且命中候选 → 返回 candidate，**不核销**', async () => {
    seedReservation('r1', { plateNo: '皖A12345', createdAt: Date.now() })
    mockOcrImpl = async () => ({
      LicensePlateInfos: [{ Number: '皖A·12345', Confidence: 96 }],
    })
    const r = await main({ token: opsToken(), mode: 'ocr', imageFileID: 'cloud://x/plate.png' })
    expect(r.code).toBe(0)
    expect(r.data.matched).toBe(true)
    expect(r.data.plate).toBe('皖A12345') // 归一：去分隔点
    expect(r.data.confidence).toBe(96)
    expect(r.data.candidate).toMatchObject({ reservationId: 'r1', orderNo: 'SOR1', lotName: expect.any(String) })
    // 不核销：预约仍 pending_entry，无 entry_logs
    expect(mockStore.reservations.get('r1')!.status).toBe('pending_entry')
    expect(mockStore.entry_logs.size).toBe(0)
  })

  it('mode=ocr 识别字段走 LicensePlateInfos（SDK 4.x 真模型），顶层 Number 兜底', async () => {
    // 多牌/标准返回：LicensePlateInfos[0]
    mockOcrImpl = async () => ({ LicensePlateInfos: [{ Number: '京A88888', Confidence: 99 }] })
    let r = await main({ token: opsToken(), mode: 'ocr', imageFileID: 'cloud://x/a.png' })
    expect(r.data.plate).toBe('京A88888')
    // 兜底：顶层 Number（无 LicensePlateInfos）
    mockOcrImpl = async () => ({ Number: '沪B66666', Confidence: 91 })
    r = await main({ token: opsToken(), mode: 'ocr', imageFileID: 'cloud://x/b.png' })
    expect(r.data.plate).toBe('沪B66666')
    expect(r.data.confidence).toBe(91)
  })

  it('mode=ocr 低置信度原样透传，不做硬拒', async () => {
    seedReservation('r1', { plateNo: '皖A12345' })
    mockOcrImpl = async () => ({ LicensePlateInfos: [{ Number: '皖A12345', Confidence: 55 }] })
    const r = await main({ token: opsToken(), mode: 'ocr', imageFileID: 'cloud://x/plate.png' })
    expect(r.code).toBe(0)
    expect(r.data.matched).toBe(true)
    expect(r.data.confidence).toBe(55)
    expect(mockStore.reservations.get('r1')!.status).toBe('pending_entry')
  })

  it('mode=ocr 识别到车牌但无待入场预约 → matched:false，提示转手动', async () => {
    mockOcrImpl = async () => ({ LicensePlateInfos: [{ Number: '皖C77777', Confidence: 90 }] })
    const r = await main({ token: opsToken(), mode: 'ocr', imageFileID: 'cloud://x/plate.png' })
    expect(r.code).toBe(0)
    expect(r.data.matched).toBe(false)
    expect(r.data.plate).toBe('皖C77777')
    expect(r.data.candidate).toBeUndefined()
  })

  it('mode=ocr 未识别到车牌 → OCR_NO_PLATE', async () => {
    mockOcrImpl = async () => ({ LicensePlateInfos: [] })
    const r = await main({ token: opsToken(), mode: 'ocr', imageFileID: 'cloud://x/plate.png' })
    expect(r.code).toBe('OCR_NO_PLATE')
  })

  // —— mode=plate 核销（车牌一致性校验） ——

  it('mode=plate 车牌一致 → 核销 + entry_logs 记 method plate + confidence + imageFileID', async () => {
    seedReservation('r1')
    const r = await main({
      token: opsToken(),
      mode: 'plate',
      reservationId: 'r1',
      plateNo: '京A12345',
      confidence: 96,
      imageFileID: 'cloud://x/plate.png',
    })
    expect(r.code).toBe(0)
    expect(r.data.matched).toBe(true)
    expect(r.data.method).toBe('plate')
    expect(mockStore.reservations.get('r1')!.status).toBe('entered')
    expect(mockStore.reservations.get('r1')!.entryMethod).toBe('plate')
    const log = [...mockStore.entry_logs.values()][0]
    expect(log.method).toBe('plate')
    expect(log.confidence).toBe(96)
    expect(log.imageFileID).toBe('cloud://x/plate.png')
  })

  it('mode=plate 识别车牌与预约车牌不一致 → PLATE_MISMATCH，不核销', async () => {
    seedReservation('r1', { plateNo: '皖A12345' })
    const r = await main({
      token: opsToken(),
      mode: 'plate',
      reservationId: 'r1',
      plateNo: '京B99999', // OCR 识别错了车
      confidence: 98,
    })
    expect(r.code).toBe('PLATE_MISMATCH')
    expect(mockStore.reservations.get('r1')!.status).toBe('pending_entry')
    expect(mockStore.entry_logs.size).toBe(0)
  })

  it('mode=plate 车牌归一后一致也放行（分隔点/大小写差异）', async () => {
    seedReservation('r1', { plateNo: '皖a·12345' }) // 库里带分隔点小写
    const r = await main({
      token: opsToken(),
      mode: 'plate',
      reservationId: 'r1',
      plateNo: '皖A12345',
    })
    expect(r.code).toBe(0)
  })

  it('mode=plate 预约不存在 → NOT_FOUND', async () => {
    const r = await main({ token: opsToken(), mode: 'plate', reservationId: 'nope', plateNo: '京A12345' })
    expect(r.code).toBe('NOT_FOUND')
  })

  it('mode=plate 预约非 pending_entry → INVALID_STATUS', async () => {
    seedReservation('r1', { status: 'entered' })
    const r = await main({ token: opsToken(), mode: 'plate', reservationId: 'r1', plateNo: '京A12345' })
    expect(r.code).toBe('INVALID_STATUS')
  })

  it('mode=plate 缺识别车牌 → BAD_REQUEST', async () => {
    seedReservation('r1')
    const r = await main({ token: opsToken(), mode: 'plate', reservationId: 'r1' })
    expect(r.code).toBe('BAD_REQUEST')
  })

  // —— manual / code ——

  it('mode=manual 按预约单核销，method=manual', async () => {
    seedReservation('r1')
    const r = await main({ token: opsToken(), mode: 'manual', reservationId: 'r1' })
    expect(r.code).toBe(0)
    expect(mockStore.reservations.get('r1')!.status).toBe('entered')
    expect([...mockStore.entry_logs.values()][0].method).toBe('manual')
    expect([...mockStore.entry_logs.values()][0].confidence).toBeNull()
  })

  it('mode=code 输码核销，method=code', async () => {
    seedReservation('r1')
    const r = await main({ token: opsToken(), mode: 'code', verifyCode: '123456' })
    expect(r.code).toBe(0)
    expect(mockStore.reservations.get('r1')!.status).toBe('entered')
    expect([...mockStore.entry_logs.values()][0].method).toBe('code')
  })

  it('mode=code 码无效 → NOT_FOUND，状态不变', async () => {
    seedReservation('r1')
    const r = await main({ token: opsToken(), mode: 'code', verifyCode: '999999' })
    expect(r.code).toBe('NOT_FOUND')
    expect(mockStore.reservations.get('r1')!.status).toBe('pending_entry')
    expect(mockStore.entry_logs.size).toBe(0)
  })

  it('CAS 并发：双击只成功一次，第二次 ALREADY_PROCESSED 且不写 entry_logs', async () => {
    seedReservation('r1')
    mockCasConflictOnce = true
    const r = await main({ token: opsToken(), mode: 'manual', reservationId: 'r1' })
    expect(r.code).toBe('ALREADY_PROCESSED')
    expect(mockStore.entry_logs.size).toBe(0)
  })
})
