// cancelReservation 云函数（CommonJS .js）的离线测试。
//
// 复用 createReservation.test.ts 的 stub 手法：jest.mock('wx-server-sdk') 返回内存
// store，where().update() 真实模拟等值 CAS（匹配才 updated 1）。差异只在：
// - 需要预置一张 pending_entry 的 reservation（用 seedReservation 直接铺，不走 create）
// - users / violations 两张集合要进 store（取消主档之外的两条副作用）
// - applyData 支持点路径（'credit.violationCount'），云数据库的 update 会嵌套写入

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
let mockFailRefundOrderAdd: boolean
let mockFailViolationsAdd: boolean
let mockCasConflictOnce: boolean
let mockCasConflictUsed: boolean

jest.mock(
  'wx-server-sdk',
  () => {
    // 云数据库的 update data 支持点路径（'credit.violationCount': _.inc(1)）嵌套写入，
    // 内存 stub 必须同语义，否则「违约计数 +1」测不出来
    const setPath = (doc: Record<string, unknown>, path: string, value: unknown): void => {
      const segs = path.split('.')
      let cur: Record<string, unknown> = doc
      for (let i = 0; i < segs.length - 1; i++) {
        const k = segs[i]
        if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
        cur = cur[k] as Record<string, unknown>
      }
      cur[segs[segs.length - 1]] = value
    }

    const applyData = (doc: Record<string, unknown>, data: Record<string, unknown>): void => {
      for (const [k, v] of Object.entries(data)) {
        const op = v as { __op?: string; value?: number } | null
        if (op && typeof op === 'object' && op.__op === 'inc') {
          const base = typeof doc[k] === 'number' ? (doc[k] as number) : 0
          setPath(doc, k, base + (op.value ?? 0))
        } else {
          setPath(doc, k, v)
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
      remove: async () => {
        mockStore[collName].delete(id)
        return { stats: { removed: 1 } }
      },
    })

    const mkCollection = (collName: string) => ({
      doc: (id: string) => mkDocApi(collName, id),
      add: async ({ data }: { data: Record<string, unknown> }) => {
        if (collName === 'orders' && mockFailRefundOrderAdd) throw new Error('orders.add failed')
        if (collName === 'violations' && mockFailViolationsAdd) throw new Error('violations.add failed')
        const id = 'auto_' + (mockStore[collName].size + 1)
        mockStore[collName].set(id, { ...data, _id: id })
        return { _id: id }
      },
      where: (query: Record<string, unknown>) => ({
        update: async ({ data }: { data: Record<string, unknown> }) => {
          if (collName === 'reservations' && mockCasConflictOnce && !mockCasConflictUsed) {
            // 模拟并发方抢先取消了这张单：预检读到的还是 pending_entry（通过），
            // 但 CAS 更新时状态已变 → updated 0，走 ALREADY_CANCELLED 分支
            mockCasConflictUsed = true
            return { stats: { updated: 0 } }
          }
          for (const [id, doc] of mockStore[collName]) {
            const matches = Object.entries(query).every(([k, v]) => doc[k] === v)
            if (matches) {
              applyData(doc, data)
              return { stats: { updated: 1 } }
            }
          }
          return { stats: { updated: 0 } }
        },
        limit: () => ({
          get: async () => ({ data: [...mockStore[collName].values()].map((d) => ({ ...d })) }),
        }),
        get: async () => ({ data: [...mockStore[collName].values()].map((d) => ({ ...d })) }),
      }),
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      getWXContext: () => ({ OPENID: mockOpenid }),
      database: () => ({
        command: { inc: (n: number) => ({ __op: 'inc', value: n }) },
        collection: (name: string) => mkCollection(name),
      }),
    }
  },
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cancelReservation = require('../../cloudfunctions/cancelReservation/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = cancelReservation.main

const NOW = Date.now()
const HOUR = 60 * 60 * 1000

/** 铺一张 pending_entry 的预约单。arriveTime 相对 NOW 由 offsetMs 控制 */
function seedReservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    _id: 'res1',
    orderNo: 'PK123',
    userId: 'openid-test-1',
    lotId: 'lot1',
    lotName: '万象城测试店',
    plateNo: '京A12345',
    arriveTime: NOW + 30 * 60 * 1000,
    enterDeadline: NOW + 30 * 60 * 1000 + 15 * 60 * 1000,
    status: 'pending_entry',
    verifyCode: '123456',
    prepaidParkingFee: 6,
    serviceFee: 2,
    totalAmount: 8,
    createdAt: NOW,
    paidAt: NOW,
    ...overrides,
  }
  mockStore.reservations.set('res1', doc)
  return doc
}

function seedLot(): void {
  mockStore.lots.set('lot1', {
    _id: 'lot1',
    name: '万象城测试店',
    pricing: { firstHour: 6 },
    reservableQuota: 10,
    reservedCount: 1,
  })
}

function seedUser(): void {
  mockStore.users.set('openid-test-1', {
    _id: 'openid-test-1',
    credit: { violationCount: 0, bannedUntil: null },
  })
}

function freshStore(): Store {
  return {
    lots: new Map(),
    reservations: new Map(),
    orders: new Map(),
    payments: new Map(),
    violations: new Map(),
    users: new Map(),
  }
}

beforeEach(() => {
  mockStore = freshStore()
  mockOpenid = 'openid-test-1'
  mockFailRefundOrderAdd = false
  mockFailViolationsAdd = false
  mockCasConflictOnce = false
  mockCasConflictUsed = false
})

describe('cancelReservation 正常取消', () => {
  it('免费窗口内（≤10 分钟）全额退款：退锁位+服务费、回补额度、无违约', async () => {
    seedLot()
    seedUser()
    // createdAt 10 分钟前 → cancelRefund 走免费窗口全额退
    seedReservation({ createdAt: NOW - 5 * 60 * 1000 })

    const res = await main({ reservationId: 'res1' })

    expect(res.code).toBe(0)
    expect(res.data).toMatchObject({
      status: 'cancelled',
      refundParking: 6,
      refundService: 2,
      refundTotal: 8,
      isBreach: false,
    })

    // 主档：状态 cancelled + 退款字段
    const r = mockStore.reservations.get('res1')!
    expect(r.status).toBe('cancelled')
    expect(r.refundParking).toBe(6)
    expect(r.refundService).toBe(2)
    expect(r.refundTotal).toBe(8)
    expect(typeof r.cancelledAt).toBe('number')
    expect(typeof r.refundAt).toBe('number')

    // 额度回补
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(0)
    // 退款流水一条（amount 负）
    expect(mockStore.orders.size).toBe(1)
    const o = [...mockStore.orders.values()][0]
    expect(o.type).toBe('refund')
    expect(o.amount).toBe(-8)
    expect(o.reservationId).toBe('res1')
    // 免费窗口内不违约
    expect(mockStore.violations.size).toBe(0)
    expect((mockStore.users.get('openid-test-1')!.credit as { violationCount: number }).violationCount).toBe(0)
  })

  it('逾窗口退锁位费、服务费不退', async () => {
    seedLot()
    seedUser()
    // 下单 40 分钟后取消，到达在 2 小时后 → 预约时长（createdAt→arrive）3 小时、
    // usedHours 1，退 2 小时 = 12；服务费不退
    seedReservation({ arriveTime: NOW + 2 * HOUR, createdAt: NOW - 40 * 60 * 1000 })

    const res = await main({ reservationId: 'res1' })

    expect(res.code).toBe(0)
    expect(res.data).toMatchObject({
      refundParking: 12,
      refundService: 0,
      refundTotal: 12,
      isBreach: false,
    })
    expect(mockStore.violations.size).toBe(0)
    expect((mockStore.users.get('openid-test-1')!.credit as { violationCount: number }).violationCount).toBe(0)
  })

  it('退款 0 但非违约（已占用向上取整吃满预约时长）不记违约', async () => {
    seedLot()
    seedUser()
    // 下单 90 分钟前取消，到达 15 分钟后 → leadHours 2、usedHours 2，退 0；取消早于到达，非违约
    seedReservation({ arriveTime: NOW + 15 * 60 * 1000, createdAt: NOW - 90 * 60 * 1000 })

    const res = await main({ reservationId: 'res1' })

    expect(res.code).toBe(0)
    expect(res.data).toMatchObject({
      refundParking: 0,
      refundService: 0,
      refundTotal: 0,
      isBreach: false,
    })
    expect(mockStore.violations.size).toBe(0)
    expect((mockStore.users.get('openid-test-1')!.credit as { violationCount: number }).violationCount).toBe(0)
  })

  it('取消晚于到达时刻 → 违约：violations(late_cancel) + violationCount +1', async () => {
    seedLot()
    seedUser()
    // 下单 1 小时前、到达时刻在过去 → 取消时刻晚于到达
    seedReservation({ arriveTime: NOW - HOUR, createdAt: NOW - 2 * HOUR })

    const res = await main({ reservationId: 'res1' })

    expect(res.code).toBe(0)
    expect(res.data.isBreach).toBe(true)
    expect(mockStore.violations.size).toBe(1)
    const v = [...mockStore.violations.values()][0]
    expect(v.type).toBe('late_cancel')
    expect(v.userId).toBe('openid-test-1')
    expect(v.reservationId).toBe('res1')
    expect(typeof v.occurredAt).toBe('number')
    // penalty = 未退的金额（预约总金额 - 实际退款）
    expect(v.penalty).toBe(8 - res.data.refundTotal)
    expect((mockStore.users.get('openid-test-1')!.credit as { violationCount: number }).violationCount).toBe(1)
  })
})

describe('cancelReservation 校验', () => {
  it('无 OPENID → NO_AUTH', async () => {
    mockOpenid = null
    const res = await main({ reservationId: 'res1' })
    expect(res).toEqual({ code: 'NO_AUTH', message: '缺少微信身份' })
  })

  it('缺 reservationId → BAD_REQUEST', async () => {
    const res = await main({})
    expect(res.code).toBe('BAD_REQUEST')
  })

  it('预约单不存在 → NOT_FOUND', async () => {
    const res = await main({ reservationId: 'missing' })
    expect(res).toEqual({ code: 'NOT_FOUND', message: '预约单不存在' })
  })

  it('只能取消自己的单 → FORBIDDEN', async () => {
    seedReservation({ userId: 'someone-else' })
    const res = await main({ reservationId: 'res1' })
    expect(res).toEqual({ code: 'FORBIDDEN', message: '只能操作自己的预约' })
  })

  it('已取消的单不可再取消 → INVALID_STATUS', async () => {
    seedReservation({ status: 'cancelled', cancelledAt: NOW })
    const res = await main({ reservationId: 'res1' })
    expect(res).toEqual({ code: 'INVALID_STATUS', message: '当前状态不可取消' })
  })
})

describe('cancelReservation 并发与兜底', () => {
  it('并发取消（预检后 CAS 失配）→ ALREADY_CANCELLED，不重复退款/回补', async () => {
    seedLot()
    seedUser()
    seedReservation({ createdAt: NOW - 5 * 60 * 1000 })
    // 预检读到 pending_entry（通过），但 CAS 更新时状态已被并发方改成 cancelled
    mockCasConflictOnce = true

    const res = await main({ reservationId: 'res1' })
    expect(res).toEqual({ code: 'ALREADY_CANCELLED', message: '该预约已被处理' })

    // 预检通过但 CAS 失配：主档/额度/流水一概不动
    expect(mockStore.reservations.get('res1')!.status).toBe('pending_entry')
    expect(mockStore.orders.size).toBe(0)
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(1)
    expect(mockStore.violations.size).toBe(0)
  })

  it('车场文档缺失时按 0 单价兜底取消，不卡死用户', async () => {
    seedUser()
    // 不 seedLot：lots 里没有这家车场
    seedReservation({ createdAt: NOW - 40 * 60 * 1000 })

    const res = await main({ reservationId: 'res1' })
    expect(res.code).toBe(0)
    expect(res.data.refundParking).toBe(0)
    // 额度回补仍要执行（doc 不存在 → update 空操作，不抛错）
    expect(res.data.status).toBe('cancelled')
  })

  it('退款流水写失败：主档仍已取消，不抛错', async () => {
    seedLot()
    seedUser()
    seedReservation({ createdAt: NOW - 5 * 60 * 1000 })
    mockFailRefundOrderAdd = true

    const res = await main({ reservationId: 'res1' })
    expect(res.code).toBe(0)
    expect(mockStore.reservations.get('res1')!.status).toBe('cancelled')
  })

  it('违约记录写失败：主档已取消且退款正常，不抛错', async () => {
    seedLot()
    seedUser()
    seedReservation({ arriveTime: NOW - HOUR, createdAt: NOW - 2 * HOUR })
    mockFailViolationsAdd = true

    const res = await main({ reservationId: 'res1' })
    expect(res.code).toBe(0)
    expect(res.data.isBreach).toBe(true)
    expect(mockStore.violations.size).toBe(0)
    // violations 写失败不影响计数（各自 try/catch）：计数 +1 仍发生
    expect((mockStore.users.get('openid-test-1')!.credit as { violationCount: number }).violationCount).toBe(1)
  })
})

// pricing.js 与 pricing.ts 的 cancelRefund 同口径由 createReservation.test.ts 的
// 「pricing.js 与 pricing.ts 同口径」段落统一覆盖（两处 pricing.js 是同一份拷贝），
// cancelReservation 只需确认自己 require 的这份与 createReservation 那份逐字节一致
describe('cancelReservation/pricing.js 与 createReservation/pricing.js 同源', () => {
  it('两份 pricing.js 内容一致', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const a = require('fs').readFileSync('cloudfunctions/createReservation/pricing.js', 'utf8')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const b = require('fs').readFileSync('cloudfunctions/cancelReservation/pricing.js', 'utf8')
    expect(a).toBe(b)
  })
})
