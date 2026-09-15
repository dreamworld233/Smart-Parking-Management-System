import { fetchMyReservations } from '../../miniprogram/services/reservation'

interface QueryCaptured {
  cond: Record<string, unknown>
  orderField: string
  orderDir: string
  limit: number
}

let docs: Record<string, unknown>[] = []
const captured: QueryCaptured[] = []

function stubCloud(): void {
  const g = globalThis as unknown as {
    wx: {
      cloud: {
        init: () => void
        database: () => {
          collection: (name: string) => {
            where: (cond: Record<string, unknown>) => {
              orderBy: (field: string, dir: string) => {
                limit: (n: number) => { get: () => Promise<{ data: Record<string, unknown>[] }> }
              }
            }
          }
        }
      }
    }
  }
  g.wx = {
    cloud: {
      init: () => undefined,
      database: () => ({
        collection: (name: string) => {
          if (name !== 'reservations') throw new Error(`unexpected collection ${name}`)
          return {
            where: (cond: Record<string, unknown>) => ({
              orderBy: (field: string, dir: string) => {
                const entry: QueryCaptured = { cond, orderField: field, orderDir: dir, limit: -1 }
                captured.push(entry)
                return {
                  limit: (n: number) => {
                    entry.limit = n
                    return { get: () => Promise.resolve({ data: docs }) }
                  },
                }
              },
            }),
          }
        },
      }),
    },
  }
}

function res(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: 'res1',
    orderNo: 'PK123',
    lotId: 'lot1',
    lotName: '万象城测试店',
    plateNo: '京A12345',
    arriveTime: 1,
    enterDeadline: 2,
    prepaidParkingFee: 6,
    serviceFee: 2,
    totalAmount: 8,
    status: 'pending_entry',
    verifyCode: '123456',
    createdAt: 3,
    ...overrides,
  }
}

describe('fetchMyReservations', () => {
  beforeEach(() => {
    docs = []
    captured.length = 0
    stubCloud()
  })

  it('按 userId 查询、createdAt 倒序、映射出预约', async () => {
    docs = [res({})]
    const list = await fetchMyReservations('openid-1')
    expect(captured).toHaveLength(1)
    expect(captured[0].cond).toEqual({ userId: 'openid-1' })
    expect(captured[0].orderField).toBe('createdAt')
    expect(captured[0].orderDir).toBe('desc')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 'res1',
      orderNo: 'PK123',
      lotName: '万象城测试店',
      plateNo: '京A12345',
      status: 'pending_entry',
      verifyCode: '123456',
    })
  })

  it('形状坏的文档整条丢弃，不炸整批', async () => {
    docs = [res({}), res({ _id: 'bad', orderNo: 123 }), res({})]
    const list = await fetchMyReservations('openid-1')
    expect(list).toHaveLength(2)
  })

  it('状态值不认识（控制台手改脏数据）整条丢弃', async () => {
    docs = [res({ status: 'weird' })]
    const list = await fetchMyReservations('openid-1')
    expect(list).toHaveLength(0)
  })

  it('时间戳被手改成 ISO 串时整条丢弃，不显示错时间', async () => {
    docs = [res({ arriveTime: '2026-09-11T10:00:00' })]
    const list = await fetchMyReservations('openid-1')
    expect(list).toHaveLength(0)
  })

  it('环境未配置时抛出明确错误', async () => {
    const g = globalThis as unknown as { wx?: unknown }
    const saved = g.wx
    g.wx = {}
    await expect(fetchMyReservations('openid-1')).rejects.toThrow('云开发未初始化')
    g.wx = saved
  })
})
