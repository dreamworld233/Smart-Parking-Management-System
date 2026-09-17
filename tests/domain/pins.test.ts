import { pickPins, pinLabel, pinOf, toMarkers } from '../../miniprogram/domain/pins'
import type { ParkingLot, Recommendation } from '../../miniprogram/domain/types'

function lot(id: string, distanceM: number, firstHour: number): ParkingLot {
  return {
    id,
    poiId: id,
    signed: true,
    name: `${id}地下停车场`,
    address: '',
    location: { lat: 31.75, lng: 117.25 },
    distanceM,
    walkMinutes: 1,
    distanceSource: 'estimated',
    pricing: { firstHour, perHourAfter: firstHour, stepMinutes: 15, capPerDay: 40, source: 'ops' },
    availability: { freeSpots: 10, totalSpots: 500, source: 'ops' },
    reservedCount: 0,
    ratingSummary: null,
    facilities: [],
  }
}

/** 未签约车场：图钉只有距离，没有价格可标 */
function unsignedLot(id: string, distanceM: number): ParkingLot {
  return {
    ...lot(id, distanceM, 0),
    signed: false,
    pricing: null,
    availability: null,
    reservedCount: 0,
  }
}

function rec(id: string, score: number, distanceM = 320, firstHour = 6): Recommendation {
  return {
    lot: lot(id, distanceM, firstHour),
    score,
    factors: { fee: 0, distance: 0, availability: 0, infra: 0, reputation: 0 },
    reasons: [],
    tone: 'plain',
  }
}

describe('pinLabel', () => {
  it('只有价格与距离', () => {
    expect(pinLabel(lot('A', 320, 6))).toBe('¥6 · 320m')
  })

  it('不带任何「推荐」字样（2026-09-13 用户去掉：选中已经表达了重点，两个蓝块很怪）', () => {
    expect(pinLabel(lot('A', 320, 6))).not.toContain('★')
    expect(pinLabel(lot('A', 320, 6))).not.toContain('推荐')
  })

  it('未签约车场图钉只标距离，不拿「¥」糊弄', () => {
    expect(pinLabel(unsignedLot('U', 320))).toBe('320m')
  })

  it('车场名不进图钉 —— 名字长了必然互相压死，名字交给卡片', () => {
    expect(pinLabel(lot('A', 320, 6))).not.toContain('地下停车场')
  })

  it('距离走 formatDistance，超 1 公里换成 km', () => {
    expect(pinLabel(lot('A', 1400, 6))).toBe('¥6 · 1.4km')
  })

  it('距离缺失时不渲染 NaN', () => {
    expect(pinLabel(lot('A', Number.NaN, 6))).toBe('¥6 · --')
  })
})

describe('pinOf', () => {
  it('坐标取车场位置，标签走 pinLabel', () => {
    expect(pinOf(rec('A', 90), { selected: false })).toMatchObject({
      id: 'A',
      latitude: 31.75,
      longitude: 117.25,
      label: '¥6 · 320m',
    })
  })

  it('选中状态透传', () => {
    expect(pinOf(rec('A', 90), { selected: true })).toMatchObject({ selected: true })
  })
})

describe('pickPins', () => {
  const sorted = [rec('A', 92), rec('B', 88), rec('C', 71), rec('D', 60), rec('E', 55)]

  it('只取前 max 个', () => {
    expect(pickPins(sorted, [], 3).map(r => r.lot.id)).toEqual(['A', 'B', 'C'])
  })

  it('max 大于总数时全给', () => {
    expect(pickPins(sorted, [], 99).map(r => r.lot.id)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('必须在场的那条掉出前 max 个时补回来', () => {
    // 选中项不随排序跑，排序一切换就可能落到 8 名开外，而「选中」在地图上必须看得见
    expect(pickPins(sorted, ['D'], 2).map(r => r.lot.id)).toEqual(['A', 'B', 'D'])
  })

  it('重复的 id 只补一次', () => {
    // 不去重就会在同一个坐标画出两个重叠图钉
    expect(pickPins(sorted, ['E', 'E'], 2).map(r => r.lot.id)).toEqual(['A', 'B', 'E'])
    expect(pickPins(sorted, ['A', 'A'], 2).map(r => r.lot.id)).toEqual(['A', 'B'])
  })

  it('本来就在前 max 个里时不重复', () => {
    expect(pickPins(sorted, ['B', 'A'], 3).map(r => r.lot.id)).toEqual(['A', 'B', 'C'])
  })

  it('空数组或已不在本批数据里的 id 都不补任何东西', () => {
    expect(pickPins(sorted, [], 2).map(r => r.lot.id)).toEqual(['A', 'B'])
    expect(pickPins(sorted, ['GONE'], 2).map(r => r.lot.id)).toEqual(['A', 'B'])
  })

  it('max 为 0 时只剩必须在场的那些', () => {
    expect(pickPins(sorted, ['C'], 0).map(r => r.lot.id)).toEqual(['C'])
  })

  it('不修改入参数组', () => {
    const before = sorted.map(r => r.lot.id)
    pickPins(sorted, ['E'], 2)
    expect(sorted.map(r => r.lot.id)).toEqual(before)
  })
})

describe('toMarkers', () => {
  const pins = [
    pinOf(rec('A', 92), { selected: false }),
    pinOf(rec('B', 88), { selected: true }),
  ]

  it('marker.id 用数组下标 —— 地图组件只认数字，页面再靠下标反查车场', () => {
    expect(toMarkers(pins).map(m => m.id)).toEqual([0, 1])
  })

  it('坐标与标签原样带到 marker 上', () => {
    expect(toMarkers(pins)[0]).toMatchObject({
      latitude: 31.75,
      longitude: 117.25,
      label: { content: '¥6 · 320m' },
    })
  })

  it('默认图钉白底深字，不抢眼', () => {
    expect(toMarkers(pins)[0].label).toMatchObject({ bgColor: '#ffffff', color: '#0f172a' })
  })

  it('选中的用主色蓝底白字，且比默认大一档 —— 用户点的那条必须一眼看得出来', () => {
    const [plain, selected] = toMarkers(pins).map(m => m.label)
    expect(selected).toMatchObject({ bgColor: '#2563eb', color: '#ffffff' })
    expect(selected.fontSize).toBeGreaterThan(plain.fontSize)
    expect(selected.padding).toBeGreaterThan(plain.padding)
  })
})
