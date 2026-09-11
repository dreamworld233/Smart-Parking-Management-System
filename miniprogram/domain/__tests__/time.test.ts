import { ENTRY_GRACE_MINUTES, MAX_LEAD_HOURS, buildArrivalOptions, enterDeadline, isWithinWindow } from '../time'

const NOW = new Date('2026-09-11T13:40:00')

describe('buildArrivalOptions', () => {
  it('生成 5 档到达时间，首档为现在', () => {
    const opts = buildArrivalOptions(NOW)
    expect(opts.map(o => o.offsetMinutes)).toEqual([0, 30, 60, 90, 120])
  })

  it('推算到达时刻正确', () => {
    const opts = buildArrivalOptions(NOW)
    expect(opts[0].time.getHours()).toBe(13)
    expect(opts[0].time.getMinutes()).toBe(40)
    expect(opts[2].time.getHours()).toBe(14)
    expect(opts[2].time.getMinutes()).toBe(40)
    expect(opts[4].time.getHours()).toBe(15)
    expect(opts[4].time.getMinutes()).toBe(40)
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
  it('入场截止 = 到达时间 + 15 分钟', () => {
    const d = enterDeadline(new Date('2026-09-11T14:40:00'))
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(55)
  })

  it('宽限期常量为 15', () => {
    expect(ENTRY_GRACE_MINUTES).toBe(15)
  })
})
