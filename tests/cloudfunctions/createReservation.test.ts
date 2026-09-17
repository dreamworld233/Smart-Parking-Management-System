// createReservation 云函数（CommonJS .js）的离线测试。
//
// 云函数 require('wx-server-sdk') 且模块顶部就 cloud.init(...)，所以用
// jest.mock('wx-server-sdk') 返回内存 stub：database() 每次调用都从当前
// mockStore 取数，测试之间通过 beforeEach 重置 mockStore 来隔离状态。
//
// 关键点：where().update() 的 stats.updated 必须**真实模拟 CAS 语义** ——
// 拿 where 条件与内存里的当前值做等值比较，匹配才返回 1 并应用数据，
// 不匹配返回 0（模拟「并发写者抢先改了 reservedCount」）。
// 这里不测 mock 本身，而是靠真断言（额度、各集合内容）验证云函数行为。

import {
  PLATFORM_SERVICE_FEE,
  cancelRefund,
  isBookableArrival,
  leadHours,
  quoteTotal,
} from '../../miniprogram/domain/pricing'

// 所有被 jest.mock 工厂引用的可变状态都必须以 mock 开头（babel-jest-hoist 只放行 mock*）
type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
let mockFailReservationAdd: boolean
let mockFailOrderAdd: boolean
let mockFailPaymentAdd: boolean
let mockCasConflictOnce: boolean
let mockCasConflictUsed: boolean
let mockCasConflictAlways: boolean
let mockInjectReservedCount: number | null

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
        if (collName === 'lots' && mockInjectReservedCount !== null) {
          // 模拟「并发写者刚把 reservedCount 改成别的值」，插在补字段的 doc().update 之前，
          // 验证补字段用 _.inc(0) 不会把并发写者的值冲回 0
          doc.reservedCount = mockInjectReservedCount
        }
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
        if (collName === 'reservations' && mockFailReservationAdd) throw new Error('reservations.add failed')
        if (collName === 'orders' && mockFailOrderAdd) throw new Error('orders.add failed')
        if (collName === 'payments' && mockFailPaymentAdd) throw new Error('payments.add failed')
        const id = 'auto_' + (mockStore[collName].size + 1)
        mockStore[collName].set(id, { ...data, _id: id })
        return { _id: id }
      },
      where: (query: Record<string, unknown>) => ({
        update: async ({ data }: { data: Record<string, unknown> }) => {
          if (collName === 'lots' && mockCasConflictAlways) {
            // 模拟并发写者每次都抢先：CAS 永远失配，云函数 3 次重试耗尽 → LOT_FULL
            return { stats: { updated: 0 } }
          }
          if (collName === 'lots' && mockCasConflictOnce && !mockCasConflictUsed) {
            // 模拟并发写者抢走了额度：值已变，本次 CAS 必然失配（updated 0），
            // 触发云函数的「重读 + 重试」路径
            mockCasConflictUsed = true
            const doc = mockStore[collName].get(query._id as string)
            if (doc) {
              const base = typeof doc.reservedCount === 'number' ? (doc.reservedCount as number) : 0
              doc.reservedCount = base + 1
            }
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
const createReservation = require('../../cloudfunctions/createReservation/index.js')
const main: (event: Record<string, unknown>) => Promise<any> = createReservation.main

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsPricing = require('../../cloudfunctions/createReservation/pricing.js')

function seedLot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    _id: 'lot1',
    poiId: 'poi1',
    name: '万象城测试店',
    address: '测试路 1 号',
    location: { lat: 1, lng: 2 },
    pricing: { firstHour: 6, perHourAfter: 4, capPerDay: 40, stepMinutes: 60, source: 'public' },
    contract: { status: 'signed', signedAt: Date.now() },
    // 可约余位 = freeSpots − reservedCount（2026-09-17 起不设固定 quota）
    availability: { freeSpots: 10, totalSpots: 50, source: 'reported' },
    reservedCount: 0,
    ...overrides,
  }
  mockStore.lots.set('lot1', doc)
  return doc
}

function freshStore(): Store {
  return {
    lots: new Map(),
    reservations: new Map(),
    orders: new Map(),
    payments: new Map(),
  }
}

const HOUR = 60 * 60 * 1000
const validArrive = () => Date.now() + HOUR

beforeEach(() => {
  mockStore = freshStore()
  mockOpenid = 'openid-test-1'
  mockFailReservationAdd = false
  mockFailOrderAdd = false
  mockFailPaymentAdd = false
  mockCasConflictOnce = false
  mockCasConflictUsed = false
  mockCasConflictAlways = false
  mockInjectReservedCount = null
})

describe('createReservation 正常下单', () => {
  it('抢额度成功：建单、扣额度、写 orders 两条 + payments 一条，返回 code 0', async () => {
    seedLot()
    const arriveAt = validArrive()
    const res = await main({ lotId: 'lot1', arriveAt, plateNo: '京A12345' })

    expect(res.code).toBe(0)
    const d = res.data
    expect(d.reservationId).toBeTruthy()
    expect(d.orderNo).toMatch(/^PK\d{13}\d{3}$/)
    expect(d.verifyCode).toMatch(/^\d{6}$/)
    expect(d.arriveTime).toBe(arriveAt)
    expect(d.enterDeadline).toBe(arriveAt + 15 * 60 * 1000)
    expect(d.leadHours).toBe(1)
    expect(d.prepaidParkingFee).toBe(6)
    expect(d.serviceFee).toBe(PLATFORM_SERVICE_FEE)
    expect(d.totalAmount).toBe(8)

    // 额度已扣
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(1)

    // 主档内容
    expect(mockStore.reservations.size).toBe(1)
    const r = [...mockStore.reservations.values()][0]
    expect(r.userId).toBe('openid-test-1')
    expect(r.lotId).toBe('lot1')
    expect(r.lotName).toBe('万象城测试店')
    expect(r.plateNo).toBe('京A12345')
    expect(r.arriveTime).toBe(arriveAt)
    expect(r.status).toBe('pending_entry')
    expect(r.prepaidParkingFee).toBe(6)
    expect(r.serviceFee).toBe(2)
    expect(r.totalAmount).toBe(8)
    expect(r.verifyCode).toMatch(/^\d{6}$/)
    expect(typeof r.createdAt).toBe('number')
    expect(typeof r.paidAt).toBe('number')

    // 两条订单 + 一条模拟支付
    expect(mockStore.orders.size).toBe(2)
    const prepaid = [...mockStore.orders.values()].find((o) => o.type === 'prepaid')
    const service = [...mockStore.orders.values()].find((o) => o.type === 'service')
    expect(prepaid!.amount).toBe(6)
    expect(service!.amount).toBe(2)
    expect(mockStore.payments.size).toBe(1)
    const pay = [...mockStore.payments.values()][0]
    expect(pay.channel).toBe('mock')
    expect(pay.amount).toBe(8)
    expect(pay.status).toBe('paid')
    expect(String(pay.tradeNo)).toMatch(/^MOCK\d+$/)
  })

  it('老文档没有 reservedCount 字段时按 0 兜底，仍可预约', async () => {
    const doc = seedLot()
    delete doc.reservedCount
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res.code).toBe(0)
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(1)
  })

  it('无 OPENID → NO_AUTH', async () => {
    mockOpenid = null
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res).toEqual({ code: 'NO_AUTH', message: '缺少微信身份' })
  })
})

describe('createReservation 余位 CAS', () => {
  it('已满（cur >= freeSpots）→ LOT_FULL，余位与各集合不动', async () => {
    seedLot({ availability: { freeSpots: 1, totalSpots: 50, source: 'reported' }, reservedCount: 1 })
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res).toEqual({ code: 'LOT_FULL', message: '可预约车位已满' })
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(1)
    expect(mockStore.reservations.size).toBe(0)
    expect(mockStore.orders.size).toBe(0)
    expect(mockStore.payments.size).toBe(0)
  })

  it('CAS 冲突重试：第一次失配（updated 0）第二次成功，最终建单', async () => {
    seedLot({})
    mockCasConflictOnce = true
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res.code).toBe(0)
    // 冲突写者 +1，本请求重试成功再 +1
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(2)
    expect(mockStore.reservations.size).toBe(1)
  })

  it('CAS 重试 3 次耗尽仍失配 → LOT_FULL，不建单、余位不动', async () => {
    seedLot({})
    mockCasConflictAlways = true
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res).toEqual({ code: 'LOT_FULL', message: '可预约车位已满' })
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(0)
    expect(mockStore.reservations.size).toBe(0)
  })

  it('老文档补字段用 _.inc(0)：并发写者的值不被冲回 0，不超卖', async () => {
    const doc = seedLot({})
    delete doc.reservedCount
    // 模拟并发写者抢到 1 后才轮到本请求补字段
    mockInjectReservedCount = 1
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res.code).toBe(0)
    // 补字段 inc(0) 保持 1 不变，随后 CAS inc → 2；若补字段硬写 0 则会被冲回后 CAS → 1
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(2)
    expect(mockStore.reservations.size).toBe(1)
  })
})

describe('createReservation 入参校验', () => {
  it('缺少 lotId → BAD_REQUEST', async () => {
    const res = await main({ arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res.code).toBe('BAD_REQUEST')
  })

  it('到达时刻在过去 → BAD_REQUEST', async () => {
    const res = await main({ lotId: 'lot1', arriveAt: Date.now() - 1000, plateNo: '京A12345' })
    expect(res).toEqual({ code: 'BAD_REQUEST', message: '到达时刻超出可预约范围' })
  })

  it('到达时刻超过 2 小时 → BAD_REQUEST', async () => {
    const res = await main({ lotId: 'lot1', arriveAt: Date.now() + 3 * HOUR, plateNo: '京A12345' })
    expect(res).toEqual({ code: 'BAD_REQUEST', message: '到达时刻超出可预约范围' })
  })

  it('到达时刻不是数字 → BAD_REQUEST', async () => {
    const res = await main({ lotId: 'lot1', arriveAt: 'not-a-number', plateNo: '京A12345' })
    expect(res).toEqual({ code: 'BAD_REQUEST', message: '到达时刻超出可预约范围' })
  })

  it('车牌非法 → BAD_REQUEST', async () => {
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: 'abc123' })
    expect(res).toEqual({ code: 'BAD_REQUEST', message: '车牌号格式不正确' })
  })

  it('新能源 7 位车牌通过校验', async () => {
    seedLot()
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京AD12345' })
    expect(res.code).toBe(0)
  })
})

describe('createReservation 车场校验', () => {
  it('车场不存在 → LOT_NOT_FOUND', async () => {
    const res = await main({ lotId: 'missing', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res).toEqual({ code: 'LOT_NOT_FOUND', message: '车场不存在' })
  })

  it('未签约 → LOT_NOT_FOUND', async () => {
    seedLot({ contract: { status: 'draft' } })
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res.code).toBe('LOT_NOT_FOUND')
  })

  it('pricing.firstHour 缺失 → LOT_INVALID', async () => {
    seedLot({ pricing: { perHourAfter: 4 } })
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res.code).toBe('LOT_INVALID')
  })

  it('余位未上报（availability.freeSpots 缺失）→ LOT_INVALID', async () => {
    seedLot({ availability: { totalSpots: 50, source: 'reported' } })
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res.code).toBe('LOT_INVALID')
  })
})

describe('createReservation 写单失败回补', () => {
  it('reservations 写失败：回补额度，不留任何单', async () => {
    seedLot()
    mockFailReservationAdd = true
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res).toEqual({ code: 'INTERNAL', message: '下单失败，请重试' })
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(0) // 已回补
    expect(mockStore.reservations.size).toBe(0)
    expect(mockStore.orders.size).toBe(0)
    expect(mockStore.payments.size).toBe(0)
  })

  it('orders 写失败：删除已建 reservation + 回补额度', async () => {
    seedLot()
    mockFailOrderAdd = true
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res).toEqual({ code: 'INTERNAL', message: '下单失败，请重试' })
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(0)
    expect(mockStore.reservations.size).toBe(0) // 孤儿单已清
    expect(mockStore.orders.size).toBe(0)
    expect(mockStore.payments.size).toBe(0)
  })

  it('payments 写失败：删除已建 reservation 与 orders + 回补额度', async () => {
    seedLot()
    mockFailPaymentAdd = true
    const res = await main({ lotId: 'lot1', arriveAt: validArrive(), plateNo: '京A12345' })
    expect(res).toEqual({ code: 'INTERNAL', message: '下单失败，请重试' })
    expect(mockStore.lots.get('lot1')!.reservedCount).toBe(0)
    expect(mockStore.reservations.size).toBe(0)
    expect(mockStore.orders.size).toBe(0)
    expect(mockStore.payments.size).toBe(0)
  })
})

// pricing.js 与 pricing.ts 的同口径「离线段落锁」：
// 同一组用例分别过 JS 版与 TS 版，结果必须逐字段相等，
// 任一边改了公式或常量而另一边没改，这里立刻红
describe('pricing.js 与 pricing.ts 同口径', () => {
  const cases: Array<[string, string, number]> = [
    ['2026-09-11T10:00:00', '2026-09-11T11:00:00', 6], // 整 1 小时
    ['2026-09-11T10:00:00', '2026-09-11T12:30:00', 4], // 2 小时 30 分 → lead 3
    ['2026-09-11T10:00:00', '2026-09-11T09:30:00', 6], // 过去时刻兜底
    ['2026-09-11T10:00:00', '2026-09-11T10:00:00', 8], // arrive == now（验算挖出的关键点）
    ['2026-09-11T10:00:00', '2026-09-11T11:45:00', 5], // 1 小时 45 分 → lead 2
  ]

  it.each(cases)('quoteTotal(%s, %s, %i) 两版一致', (nowIso, arriveIso, rate) => {
    const now = new Date(nowIso)
    const arrive = new Date(arriveIso)
    expect(jsPricing.quoteTotal(now, arrive, rate)).toEqual(quoteTotal(now, arrive, rate))
  })

  it.each(cases)('leadHours(%s, %s) 两版一致', (nowIso, arriveIso) => {
    const now = new Date(nowIso)
    const arrive = new Date(arriveIso)
    expect(jsPricing.leadHours(now, arrive)).toBe(leadHours(now, arrive))
  })

  it.each(cases)('isBookableArrival(%s, %s) 两版一致', (nowIso, arriveIso) => {
    const now = new Date(nowIso)
    const arrive = new Date(arriveIso)
    expect(jsPricing.isBookableArrival(now, arrive)).toBe(isBookableArrival(now, arrive))
  })

  it('cancelRefund 各分支两版一致', () => {
    const scenarios: Array<[string, string, string, number]> = [
      ['2026-09-11T10:00:00', '2026-09-11T12:00:00', '2026-09-11T10:05:00', 5], // 免费窗口内全额
      ['2026-09-11T10:00:00', '2026-09-11T12:00:00', '2026-09-11T10:10:00', 6], // 整 10 分钟（闭区间）
      ['2026-09-11T10:00:00', '2026-09-11T12:00:00', '2026-09-11T11:00:00', 6], // 逾窗口退 1 小时
      ['2026-09-11T10:00:00', '2026-09-11T11:00:00', '2026-09-11T11:15:00', 5], // 违约，退款 0
      ['2026-09-11T10:00:00', '2026-09-11T11:00:00', '2026-09-11T10:11:00', 5], // 向上取整吃满，非违约
    ]
    for (const [o, a, c, r] of scenarios) {
      const orderAt = new Date(o)
      const arrive = new Date(a)
      const cancelAt = new Date(c)
      expect(jsPricing.cancelRefund(orderAt, arrive, cancelAt, r)).toEqual(
        cancelRefund(orderAt, arrive, cancelAt, r),
      )
    }
  })
})
