import { WALK_DETOUR_FACTOR } from '../../miniprogram/config'
import { haversineM } from '../../miniprogram/domain/geo'
import { fetchSignedLots } from '../../miniprogram/services/lot'

interface QueryCaptured {
  cond: Record<string, unknown>
}

let docs: Record<string, unknown>[] = []
const captured: QueryCaptured[] = []

function stubCloud(): void {
  const g = globalThis as unknown as {
    wx: {
      cloud: {
        init: () => void
        callFunction: () => Promise<{ result: unknown }>
        database: () => {
          collection: (name: string) => {
            where: (cond: Record<string, unknown>) => {
              limit: (n: number) => { get: () => Promise<{ data: Record<string, unknown>[] }> }
            }
          }
        }
      }
    }
  }
  g.wx = {
    cloud: {
      init: () => undefined,
      callFunction: () => Promise.resolve({ result: {} }),
      database: () => ({
        collection: (name: string) => {
          if (name !== 'lots') throw new Error(`unexpected collection ${name}`)
          return {
            where: (cond: Record<string, unknown>) => {
              captured.push({ cond })
              return {
                limit: () => ({ get: () => Promise.resolve({ data: docs }) }),
              }
            },
          }
        },
      }),
    },
  }
}

function doc(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: 'lot1',
    name: '测试车场',
    address: '测试地址',
    location: { lat: 31.7527, lng: 117.2541 },
    pricing: { firstHour: 5, perHourAfter: 4, stepMinutes: 60, capPerDay: 40, source: 'public' },
    availability: { freeSpots: null, totalSpots: 300, source: 'ops' },
    reservableQuota: 20,
    ratingSummary: null,
    facilities: ['充电桩'],
    contract: { status: 'signed' },
    ...overrides,
  }
}

describe('fetchSignedLots', () => {
  const CENTER = { lat: 31.752727, lng: 117.254098 }

  beforeEach(() => {
    stubCloud()
    docs = []
    captured.length = 0
  })

  it('只查签约车场：查询条件带 contract.status', async () => {
    docs = [doc({})]
    await fetchSignedLots(CENTER)
    expect(captured).toHaveLength(1)
    expect(captured[0].cond).toEqual({ 'contract.status': 'signed' })
  })

  it('返回文档映射出的车场并带上估算距离', async () => {
    docs = [doc({})]
    const lots = await fetchSignedLots(CENTER)
    expect(lots).toHaveLength(1)
    expect(lots[0].id).toBe('lot1')
    expect(lots[0].distanceSource).toBe('estimated')
    expect(lots[0].distanceM).toBeGreaterThan(0)
    expect(lots[0].walkMinutes).toBeGreaterThan(0)
  })

  it('按距离升序、半径外的丢弃', async () => {
    docs = [
      doc({ _id: 'far', location: { lat: 31.78, lng: 117.28 } }),
      doc({ _id: 'near', location: { lat: 31.753, lng: 117.2545 } }),
    ]
    const lots = await fetchSignedLots(CENTER, 1000)
    expect(lots.map(l => l.id)).toEqual(['near'])
  })

  it('perHourAfter 缺省回落到 firstHour', async () => {
    docs = [doc({ pricing: { firstHour: 5, stepMinutes: 60, capPerDay: 40, source: 'ops' } })]
    const lots = await fetchSignedLots(CENTER)
    expect(lots[0].pricing.perHourAfter).toBe(5)
  })

  it('形状坏的文档整条丢弃，不炸整批', async () => {
    docs = [doc({}), doc({ _id: 'bad', name: 123 }), doc({})]
    const lots = await fetchSignedLots(CENTER)
    expect(lots).toHaveLength(2)
  })

  it('估算距离是直线距离乘绕行系数的四舍五入', async () => {
    docs = [doc({ location: { lat: 31.75121, lng: 117.25325 } })]
    const lots = await fetchSignedLots(CENTER)
    const straight = haversineM(CENTER, { lat: 31.75121, lng: 117.25325 })
    expect(lots[0].distanceM).toBe(Math.round(straight * WALK_DETOUR_FACTOR))
  })

  it('环境未配置时抛出明确错误', async () => {
    const g = globalThis as unknown as { wx?: unknown }
    const saved = g.wx
    g.wx = {}
    await expect(fetchSignedLots(CENTER)).rejects.toThrow('云开发未初始化')
    g.wx = saved
  })
})
