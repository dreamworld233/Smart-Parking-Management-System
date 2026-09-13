import { getSearchHistory, pushSearchHistory } from '../../miniprogram/services/storage'

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
