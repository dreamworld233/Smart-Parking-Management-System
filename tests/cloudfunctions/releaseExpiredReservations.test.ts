// releaseExpiredReservations 云函数（CommonJS .js）的离线测试。
//
// 复用 cancelReservation.test.ts 的 stub 手法：jest.mock('wx-server-sdk') 返回内存 store，
// where().update() 真实模拟等值 CAS。差异只在：
// - 主查询是 where({ status, enterDeadline: _.lt(now) }).limit(BATCH).get()，所以 stub 的
//   where().limit().get() 必须真按 query 过滤（含 _.lt 指令），否则「未过期单不动」测不出
// - command 补一个 lt：{ __op: 'lt', value }，matchQuery 对 __op==='lt' 走数值小于比较
// - applyData 的 inc 读值改用 readPath：云数据库的 _.inc 对点路径（'credit.violationCount'）
//   是「读旧值 + 增量」，不是从 0 起算 —— 测 bannedUntil 需要用户已 2 次、自增到 3
// - 单条副作用失败注入：mockFailLotUpdateId（车场额度回补失败）不中断整批

type Store = Record<string, Map<string, Record<string, unknown>>>
let mockStore: Store
let mockOpenid: string | null
let mockCasConflictOnce: boolean
let mockCasConflictUsed: boolean
let mockFailLotUpdateId: string | null
let mockFailViolationsAdd: boolean

jest.mock(
  'wx-server-sdk',
  () => {
    const readPath = (doc: Record<string, unknown>, path: string): unknown => {
      const segs = path.split('.')
      let cur: unknown = doc
      for (const s of segs) {
        if (typeof cur !== 'object' || cur === null) return undefined
        cur = (cur as Record<string, unknown>)[s]
      }
      return cur
    }

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
          // 读旧值从「路径」读而不是 doc[k]：点路径的旧值在嵌套对象里
          const old = readPath(doc, k)
          const base = typeof old === 'number' ? (old as number) : 0
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
        // 注入「额度回补失败」：lots.doc(lotId).update 抛错，验证不中断整批
        if (collName === 'lots' && mockFailLotUpdateId === id) {
          throw new Error('lots.update failed')
        }
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

    const isOp = (v: unknown, op: string): v is { __op: string; value: number } =>
      !!v && typeof v === 'object' && (v as { __op?: string }).__op === op

    const matchQuery = (query: Record<string, unknown>) => (doc: Record<string, unknown>): boolean =>
      Object.entries(query).every(([k, v]) => {
        // _.lt(now) 在 query 里是 { __op: 'lt', value }：比 doc[k] 的数值小才算匹配
        if (isOp(v, 'lt')) return (doc[k] as number) < (v as { value: number }).value
        return doc[k] === v
      })

    const mkCollection = (collName: string) => ({
      doc: (id: string) => mkDocApi(collName, id),
      add: async ({ data }: { data: Record<string, unknown> }) => {
        if (collName === 'violations' && mockFailViolationsAdd) throw new Error('violations.add failed')
        const id = 'auto_' + (mockStore[collName].size + 1)
        mockStore[collName].set(id, { ...data, _id: id })
        return { _id: id }
      },
      where: (query: Record<string, unknown>) => ({
        limit: () => ({
          get: async () => ({
            data: [...mockStore[collName].values()].filter(matchQuery(query)).map((d) => ({ ...d })),
          }),
        }),
        get: async () => ({
          data: [...mockStore[collName].values()].filter(matchQuery(query)).map((d) => ({ ...d })),
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          if (collName === 'reservations' && mockCasConflictOnce && !mockCasConflictUsed) {
            // 模拟并发方抢先处理（已入场/已取消/另一轮定时任务已释放）：预查询还匹配得到
            // pending_entry，但 CAS 更新时状态已变 → updated 0，跳过副作用
            mockCasConflictUsed = true
            return { stats: { updated: 0 } }
          }
          for (const [id, doc] of mockStore[collName]) {
            if (matchQuery(query)(doc)) {
              applyData(doc, data)
              return { stats: { updated: 1 } }
            }
          }
          return { stats: { updated: 0 } }
        },
      }),
    })

    return {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init: jest.fn(),
      getWXContext: () => ({ OPENID: mockOpenid }),
      database: () => ({
        command: { inc: (n: number) => ({ __op: 'inc', value: n }), lt: (n: number) => ({ __op: 'lt', value: n }) },
        collection: (name: string) => mkCollection(name),
      }),
    }
  },
  { virtual: true },
)

// eslint-disable-next-line @typescript-eslint/no-var-requires
const releaseExpiredReservations = require('../../cloudfunctions/releaseExpiredReservations/index.js')
const main: () => Promise<any> = releaseExpiredReservations.main

const NOW = Date.now()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** 铺一张 pending_entry 的预约单。默认已过期（enterDeadline 在过去 45 分钟） */
function seedReservation(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    _id: id,
    orderNo: 'PK' + id,
    userId: 'openid-test-1',
    lotId: 'lot1',
    lotName: '万象城测试店',
    plateNo: '京A12345',
    arriveTime: NOW - HOUR,
    enterDeadline: NOW - 45 * 60 * 1000,
    status: 'pending_entry',
    verifyCode: '123456',
    prepaidParkingFee: 6,
    serviceFee: 2,
    totalAmount: 8,
    createdAt: NOW - 2 * HOUR,
    paidAt: NOW - 2 * HOUR,
    ...overrides,
  }
  mockStore.reservations.set(id, doc)
  return doc
}

function seedLot(id = 'lot1'): void {
  mockStore.lots.set(id, {
    _id: id,
    name: '万象城测试店',
    pricing: { firstHour: 6 },
    // 余位即可预约数：预约已扣 1，现余 1；超时释放返还 +1 → 2
    availability: { freeSpots: 1, totalSpots: 50, source: 'reported' },
  })
}

function seedUser(overrides: Record<string, unknown> = {}): void {
  mockStore.users.set('openid-test-1', {
    _id: 'openid-test-1',
    credit: { violationCount: 0, bannedUntil: null },
    ...overrides,
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
  mockCasConflictOnce = false
  mockCasConflictUsed = false
  mockFailLotUpdateId = null
  mockFailViolationsAdd = false
})

describe('releaseExpiredReservations 正常释放', () => {
  it('过期单 → released + releasedAt + 回补额度 + violations(no_show, penalty=totalAmount) + 计数+1', async () => {
    seedLot()
    seedUser()
    seedReservation('res1')

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ scanned: 1, released: 1 })

    // 主档：状态 released + releasedAt
    const r = mockStore.reservations.get('res1')!
    expect(r.status).toBe('released')
    expect(typeof r.releasedAt).toBe('number')

    // 额度回补
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(2)

    // 违约记录 no_show，penalty = 已付全额（没人退款）
    expect(mockStore.violations.size).toBe(1)
    const v = [...mockStore.violations.values()][0]
    expect(v.type).toBe('no_show')
    expect(v.userId).toBe('openid-test-1')
    expect(v.reservationId).toBe('res1')
    expect(v.lotId).toBe('lot1')
    expect(typeof v.occurredAt).toBe('number')
    expect(v.penalty).toBe(8)

    // 违约计数 +1；没到 3 次不写 bannedUntil
    const u = mockStore.users.get('openid-test-1')!.credit as { violationCount: number; bannedUntil: number | null }
    expect(u.violationCount).toBe(1)
    expect(u.bannedUntil).toBeNull()
  })

  it('未过期单不动：状态保持 pending_entry，不写任何副作用', async () => {
    seedLot()
    seedUser()
    seedReservation('res1', { enterDeadline: NOW + HOUR })

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ scanned: 0, released: 0 })

    expect(mockStore.reservations.get('res1')!.status).toBe('pending_entry')
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(1)
    expect(mockStore.violations.size).toBe(0)
    const u = mockStore.users.get('openid-test-1')!.credit as { violationCount: number }
    expect(u.violationCount).toBe(0)
  })

  it('定时触发无 OPENID 不拦截（系统任务），照常执行', async () => {
    seedLot()
    seedUser()
    seedReservation('res1')
    mockOpenid = null

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ scanned: 1, released: 1 })
    expect(mockStore.reservations.get('res1')!.status).toBe('released')
  })
})

describe('releaseExpiredReservations 并发与兜底', () => {
  it('CAS 并发（预查询后状态已被改）→ 跳过不重复处理', async () => {
    seedLot()
    seedUser()
    seedReservation('res1')
    // 预查询匹配到 pending_entry，但 CAS 更新时状态已被并发方改成 entered/cancelled/released
    mockCasConflictOnce = true

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ scanned: 1, released: 0 })

    // CAS 失配：主档/额度/违约一概不动
    expect(mockStore.reservations.get('res1')!.status).toBe('pending_entry')
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(1)
    expect(mockStore.violations.size).toBe(0)
    const u = mockStore.users.get('openid-test-1')!.credit as { violationCount: number }
    expect(u.violationCount).toBe(0)
  })

  it('违约计数自增到 3 → bannedUntil 写入（30 天后）', async () => {
    seedLot()
    seedUser({ credit: { violationCount: 2, bannedUntil: null } })
    seedReservation('res1')

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ scanned: 1, released: 1 })

    const u = mockStore.users.get('openid-test-1')!.credit as { violationCount: number; bannedUntil: number | null }
    expect(u.violationCount).toBe(3)
    // bannedUntil = 触发时刻 + 30 天（函数内 Date.now()，给前后一天余量）
    expect(typeof u.bannedUntil).toBe('number')
    expect(u.bannedUntil!).toBeGreaterThan(Date.now() + 29 * DAY)
    expect(u.bannedUntil!).toBeLessThan(Date.now() + 31 * DAY)
  })

  it('单条副作用失败不中断整批：额度回补失败不影响其他单', async () => {
    seedLot('lot1')
    seedLot('lot2')
    seedUser()
    seedReservation('res1') // lot1，额度回补会失败
    seedReservation('res2', { _id: 'res2', lotId: 'lot2' })
    mockFailLotUpdateId = 'lot1'

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ scanned: 2, released: 2 })

    // 两张单都 released
    expect(mockStore.reservations.get('res1')!.status).toBe('released')
    expect(mockStore.reservations.get('res2')!.status).toBe('released')

    // res1 的额度回补失败（reservedCount 仍 1）；res2 正常回补（1 → 0）
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(1)
    expect((mockStore.lots.get('lot2')!.availability as { freeSpots: number }).freeSpots).toBe(2)

    // 违约记录仍两条、计数仍 +2：失败只影响额度那一项
    expect(mockStore.violations.size).toBe(2)
    const u = mockStore.users.get('openid-test-1')!.credit as { violationCount: number }
    expect(u.violationCount).toBe(2)
  })

  it('violations 写失败：单失败不抛错、计数仍 +1、不中断整批', async () => {
    seedLot()
    seedUser()
    seedReservation('res1')
    mockFailViolationsAdd = true

    const res = await main()

    expect(res.code).toBe(0)
    expect(res.data).toEqual({ scanned: 1, released: 1 })
    expect(mockStore.violations.size).toBe(0)
    expect(mockStore.reservations.get('res1')!.status).toBe('released')
    expect((mockStore.lots.get('lot1')!.availability as { freeSpots: number }).freeSpots).toBe(2)
    const u = mockStore.users.get('openid-test-1')!.credit as { violationCount: number }
    expect(u.violationCount).toBe(1)
  })
})
