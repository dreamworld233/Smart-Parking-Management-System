import {
  addVehicle,
  getCurrentLotId,
  getDefaultPlate,
  getSearchHistory,
  getVehicles,
  pushSearchHistory,
  removeVehicle,
  setCurrentLotId,
  VEHICLES_MAX,
} from '../../miniprogram/services/storage'

let store: Record<string, unknown> = {}

function stubWx(): void {
  store = {}
  const g = globalThis as unknown as {
    wx: {
      getStorageSync: (k: string) => unknown
      setStorageSync: (k: string, v: unknown) => void
    }
  }
  g.wx = {
    getStorageSync: k => store[k],
    setStorageSync: (k, v) => {
      store[k] = v
    },
  }
}

const KEY = 'qnt.searchHistory'

describe('getSearchHistory', () => {
  beforeEach(stubWx)

  it('没存过时返回空数组', () => {
    expect(getSearchHistory()).toEqual([])
  })

  it('存储里不是数组时返回空数组', () => {
    // 只写 `|| []` 挡的是假值：对象、字符串这类真值会一路进到页面，
    // 下一步就是 `history.filter is not a function` 当场抛
    store[KEY] = '万象城'
    expect(getSearchHistory()).toEqual([])
    store[KEY] = { 0: '万象城' }
    expect(getSearchHistory()).toEqual([])
  })

  it('剔除非字符串项而不是整批丢掉', () => {
    // 一条脏数据不该让用户攒下的历史全没了
    store[KEY] = ['万象城', 42, null, '齐鲁医院']
    expect(getSearchHistory()).toEqual(['万象城', '齐鲁医院'])
  })
})

describe('pushSearchHistory', () => {
  beforeEach(stubWx)

  it('新词置顶，并返回写入后的列表', () => {
    store[KEY] = ['齐鲁医院']
    expect(pushSearchHistory('万象城')).toEqual(['万象城', '齐鲁医院'])
    expect(store[KEY]).toEqual(['万象城', '齐鲁医院'])
  })

  it('重复的词提到最前而不是留两份', () => {
    store[KEY] = ['万象城', '齐鲁医院']
    expect(pushSearchHistory('齐鲁医院')).toEqual(['齐鲁医院', '万象城'])
  })

  it('超过上限时丢掉最旧的', () => {
    for (let i = 0; i < 8; i++) pushSearchHistory(`第${i}个`)
    const next = pushSearchHistory('最新的')
    expect(next).toHaveLength(8)
    expect(next[0]).toBe('最新的')
    expect(next).not.toContain('第0个')
  })

  it('以存储为准而不是内存里的旧值', () => {
    // 页面若拿 this.data.history 当基准，两个入口先后写入时会互相覆盖
    store[KEY] = ['别处写的']
    expect(pushSearchHistory('万象城')).toEqual(['万象城', '别处写的'])
  })
})

describe('getVehicles', () => {
  beforeEach(stubWx)

  it('没存过或非数组时返回空数组', () => {
    expect(getVehicles()).toEqual([])
    store['qnt.vehicles'] = '脏数据'
    expect(getVehicles()).toEqual([])
  })

  it('剔除非字符串项', () => {
    store['qnt.vehicles'] = ['京A12345', 42, null]
    expect(getVehicles()).toEqual(['京A12345'])
  })
})

describe('addVehicle / removeVehicle', () => {
  beforeEach(stubWx)

  it('添加置顶并去重', () => {
    store['qnt.vehicles'] = ['京B00001']
    expect(addVehicle('京A12345')).toEqual(['京A12345', '京B00001'])
  })

  it('重复添加提到最前不重复', () => {
    store['qnt.vehicles'] = ['京A12345', '京B00001']
    expect(addVehicle('京B00001')).toEqual(['京B00001', '京A12345'])
  })

  it('超上限丢最旧', () => {
    for (let i = 0; i < VEHICLES_MAX; i++) addVehicle(`京C${i}000`)
    const next = addVehicle('京D00000')
    expect(next).toHaveLength(VEHICLES_MAX)
    expect(next[0]).toBe('京D00000')
    expect(next).not.toContain('京C0000')
  })

  it('删除后返回剩余列表', () => {
    store['qnt.vehicles'] = ['京A12345', '京B00001']
    expect(removeVehicle('京A12345')).toEqual(['京B00001'])
  })

  it('删除默认车牌时同步 defaultPlate 旧 key', () => {
    store['qnt.defaultPlate'] = '京A12345'
    store['qnt.vehicles'] = ['京A12345', '京B00001']
    removeVehicle('京A12345')
    expect(getDefaultPlate()).toBe('京B00001')
  })

  it('删到空时 defaultPlate 清空', () => {
    store['qnt.defaultPlate'] = '京A12345'
    store['qnt.vehicles'] = ['京A12345']
    removeVehicle('京A12345')
    expect(getDefaultPlate()).toBe('')
  })

  it('删除非默认车牌不改 defaultPlate', () => {
    store['qnt.defaultPlate'] = '京A12345'
    store['qnt.vehicles'] = ['京A12345', '京B00001']
    removeVehicle('京B00001')
    expect(getDefaultPlate()).toBe('京A12345')
  })

  it('添加时旧 defaultPlate 失效（指向不存在的车）则重置到新列表首位', () => {
    store['qnt.defaultPlate'] = '京X00001'
    store['qnt.vehicles'] = ['京A12345']
    addVehicle('京B00001')
    expect(getDefaultPlate()).toBe('京B00001')
  })
})

describe('getDefaultPlate 回退车辆列表', () => {
  beforeEach(stubWx)

  it('defaultPlate 旧值优先', () => {
    store['qnt.defaultPlate'] = '京X00001'
    store['qnt.vehicles'] = ['京A12345']
    expect(getDefaultPlate()).toBe('京X00001')
  })

  it('无旧值回退车辆首条', () => {
    store['qnt.vehicles'] = ['京A12345', '京B00001']
    expect(getDefaultPlate()).toBe('京A12345')
  })
})

describe('currentLotId', () => {
  beforeEach(stubWx)

  it('空或脏形状返回空串', () => {
    expect(getCurrentLotId()).toBe('')
    store['qnt.currentLotId'] = 42
    expect(getCurrentLotId()).toBe('')
  })

  it('set 后能读回', () => {
    setCurrentLotId('lot1')
    expect(getCurrentLotId()).toBe('lot1')
  })
})
