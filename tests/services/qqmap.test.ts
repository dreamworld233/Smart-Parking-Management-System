import { QQMapError, searchByKeyword, searchNearby, walkingDistance, walkingDistances } from '../../miniprogram/services/qqmap'
import { QQMAP_KEY } from '../../miniprogram/config'

interface ReqOption {
  url: string
  success: (res: { data: unknown }) => void
  fail: (err: { errMsg: string }) => void
}

let sent: ReqOption[] = []

/** 拦截 wx.request。respond 收到的 callIndex 从 1 开始，用来区分首次与重试 */
function stubRequest(respond: (opt: ReqOption, callIndex: number) => void): void {
  sent = []
  const g = globalThis as unknown as { wx: { request: (o: ReqOption) => void } }
  g.wx = {
    request: o => {
      sent.push(o)
      respond(o, sent.length)
    },
  }
}

/** 地点搜索的信封：POI 数组在顶层 data */
function searchBody(data: unknown[]): unknown {
  return { status: 0, message: 'query ok', count: data.length, data }
}

/** 路径矩阵的信封：结果在顶层 result，不在 data */
function matrixBody(distance: number, duration: number): unknown {
  return { status: 0, message: 'query ok', result: { rows: [{ elements: [{ distance, duration }] }] } }
}

const RAW_POI = {
  id: 'p1',
  title: '万象城地下停车场',
  address: '历下区经十路 1234 号',
  location: { lat: 36.66, lng: 117.13 },
  _distance: 320,
}

describe('searchNearby', () => {
  it('把顶层 data 数组映射成 POI 列表', async () => {
    // 信封只剥一层：POI 数组就是 response.data，再套一层 { data } 会永远取到空数组
    stubRequest(opt => opt.success({ data: searchBody([RAW_POI]) }))

    await expect(searchNearby('停车场', { lat: 36.65, lng: 117.12 }, 3000)).resolves.toEqual([
      {
        id: 'p1',
        title: '万象城地下停车场',
        address: '历下区经十路 1234 号',
        location: { lat: 36.66, lng: 117.13 },
        distanceM: 320,
      },
    ])
  })

  it('请求带 nearby 边界、按距离排序、以及 Key', async () => {
    stubRequest(opt => opt.success({ data: searchBody([]) }))

    await searchNearby('停车场', { lat: 36.65, lng: 117.12 }, 3000)

    // 不传 orderby 时接口不返回 _distance，车场距离会全是 0
    const url = decodeURIComponent(sent[0].url)
    expect(url).toContain('https://apis.map.qq.com/ws/place/v1/search?')
    expect(url).toContain('boundary=nearby(36.65,117.12,3000)')
    expect(url).toContain('orderby=_distance')
    expect(url).toContain(`key=${QQMAP_KEY}`)
  })

  it('缺少 _distance 时距离按 0 处理，不产生 NaN', async () => {
    const { _distance, ...noDistance } = RAW_POI
    stubRequest(opt => opt.success({ data: searchBody([noDistance]) }))

    const pois = await searchNearby('停车场', { lat: 36.65, lng: 117.12 }, 3000)

    expect(pois[0].distanceM).toBe(0)
  })

  it('status 为 0 却没有载荷时按错误处理，不谎报「附近没有车场」', async () => {
    // 信封形状变了就说出来。悄悄返回空数组等于告诉用户「这附近没有停车场」
    stubRequest(opt => opt.success({ data: { status: 0, message: 'query ok' } }))

    await expect(searchNearby('停车场', { lat: 0, lng: 0 }, 100)).rejects.toBeInstanceOf(QQMapError)
  })

  it('半径外 POI 由本地过滤掉', async () => {
    // 实测接口的 nearby 半径不生效：r=300 与 r=3000 返回同一批（最远 685 米），
    // 不自己过滤的话首页会把 3 公里外的车场也列出来
    stubRequest(opt =>
      opt.success({
        data: searchBody([
          { ...RAW_POI, id: 'in', _distance: 200 },
          { ...RAW_POI, id: 'out', _distance: 900 },
        ]),
      }),
    )

    const pois = await searchNearby('停车场', { lat: 0, lng: 0 }, 500)

    expect(pois.map(p => p.id)).toEqual(['in'])
  })

  it('不依赖服务端顺序，按距离升序返回', async () => {
    stubRequest(opt =>
      opt.success({
        data: searchBody([
          { ...RAW_POI, id: 'far', _distance: 480 },
          { ...RAW_POI, id: 'near', _distance: 120 },
          { ...RAW_POI, id: 'mid', _distance: 300 },
        ]),
      }),
    )

    const pois = await searchNearby('停车场', { lat: 0, lng: 0 }, 500)

    expect(pois.map(p => p.id)).toEqual(['near', 'mid', 'far'])
  })
})

describe('searchByKeyword', () => {
  it('城市检索带 region 边界', async () => {
    stubRequest(opt => opt.success({ data: searchBody([]) }))

    await searchByKeyword('泉城广场', '济南')

    const url = decodeURIComponent(sent[0].url)
    expect(url).toContain('boundary=region(济南,0)')
    expect(url).toContain('keyword=泉城广场')
  })
})

describe('walkingDistance', () => {
  it('从顶层 result.rows[0].elements[0] 取距离', async () => {
    // 矩阵接口的结果在 result 里，和地点搜索的 data 不是一个信封
    stubRequest(opt => opt.success({ data: matrixBody(260, 0) }))

    const r = await walkingDistance({ lat: 36.65, lng: 117.12 }, { lat: 36.66, lng: 117.13 })

    expect(r?.distanceM).toBe(260)
  })

  it('优先采用接口给的步行耗时（秒换算成分钟）', async () => {
    // 实测样本：1747 米 / 1588 秒 —— 路线距离比直线长，接口耗时比按距离硬算准
    stubRequest(opt => opt.success({ data: matrixBody(1747, 1588) }))

    const r = await walkingDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 })

    expect(r).toEqual({ distanceM: 1747, durationMin: 26 })
  })

  it('接口耗时为 0 时按步行速度从距离兜底', async () => {
    // 文档称步行/骑行不计算耗时。实测接口给的是真实值，但万一某个档位真的返回 0，
    // 直接采用会把「步行 0 分钟」渲染给用户
    stubRequest(opt => opt.success({ data: matrixBody(400, 0) }))

    const r = await walkingDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 })

    expect(r).toEqual({ distanceM: 400, durationMin: 5 })
  })

  it('不足 1 分钟也按 1 分钟计', async () => {
    stubRequest(opt => opt.success({ data: matrixBody(30, 0) }))

    const r = await walkingDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 })

    expect(r?.durationMin).toBe(1)
  })

  it('mode 为 walking，from / to 按「纬度,经度」拼', async () => {
    stubRequest(opt => opt.success({ data: matrixBody(100, 0) }))

    await walkingDistance({ lat: 36.65, lng: 117.12 }, { lat: 36.66, lng: 117.13 })

    const url = decodeURIComponent(sent[0].url)
    expect(url).toContain('mode=walking')
    expect(url).toContain('from=36.65,117.12')
    expect(url).toContain('to=36.66,117.13')
  })

  it('结果为空时返回 null，调用方降级', async () => {
    stubRequest(opt => opt.success({ data: { status: 0, message: 'query ok', result: { rows: [] } } }))

    await expect(walkingDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).resolves.toBeNull()
  })

  it('请求失败时返回 null，不把异常抛给列表渲染', async () => {
    stubRequest(opt => opt.fail({ errMsg: 'request:fail timeout' }))

    await expect(walkingDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).resolves.toBeNull()
  })
})

describe('walkingDistances（批量）', () => {
  /** 按 to 里的坐标个数造一个矩阵信封 */
  function matrixFor(url: string): unknown {
    const to = decodeURIComponent(url).match(/to=([^&]*)/)?.[1] ?? ''
    const n = to.split(';').filter(Boolean).length
    return { status: 0, message: 'query ok', result: { rows: [{ elements: Array.from({ length: n }, (_, i) => ({ distance: 100 * (i + 1), duration: 60 * (i + 1) })) }] } }
  }

  it('一次请求装下多个目的地，返回与入参同序', async () => {
    stubRequest(opt => opt.success({ data: matrixFor(opt.url) }))

    const r = await walkingDistances({ lat: 0, lng: 0 }, [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ])

    expect(sent.length).toBe(1)
    expect(r).toEqual([
      { distanceM: 100, durationMin: 1 },
      { distanceM: 200, durationMin: 2 },
      { distanceM: 300, durationMin: 3 },
    ])
  })

  it('超过 5 个目的地时拆批，批次之间有间隔', async () => {
    // 实测每秒约 5 点：一批 6 个会直接吃 120。拆批 + 间隔是能不能用的前提，
    // 不是优化项
    stubRequest(opt => opt.success({ data: matrixFor(opt.url) }))

    const r = await walkingDistances(
      { lat: 0, lng: 0 },
      Array.from({ length: 6 }, (_, i) => ({ lat: i, lng: i })),
      0,
    )

    expect(sent.length).toBe(2)
    const pointsPerCall = sent.map(opt => (decodeURIComponent(opt.url).match(/to=([^&]*)/)?.[1] ?? '').split(';').length)
    expect(pointsPerCall).toEqual([5, 1])
    expect(r).toHaveLength(6)
    expect(r.every(x => x !== null)).toBe(true)
  })

  it('某一批失败只影响该批，返回 null 而不是错位', async () => {
    // 前两发是第一批的「首次 + 重试」，都失败才算这一批没救；
    // 第三发是第二批，正常返回
    stubRequest((opt, callIndex) => {
      if (callIndex <= 2) opt.fail({ errMsg: 'request:fail timeout' })
      else opt.success({ data: matrixFor(opt.url) })
    })

    const r = await walkingDistances(
      { lat: 0, lng: 0 },
      Array.from({ length: 6 }, (_, i) => ({ lat: i, lng: i })),
      0,
    )

    // 前 5 个是失败的那批，第 6 个属于后一批
    expect(r.slice(0, 5)).toEqual([null, null, null, null, null])
    expect(r[5]).not.toBeNull()
  })

  it('某一批被限流（HTTP 200 但 status 120）时同样只影响该批', async () => {
    // 实测限流返回的是 200 + status 120，不是网络错误 ——
    // 而 status 非 0 属于业务错误，不重试，所以这一批直接判失败
    stubRequest((opt, callIndex) => {
      if (callIndex === 1) opt.success({ data: { status: 120, message: '此key每秒请求量已达到上限' } })
      else opt.success({ data: matrixFor(opt.url) })
    })

    const r = await walkingDistances(
      { lat: 0, lng: 0 },
      Array.from({ length: 6 }, (_, i) => ({ lat: i, lng: i })),
      0,
    )

    expect(r.slice(0, 5)).toEqual([null, null, null, null, null])
    expect(r[5]).not.toBeNull()
    // 限流不重试：重试只会把配额烧得更狠
    expect(sent.length).toBe(2)
  })

  it('elements 数量不足时补 null，不错位挪用别人的距离', async () => {
    // 只有 2 个元素却问了 3 个坐标：第 3 个必须为 null。
    // 若用「取不到就复用上一个」这类兜底，会把 A 车场的距离安到 B 头上
    stubRequest(opt =>
      opt.success({
        data: { status: 0, message: 'query ok', result: { rows: [{ elements: [{ distance: 111, duration: 60 }, { distance: 222, duration: 120 }] }] } },
      }),
    )

    const r = await walkingDistances({ lat: 0, lng: 0 }, [
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 },
      { lat: 3, lng: 3 },
    ])

    expect(r.map(x => x?.distanceM ?? null)).toEqual([111, 222, null])
  })

  it('空入参不发请求', async () => {
    stubRequest(opt => opt.success({ data: matrixFor(opt.url) }))

    await expect(walkingDistances({ lat: 0, lng: 0 }, [])).resolves.toEqual([])
    expect(sent.length).toBe(0)
  })
})

describe('失败处理', () => {
  it('业务错误抛 QQMapError 并带上状态码，不重试', async () => {
    // status 非 0 是确定性失败（Key 错、参数错），重试只是白烧配额
    stubRequest(opt => opt.success({ data: { status: 111, message: '签名验证失败' } }))

    await expect(searchNearby('停车场', { lat: 0, lng: 0 }, 100)).rejects.toBeInstanceOf(QQMapError)
    expect(sent.length).toBe(1)
  })

  it('网络失败重试一次后成功', async () => {
    stubRequest((opt, callIndex) => {
      if (callIndex === 1) opt.fail({ errMsg: 'request:fail timeout' })
      else opt.success({ data: searchBody([RAW_POI]) })
    })

    // 半径必须盖住 fixture 的 320 米，否则会被本地过滤掉，这条就测不到重试了
    const pois = await searchNearby('停车场', { lat: 0, lng: 0 }, 1000)

    expect(pois).toHaveLength(1)
    expect(sent.length).toBe(2)
  })

  it('两次网络失败后抛 QQMapError', async () => {
    stubRequest(opt => opt.fail({ errMsg: 'request:fail timeout' }))

    await expect(searchNearby('停车场', { lat: 0, lng: 0 }, 100)).rejects.toBeInstanceOf(QQMapError)
    expect(sent.length).toBe(2)
  })
})
