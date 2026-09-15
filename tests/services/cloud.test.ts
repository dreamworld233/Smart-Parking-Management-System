import {
  callFunction,
  cancelReservation,
  createReservation,
  ensureLogin,
  type CloudApi,
} from '../../miniprogram/services/cloud'

// data 必须可省：CloudApi.callFunction 的入参就是可省的，
// 桩要是把它收成必填，就跟被桩的签名对不上，编译先过不去
type CallOpt = { name: string; data?: Record<string, unknown> }
let lastCall: CallOpt | null = null
let respond: (opt: CallOpt) => { result: unknown }

function stubCloud(): void {
  const g = globalThis as unknown as { wx: { cloud: CloudApi } }
  g.wx = {
    cloud: {
      init: () => undefined,
      database: (() => ({})) as unknown as CloudApi['database'],
      callFunction: opt => {
        lastCall = opt
        return Promise.resolve(respond(opt))
      },
    },
  }
}

describe('callFunction', () => {
  beforeEach(() => {
    stubCloud()
    lastCall = null
  })

  it('code 0 时返回 data', async () => {
    respond = () => ({ result: { code: 0, data: { a: 1 } } })
    await expect(callFunction<{ a: number }>('x')).resolves.toEqual({ ok: true, data: { a: 1 } })
  })

  it('非 0 code 原样透出 code 与 message', async () => {
    respond = () => ({ result: { code: 'NO_AUTH', message: '缺少微信身份' } })
    const r = await callFunction('x')
    expect(r).toEqual({ ok: false, code: 'NO_AUTH', message: '缺少微信身份' })
  })

  it('调用抛错时归一为 NETWORK', async () => {
    respond = () => {
      throw new Error('timeout')
    }
    const r = await callFunction('x')
    expect(r).toEqual({ ok: false, code: 'NETWORK', message: 'timeout' })
  })

  it('基础库不支持云开发时返回 NO_CLOUD', async () => {
    const g = globalThis as unknown as { wx?: unknown }
    const saved = g.wx
    g.wx = {}
    const r = await callFunction('x')
    expect(r).toEqual({ ok: false, code: 'NO_CLOUD', message: '基础库不支持云开发' })
    g.wx = saved
  })
})

describe('ensureLogin', () => {
  beforeEach(() => {
    stubCloud()
    lastCall = null
  })

  it('调用 login 云函数并透出身份', async () => {
    respond = () => ({
      result: { code: 0, data: { userId: 'u1', role: 'driver', violationCount: 0, banned: false } },
    })
    const r = await ensureLogin()
    expect(r.ok).toBe(true)
    expect(lastCall?.name).toBe('login')
    if (r.ok) expect(r.data.userId).toBe('u1')
  })
})

describe('createReservation', () => {
  beforeEach(() => {
    stubCloud()
    lastCall = null
  })

  it('透传入参并调用 createReservation 云函数', async () => {
    respond = () => ({
      result: {
        code: 0,
        data: {
          reservationId: 'r1',
          orderNo: 'PK123',
          verifyCode: '000001',
          arriveTime: 1,
          enterDeadline: 2,
          leadHours: 1,
          prepaidParkingFee: 6,
          serviceFee: 2,
          totalAmount: 8,
        },
      },
    })
    const r = await createReservation({ lotId: 'lot1', arriveAt: 1, plateNo: '京A8F2K9' })
    expect(r.ok).toBe(true)
    expect(lastCall?.name).toBe('createReservation')
    expect(lastCall?.data).toEqual({ lotId: 'lot1', arriveAt: 1, plateNo: '京A8F2K9' })
    if (r.ok) expect(r.data.orderNo).toBe('PK123')
  })

  it('LOT_FULL 原样透出，调用方据此提示满位', async () => {
    respond = () => ({ result: { code: 'LOT_FULL', message: '可预约车位已满' } })
    const r = await createReservation({ lotId: 'lot1', arriveAt: 1, plateNo: '京A8F2K9' })
    expect(r).toEqual({ ok: false, code: 'LOT_FULL', message: '可预约车位已满' })
  })
})

describe('cancelReservation', () => {
  beforeEach(() => {
    stubCloud()
    lastCall = null
  })

  it('透传 reservationId 并调用 cancelReservation 云函数', async () => {
    respond = () => ({
      result: {
        code: 0,
        data: {
          reservationId: 'r1',
          status: 'cancelled',
          usedHours: 1,
          refundParking: 6,
          refundService: 0,
          refundTotal: 6,
          isBreach: false,
        },
      },
    })
    const r = await cancelReservation('r1')
    expect(r.ok).toBe(true)
    expect(lastCall?.name).toBe('cancelReservation')
    expect(lastCall?.data).toEqual({ reservationId: 'r1' })
    if (r.ok) expect(r.data.refundTotal).toBe(6)
  })

  it('非 0 code 原样透出（如 ALREADY_CANCELLED）', async () => {
    respond = () => ({ result: { code: 'ALREADY_CANCELLED', message: '该预约已被处理' } })
    const r = await cancelReservation('r1')
    expect(r).toEqual({ ok: false, code: 'ALREADY_CANCELLED', message: '该预约已被处理' })
  })
})
