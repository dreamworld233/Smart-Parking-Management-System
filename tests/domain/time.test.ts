import { ENTRY_GRACE_MINUTES, MAX_LEAD_HOURS, buildArrivalOptions, enterDeadline, isWithinWindow } from '../../miniprogram/domain/time'

const NOW = new Date('2026-09-11T13:40:00')
const MINUTE_MS = 60 * 1000

describe('buildArrivalOptions', () => {
  it('生成 5 档到达时间，首档为现在', () => {
    const opts = buildArrivalOptions(NOW)
    expect(opts.map(o => o.offsetMinutes)).toEqual([0, 30, 60, 90, 120])
  })

  it('推算到达时刻正确', () => {
    const opts = buildArrivalOptions(NOW)
    // 用时间戳而非 getHours/getMinutes：实现是纯毫秒加法，
    // 时间戳断言既完整又不受本地时区/夏令时影响
    expect(opts[0].time.getTime() - NOW.getTime()).toBe(0)
    expect(opts[2].time.getTime() - NOW.getTime()).toBe(60 * MINUTE_MS)
    expect(opts[4].time.getTime() - NOW.getTime()).toBe(120 * MINUTE_MS)
  })

  it('标签：首档为「现在」，其余带偏移量', () => {
    const opts = buildArrivalOptions(NOW)
    expect(opts[0].label).toBe('现在')
    expect(opts[1].label).toBe('30 分')
    expect(opts[2].label).toBe('1 时')
    expect(opts[3].label).toBe('1.5 时')
    expect(opts[4].label).toBe('2 时')
  })

  it('窗口上限为 2 小时', () => {
    expect(MAX_LEAD_HOURS).toBe(2)
  })

  it('每个选项都落在窗口内（页面据此禁用越界选项）', () => {
    for (const o of buildArrivalOptions(NOW)) expect(isWithinWindow(o.builtAt, o.time)).toBe(true)
  })

  it('末档恰好等于窗口上限，与 MAX_LEAD_HOURS 同源', () => {
    expect(buildArrivalOptions(NOW)[4].offsetMinutes).toBe(MAX_LEAD_HOURS * 60)
  })

  it('每个选项的 builtAt 都是生成时的基准时刻', () => {
    for (const o of buildArrivalOptions(NOW)) expect(o.builtAt.getTime()).toBe(NOW.getTime())
  })

  it('基准时刻非法时不提供任何选项', () => {
    expect(buildArrivalOptions(new Date('nope'))).toEqual([])
  })
})

describe('isWithinWindow', () => {
  it('现在可约', () => {
    expect(isWithinWindow(NOW, NOW)).toBe(true)
  })

  it('2 小时内可约', () => {
    expect(isWithinWindow(NOW, new Date('2026-09-11T15:40:00'))).toBe(true)
  })

  it('超过 2 小时不可约', () => {
    expect(isWithinWindow(NOW, new Date('2026-09-11T15:41:00'))).toBe(false)
  })

  it('早于当前时间不可约', () => {
    expect(isWithinWindow(NOW, new Date('2026-09-11T13:00:00'))).toBe(false)
  })
})

describe('enterDeadline', () => {
  it('入场截止 = 到达时间 + 15 分钟，且不改写入参', () => {
    const arrive = new Date('2026-09-11T14:40:00')
    const arriveMs = arrive.getTime()
    const d = enterDeadline(arrive)
    expect(d.getTime() - arriveMs).toBe(15 * MINUTE_MS)
    expect(arrive.getTime()).toBe(arriveMs)
  })

  it('宽限期常量为 15', () => {
    expect(ENTRY_GRACE_MINUTES).toBe(15)
  })
})
