import { getCurrentPoint, openNavigation } from '../../miniprogram/services/location'

interface LocationOption {
  type: string
  success: (res: { latitude: number; longitude: number }) => void
  fail: (err: { errMsg: string }) => void
}

interface OpenOption {
  latitude: number
  longitude: number
  name: string
  address: string
}

let lastLocation: LocationOption | null = null
let lastOpen: OpenOption | null = null

function stubWx(respond: (opt: LocationOption) => void): void {
  lastLocation = null
  lastOpen = null
  const g = globalThis as unknown as {
    wx: {
      getLocation: (o: LocationOption) => void
      openLocation: (o: OpenOption) => void
    }
  }
  g.wx = {
    getLocation: o => {
      lastLocation = o
      respond(o)
    },
    openLocation: o => {
      lastOpen = o
    },
  }
}

describe('getCurrentPoint', () => {
  it('成功时返回 gcj02 坐标', async () => {
    // gcj02 而非 wgs84：车场坐标来自腾讯地图，坐标系不一致会让地图上的点整体偏移
    stubWx(opt => opt.success({ latitude: 36.65, longitude: 117.12 }))

    await expect(getCurrentPoint()).resolves.toEqual({ ok: true, point: { lat: 36.65, lng: 117.12 } })
    expect(lastLocation?.type).toBe('gcj02')
  })

  it('用户拒绝授权时返回 denied', async () => {
    stubWx(opt => opt.fail({ errMsg: 'getLocation:fail auth deny' }))

    await expect(getCurrentPoint()).resolves.toEqual({ ok: false, reason: 'denied' })
  })

  it('新版基础库的 auth denied 文案同样判为 denied', async () => {
    stubWx(opt => opt.fail({ errMsg: 'getLocation:fail:auth denied' }))

    await expect(getCurrentPoint()).resolves.toEqual({ ok: false, reason: 'denied' })
  })

  it('其它失败归为 failed，不误导成用户拒绝', async () => {
    // 定位服务未开启 / 超时等：文案与授权无关，页面提示语不同
    stubWx(opt => opt.fail({ errMsg: 'getLocation:fail system permission denied' }))

    await expect(getCurrentPoint()).resolves.toEqual({ ok: false, reason: 'failed' })
  })

  it('errMsg 缺失时归为 failed，不抛异常', async () => {
    stubWx(opt => opt.fail({} as { errMsg: string }))

    await expect(getCurrentPoint()).resolves.toEqual({ ok: false, reason: 'failed' })
  })
})

describe('openNavigation', () => {
  it('透传目标坐标与名称给系统地图', () => {
    stubWx(opt => opt.success({ latitude: 0, longitude: 0 }))

    openNavigation({ lat: 36.66, lng: 117.13 }, '万象城地下停车场', '历下区经十路 1234 号')

    expect(lastOpen?.latitude).toBe(36.66)
    expect(lastOpen?.longitude).toBe(117.13)
    expect(lastOpen?.name).toBe('万象城地下停车场')
    expect(lastOpen?.address).toBe('历下区经十路 1234 号')
  })
})
