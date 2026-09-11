> ⚠️ **本文档已作废（2026-09-11）。** 计划目标是「到达即停」，与需求基线（2026-09-10 定稿）的「未来时段预约锁位」冲突；其中「Mock 数据先驱动开发」也与课程要求「真题真做，不允许随意模拟数据」冲突。
> 生效文档：`docs/superpowers/specs/2026-09-11-smart-parking-miniprogram-ui-design.md`。新的实现计划将基于该文档重写。

# 微信小程序智能停车（MVP 到达即停）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可用的微信小程序 MVP：首次启动静默登录，主页默认以当前位置为终点搜索并展示附近停车场，可搜索目的地刷新，可创建“到达即停”订单并在订单页可见。

**Architecture:** 前端直连腾讯地图 SDK，后端以 Mock 数据先驱动开发（接口形状对齐未来真实 API）。全局共享 session，主页/订单/我的三栏 tabBar。页面用 TS + Skyline 组件编写（复用现有导航栏组件）。

**Tech Stack:** 微信小程序（TS / Skyline / glass-easel）、腾讯地图 JS SDK（wx）…真实 SDK 配置延后；当前 Mock 服务层 + 类型先落地。测试：jest + miniprogram-simulate。

---

## 0. 前置准备

- [ ] **Step 0.1 确认项目目录结构与命名**

  目录：`G:\114514\QNT`  
  小程序根：`G:\114514\QNT\miniprogram`（`miniprogramRoot`）
  页面均以 `Component` 风格实现（现有骨架即 Component），tabBar 页面需支持 `Component`，验证兼容性。

- [ ] **Step 0.2 配置权限（app.json）**

  定位需要在小程序后台申请 `scope.userLocation`；本计划先用 Mock，登录后再接真实腾讯 SDK。当前阶段不强制定位授权配置，运行可先 mock。

## 1. 建立测试与 TS 工具链

**Files:**
- Create: `package.json`（更新 devDeps）
- Create: `jest.config.js`
- Create: `miniprogram/tsconfig`（已在 `tsconfig.json` 使用 strict，无改动）
- Create: `tests/`（存放非小程序全局 .test 文件）
- Test: 无既有测试，需安装依赖。

- [ ] **Step 1.1 安装 jest、@types/jest、miniprogram-simulate**

  运行：
  ```bash
  cd "G:/114514/QNT"
  npm install --save-dev jest @types/jest miniprogram-simulate ts-jest
  ```
  期望：node_modules 出现，package.json 增加 devDependencies。

- [ ] **Step 1.2 建立 jest.config.js**

  在项目根新建 `jest.config.js`：
  ```js
  module.exports = {
    testEnvironment: 'node',
    transform: {
      '^.+\\.ts$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'js'],
    testMatch: ['**/tests/**/*.test.ts'],
  };
  ```

- [ ] **Step 1.3 建立最小冒烟测试**

  在 `tests/smoke.test.ts` 写入：
  ```ts
  it('test toolchain works', () => {
    expect(1 + 1).toBe(2)
  })
  ```

- [ ] **Step 1.4 运行冒烟测试**

  运行：`npx jest`  
  期望：1 个测试通过。

- [ ] **Step 1.5 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add package.json jest.config.js tests/smoke.test.ts
  git commit -m "chore: init jest toolchain for miniprogram"
  ```

## 2. 数据类型与工具函数（先写纯函数，配测试）

**Files:**
- Create: `miniprogram/utils/geo.ts`
- Create: `miniprogram/utils/format.ts`
- Create: `tests/geo.test.ts`
- Create: `tests/format.test.ts`

- [ ] **Step 2.1 定义 Geo/价格/距离纯函数（红）**

  先写测试 `tests/geo.test.ts`：
  ```ts
  import { distanceBetween } from '../miniprogram/utils/geo'
  import { formatDistance, formatPrice } from '../miniprogram/utils/format'

  describe('geo & format utils', () => {
    it('computes haversine distance in meters', () => {
      // 北京天安门附近两点约 1100m
      const d = distanceBetween(
        { lat: 39.908, lng: 116.397 },
        { lat: 39.917, lng: 116.397 }
      )
      expect(d).toBeGreaterThan(1000)
      expect(d).toBeLessThan(1200)
    })
    it('formats distance: meters below 1000, km above', () => {
      expect(formatDistance(400)).toBe('400m')
      expect(formatDistance(1500)).toBe('1.5km')
    })
    it('formats price: per hour string', () => {
      expect(formatPrice({ basePerHour: 5, ruleText: '每小时5元' })).toBe('5元/小时')
    })
  })
  ```
  期望：失败，因 import 文件不存在。

- [ ] **Step 2.2 实现纯函数（绿）**

  新建 `miniprogram/utils/geo.ts`：
  ```ts
  export type LatLng = { lat: number; lng: number }

  const R = 6371000
  export function distanceBetween(a: LatLng, b: LatLng): number {
    const toRad = (x: number) => (x * Math.PI) / 180
    const dLat = toRad(b.lat - a.lat)
    const dLng = toRad(b.lng - a.lng)
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(s))
  }
  ```
  新建 `miniprogram/utils/format.ts`：
  ```ts
  import type { ParkingLot } from './types'

  export function formatDistance(m: number): string {
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`
  }

  export function formatPrice(p: ParkingLot['price']): string {
    return `${p.basePerHour}元/小时`
  }
  ```
  再建 `miniprogram/utils/types.ts`（保存公共类型，供各模块 import）：
  ```ts
  export type LatLng = { lat: number; lng: number }

  export type ParkingLot = {
    id: string
    name: string
    distanceM: number
    freeSpots: number
    totalSpots: number
    price: {
      currency: 'CNY'
      unit: 'hour'
      basePerHour: number
      capPerDay?: number
      ruleText: string
    }
    openHours?: string
    tags?: string[]
    location: LatLng
  }

  export type ParkingQuery = {
    destination: LatLng
    radiusM: number
    sortBy: 'distance' | 'price' | 'freeSpots'
  }

  export type OrderStatus = 'active' | 'pending_payment' | 'completed'
  export type Order = {
    id: string
    lotId: string
    lotName: string
    status: OrderStatus
    startTime: string
    endTime?: string
    estimatedFee?: number
    finalFee?: number
  }
  ```
  期望：测试通过（ts-jest 编译 import 正常）。

- [ ] **Step 2.3 运行测试**

  运行：`npx jest`
  期望：全部通过。

- [ ] **Step 2.4 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram/utils tests
  git commit -m "feat: add geo distance & format utils"
  ```

## 3. Mock 服务层（parking/order/auth）

**Files:**
- Create: `miniprogram/services/http.ts`（轻量封装，先空实现或本阶段可用）
- Create: `miniprogram/services/auth.ts`
- Create: `miniprogram/services/parking.ts`
- Create: `miniprogram/services/order.ts`
- Create: `miniprogram/services/mockData.ts`
- Test: `tests/services.test.ts`

- [ ] **Step 3.1 写 mockData 与 auth 测试（红）**

  先写 `miniprogram/services/mockData.ts`：
  ```ts
  import type { ParkingLot } from '../utils/types'

  export const mockParkingLots: ParkingLot[] = [
    {
      id: 'p1',
      name: '中心广场地下停车场',
      distanceM: 200,
      freeSpots: 12,
      totalSpots: 120,
      price: { currency: 'CNY', unit: 'hour', basePerHour: 6, ruleText: '每小时6元' },
      openHours: '00:00-24:00',
      tags: ['室内'],
      location: { lat: 39.908, lng: 116.397 },
    },
    {
      id: 'p2',
      name: '国贸商圈停车场',
      distanceM: 800,
      freeSpots: 3,
      totalSpots: 60,
      price: { currency: 'CNY', unit: 'hour', basePerHour: 10, ruleText: '首小时10元' },
      openHours: '08:00-22:00',
      tags: ['商圈'],
      location: { lat: 39.909, lng: 116.4 },
    },
  ]
  ```

  写 auth 接口 `miniprogram/services/auth.ts`：
  ```ts
  export type Session = { token: string; userId: string; expireAt: number }
  export const mockSession: Session = {
    token: 'mock-token-001',
    userId: 'u1',
    expireAt: Date.now() + 1000 * 60 * 60 * 24,
  }
  ```

  测试 `tests/services.test.ts`：
  ```ts
  import { mockParkingLots } from '../miniprogram/services/mockData'
  import { mockSession } from '../miniprogram/services/auth'

  it('mock session is available', () => {
    expect(mockSession.token).toBeTruthy()
  })
  it('mock parking list non-empty & shape aligned', () => {
    expect(mockParkingLots.length).toBeGreaterThan(0)
    const first = mockParkingLots[0]
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('freeSpots')
    expect(first).toHaveProperty('price')
    expect(first.price).toHaveProperty('basePerHour')
  })
  ```

- [ ] **Step 3.2 运行测试**

  运行：`npx jest`
  期望：全部通过。

- [ ] **Step 3.3 实现 parking/order 查询纯函数**

  新建 `miniprogram/services/parking.ts`：
  ```ts
  import type { ParkingLot, ParkingQuery } from '../utils/types'
  import { mockParkingLots } from './mockData'
  import { distanceBetween } from '../utils/geo'

  export async function searchParking(query: ParkingQuery): Promise<ParkingLot[]> {
    const inRadius = mockParkingLots.filter(
      (p) => distanceBetween(p.location, query.destination) <= query.radiusM
    )
    switch (query.sortBy) {
      case 'price':
        inRadius.sort((a, b) => a.price.basePerHour - b.price.basePerHour)
        break
      case 'freeSpots':
        inRadius.sort((a, b) => b.freeSpots - a.freeSpots)
        break
      default:
        inRadius.sort((a, b) => a.distanceM - b.distanceM)
    }
    return inRadius
  }
  ```
  新建 `miniprogram/services/order.ts`：
  ```ts
  import type { Order } from '../utils/types'

  let seq = 0
  export async function createOrder(lotId: string, lotName: string): Promise<Order> {
    seq += 1
    const order: Order = {
      id: `o-${Date.now()}-${seq}`,
      lotId,
      lotName,
      status: 'active',
      startTime: new Date().toISOString(),
    }
    return order
  }
  ```

  补充 `tests/services.test.ts` 增加用例：
  ```ts
  import { searchParking } from '../miniprogram/services/parking'
  import { createOrder } from '../miniprogram/services/order'

  it('searchParking returns in-radius only', async () => {
    const far = { lat: 39.0, lng: 115.0 } // 距所有 mock 场很远
    const res = await searchParking({ destination: far, radiusM: 1000, sortBy: 'distance' })
    expect(res.length).toBe(0)
  })
  it('createOrder creates active order', async () => {
    const o = await createOrder('p1', '中心广场地下停车场')
    expect(o.status).toBe('active')
    expect(o.lotName).toBe('中心广场地下停车场')
  })
  ```

- [ ] **Step 3.4 运行测试**

  运行：`npx jest`
  期望：全部通过。

- [ ] **Step 3.5 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram/services tests
  git commit -m "feat: add parking search & order mock services"
  ```

## 4. tabBar 三栏结构 + 页面注册（主页/订单/我的）

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/index/index.*`（作为主页，保留）
- Create: `miniprogram/pages/orders/index.*`
- Create: `miniprogram/pages/profile/index.*`

tabBar 要求页面在 `pages` 注册且在 tabBar 用图标。MVP 先不引入真实图标文件，若工具强制校验则后续补图标；本步骤先改 app.json 注册三页。

- [ ] **Step 4.1 注册三个页面并加 tabBar**

  修改 `miniprogram/app.json` 的 `pages`：
  ```json
  "pages": [
    "pages/index/index",
    "pages/orders/index",
    "pages/profile/index"
  ],
  ```
  加入 tabBar 配置（占位色值与选中态）：
  ```json
  "tabBar": {
    "custom": false,
    "color": "#999999",
    "selectedColor": "#3B82F6",
    "backgroundColor": "#FFFFFF",
    "borderStyle": "black",
    "list": [
      { "pagePath": "pages/index/index", "text": "主页" },
      { "pagePath": "pages/orders/index", "text": "订单" },
      { "pagePath": "pages/profile/index", "text": "我的" }
    ]
  },
  ```
  > 注意：微信 tabBar 不带 iconPath 也可运行（文字 tab）。若后端工具要求 icon，需后续补 81x81 png。

- [ ] **Step 4.2 新建 orders 与 profile 占位页**

  新建 `miniprogram/pages/orders/index.json`：
  ```json
  { "usingComponents": {} }
  ```
  `index.wxml`：
  ```xml
  <view class="orders-page"><text>订单</text></view>
  ```
  `index.wxss`：
  ```css
  .orders-page { padding: 40rpx; }
  ```
  `index.ts`：
  ```ts
  Component({
    data: {},
  })
  ```
  新建 `miniprogram/pages/profile/index.json`：
  ```json
  { "usingComponents": {} }
  ```
  `index.wxml`：
  ```xml
  <view class="profile-page"><text>我的</text></view>
  ```
  `index.wxss`：
  ```css
  .profile-page { padding: 40rpx; }
  ```
  `index.ts`：
  ```ts
  Component({
    data: {},
  })
  ```

- [ ] **Step 4.3 在微信开发者工具加载验证**

  打开项目，确认 tabBar 三栏可切换、首页正常。
  期望：无编译错误，可看到主页/订单/我的 tab。

- [ ] **Step 4.4 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram/app.json miniprogram/pages
  git commit -m "feat: add 3-tab navigation shell"
  ```

## 5. 登录流程（静默登录）

**Files:**
- Create: `miniprogram/services/login.ts`
- Modify: `miniprogram/app.ts`
- Test: `tests/login.test.ts`

- [ ] **Step 5.1 抽象登录函数（红）**

  新建 `miniprogram/services/login.ts`：
  ```ts
  import type { Session } from './auth'
  import { mockSession } from './auth'

  // 真实后端接入前，返回 mock session
  export function silentLogin(): Promise<Session> {
    return new Promise((resolve) => {
      wx.login({
        success: () => resolve(mockSession),
        fail: () => resolve(mockSession), // mock 阶段不因 wx.login 失败而失败
      })
    })
  }
  ```
  测试 `tests/login.test.ts`：
  ```ts
  import { silentLogin } from '../miniprogram/services/login'

  it('returns session after silent login', async () => {
    const s = await silentLogin()
    expect(s.token).toBeTruthy()
  })
  ```
  问题：wx.login 在 node/jest 环境不存在。需在测试 mock wx。改测试：
  ```ts
  global.wx = { login: (_: any) => {} } as any
  ```
  先写该测试期望失败（因 wx 未定义会导致 TypeError）。期望：失败（无法运行）。

  改为显式 stub（见 Step 5.2 同步调整）。

- [ ] **Step 5.2 为 jest 提供 wx stub**

  在 `jest.config.js` 加 setupFiles 指向一个 stub 文件。  
  新建 `tests/setup.ts`：
  ```ts
  global.wx = {
    login: (opts: any) => opts && opts.success && opts.success({ code: 'mock-code' }),
    getStorageSync: () => '',
    setStorageSync: () => {},
    navigateTo: () => {},
  } as any
  ```
  更新 `jest.config.js`：
  ```js
  setupFiles: ['<rootDir>/tests/setup.ts'],
  ```

- [ ] **Step 5.3 运行测试**

  运行：`npx jest`
  期望：login 测试通过，原工具测试也通过。

- [ ] **Step 5.4 接入 App.onLaunch**

  修改 `miniprogram/app.ts`：
  ```ts
  import { silentLogin } from './services/login'
  import type { Session } from './services/auth'

  App<IAppOption>({
    globalData: {
      session: null as Session | null,
    },
    async onLaunch() {
      this.globalData.session = await silentLogin()
    },
  })
  ```
  > `IAppOption` 若未定义 session 字段，需同步更新 `typings/index.d.ts` 的 `IAppOption`（见 Step 5.5）。

- [ ] **Step 5.5 更新 IAppOption 类型**

  找到 `typings/index.d.ts` 或对应声明 `IAppOption`，增加：
  ```ts
  interface IAppOption {
    globalData: {
      session?: { token: string; userId: string; expireAt: number } | null
    }
  }
  ```
  若已有 IAppOption，按此扩展。

- [ ] **Step 5.6 开发者工具验证登录日志**

  打开工具，Console 看登录流程无报错。
  期望：无异常。

- [ ] **Step 5.7 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram typings tests jest.config.js
  git commit -m "feat: add silent login with mock session"
  ```

## 6. 主页核心：目的地 + 停车场列表

**Files:**
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.wxss`
- Modify: `miniprogram/pages/index/index.json`
- Create: `tests/home.test.ts`（测试 state 转换函数）

- [ ] **Step 6.1 设计组件内状态与纯 reducer**

  在 `miniprogram/pages/index/index.ts` 中定义类型：
  ```ts
  import type { ParkingLot, ParkingQuery, LatLng } from '../../utils/types'
  import { searchParking } from '../../services/parking'

  type HomeState = {
    status: 'loading' | 'error' | 'empty' | 'success'
    destination: LatLng | null
    parkingList: ParkingLot[]
    query: ParkingQuery
  }
  ```

- [ ] **Step 6.2 写 reducer/纯状态函数测试（红）**

  新建 `miniprogram/pages/index/homeState.ts`：
  ```ts
  import type { ParkingLot } from '../../utils/types'

  export function statusOf(list: ParkingLot[], loading: boolean): HomeStatus {
    if (loading) return 'loading'
    if (!list.length) return 'empty'
    return 'success'
  }
  export type HomeStatus = 'loading' | 'error' | 'empty' | 'success'
  ```
  测试 `tests/home.test.ts`：
  ```ts
  import { statusOf } from '../miniprogram/pages/index/homeState'
  it('statusOf maps states', () => {
    expect(statusOf([], true)).toBe('loading')
    expect(statusOf([], false)).toBe('empty')
    expect(statusOf([{} as any], false)).toBe('success')
  })
  ```
  期望：失败（模块不存在）。

- [ ] **Step 6.3 实现并刷新列表（绿）**

  在 `miniprogram/pages/index/index.ts` 的 Component 增加 data 与 methods：
  ```ts
  data: {
    status: 'loading',
    destinationName: '当前位置',
    parkingList: [],
  },
  lifetimes: {
    async attached() {
      this.refresh()
    },
  },
  methods: {
    async refresh() {
      this.setData({ status: 'loading' })
      const query: ParkingQuery = {
        destination: { lat: 39.908, lng: 116.397 }, // mock 中心；后续接定位
        radiusM: 3000,
        sortBy: 'distance',
      }
      const list = await searchParking(query)
      this.setData({ parkingList: list })
      this.setData({ status: statusOf(list, false) })
    },
    onDestinationSelected(e: any) {
      // 后续腾讯地图搜索回填
    },
  },
  ```

- [ ] **Step 6.4 渲染列表 WXML**

  重写 `miniprogram/pages/index/index.wxml`（去掉旧 userinfo 样例，改为列表）：
  ```xml
  <navigation-bar title="附近停车" back="{{false}}" color="black" background="#FFF" />
  <view class="home">
    <view class="dest-bar">
      <text class="dest-name">{{destinationName}}</text>
    </view>
    <view class="filter-row">
      <text>距离优先</text>
    </view>
    <block wx:if="{{status === 'loading'}}">
      <view class="center-hint">加载中…</view>
    </block>
    <block wx:elif="{{status === 'empty'}}">
      <view class="center-hint">附近暂无停车场，试试扩大范围</view>
    </block>
    <block wx:else>
      <view
        wx:for="{{parkingList}}"
        wx:key="id"
        class="parking-card"
        data-id="{{item.id}}"
        bindtap="onCardTap"
      >
        <view class="card-title">{{item.name}}</view>
        <view class="card-meta">
          <text>{{item.freeSpots}} 空位</text>
          <text>{{item.price.ruleText}}</text>
        </view>
      </view>
    </block>
  </view>
  ```

- [ ] **Step 6.5 更新样式 index.wxss**

  重写为干净列表样式（白底、卡片圆角、间距 24rpx）。

- [ ] **Step 6.6 跑测试**

  运行：`npx jest`
  期望：通过。

- [ ] **Step 6.7 开发者工具验证**

  首页应出现 2 条 mock 停车场卡片。
  期望：看到中心广场地下停车场与国贸商圈停车场，带余位与收费。

- [ ] **Step 6.8 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram tests
  git commit -m "feat: render parking list on home with mock search"
  ```

## 7. 目的地搜索（接入腾讯地图检索能力前，先用文本候选）

**Files:**
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Create: `tests/dest.test.ts`

- [ ] **Step 7.1 写目的地候选转换（红）**

  新建 `miniprogram/pages/index/destCandidates.ts`：
  ```ts
  export type Destination = { name: string; lat: number; lng: number }
  // 临时内置候选；腾讯地图 POI 就绪后替换
  export const CANDIDATES: Destination[] = [
    { name: '中心广场', lat: 39.908, lng: 116.397 },
    { name: '国贸商圈', lat: 39.909, lng: 116.4 },
  ]
  export function matchCandidates(keyword: string): Destination[] {
    const q = keyword.trim()
    if (!q) return []
    return CANDIDATES.filter((c) => c.name.includes(q)).slice(0, 5)
  }
  ```
  测试 `tests/dest.test.ts`：
  ```ts
  import { matchCandidates } from '../miniprogram/pages/index/destCandidates'
  it('matches by keyword', () => {
    expect(matchCandidates('国贸').length).toBeGreaterThan(0)
    expect(matchCandidates('zzz').length).toBe(0)
  })
  ```

- [ ] **Step 7.2 实现并接入输入框**

  在 `index.ts` data 增加 `keyword: ''`, `candidates: []`；  
  WXML 加 input，方法：
  ```ts
  onKeywordInput(e: any) {
    const keyword = e.detail.value
    this.setData({ keyword, candidates: matchCandidates(keyword) })
  },
  onPickDest(e: any) {
    const { name, lat, lng } = e.currentTarget.dataset.dest
    this.setData({
      destinationName: name,
      keyword: name,
      candidates: [],
    })
    // 用所选项刷新搜索
    this.refreshWithDest({ name, lat, lng })
  },
  async refreshWithDest(dest) {
    this.setData({ status: 'loading' })
    const list = await searchParking({ destination: dest, radiusM: 3000, sortBy: 'distance' })
    this.setData({ parkingList: list, status: statusOf(list, false) })
  },
  ```

- [ ] **Step 7.3 跑测试 + 工具验证**

  运行：`npx jest` 通过；工具里输入“国贸”选中国贸商圈，列表按该点重算。
  期望：通过；选择目的地后列表变化。

- [ ] **Step 7.4 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram tests
  git commit -m "feat: destination keyword candidates & re-search"
  ```

## 8. 停车场详情页与下单

**Files:**
- Create: `miniprogram/pages/detail/index.*`
- Modify: `miniprogram/app.json`
- Test: `tests/orderAction.test.ts`

- [ ] **Step 8.1 新增 detail 页面注册**

  修改 `miniprogram/app.json` 的 `pages` 增加：
  ```json
  "pages/detail/index"
  ```

- [ ] **Step 8.2 详情页数据与下单逻辑（红）**

  `detail/index.ts` 用组件接收 `options.id`（navigateTo 传参）：
  ```ts
  import type { ParkingLot } from '../../utils/types'
  import { createOrder } from '../../services/order'
  import { getParkingById } from '../../services/parking'

  Component({
    data: { lot: null as ParkingLot | null, orderPlaced: false },
    lifetimes: {
      attached() {
        const id = (this as any).options?.id
        if (id) {
          const lot = getParkingById(id)
          this.setData({ lot })
        }
      },
    },
    methods: {
      async onStartParking() {
        const lot = this.data.lot
        if (!lot) return
        const order = await createOrder(lot.id, lot.name)
        this.setData({ orderPlaced: true })
        wx.showToast({ title: '下单成功', icon: 'success' })
      },
    },
  })
  ```
  需在 `parking.ts` 增加 `getParkingById(id)`：
  ```ts
  export function getParkingById(id: string): ParkingLot | undefined {
    return mockParkingLots.find((p) => p.id === id)
  }
  ```

- [ ] **Step 8.3 详情页 UI（WXML/WXSS/JSON）**

  `detail/index.wxml`：
  ```xml
  <navigation-bar title="停车场详情" back color="black" background="#FFF" />
  <view class="detail" wx:if="{{lot}}">
    <view class="name">{{lot.name}}</view>
    <view>空位 {{lot.freeSpots}} / {{lot.totalSpots}}</view>
    <view>{{lot.price.ruleText}}</view>
    <view wx:if="{{lot.openHours}}">营业时间 {{lot.openHours}}</view>
    <button bindtap="onStartParking" disabled="{{orderPlaced}}">
      {{orderPlaced ? '已下单' : '到达即停'}}
    </button>
  </view>
  ```
  补充 `.json`（复用导航栏组件）、`.wxss` 基础样式。

- [ ] **Step 8.4 主页卡片点击跳转**

  在 `index.ts` methods 增加：
  ```ts
  onCardTap(e: any) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  },
  ```

- [ ] **Step 8.5 跑测试 + 工具验证**

  运行：`npx jest`；工具点击卡片进入详情，点“到达即停”出现“下单成功”。
  期望：通过；跳转与下单正常。

- [ ] **Step 8.6 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram
  git commit -m "feat: parking detail & start-parking order creation"
  ```

## 9. 订单页（进行中/待支付/历史）

**Files:**
- Modify: `miniprogram/services/order.ts`
- Modify: `miniprogram/pages/orders/index.*`
- Test: `tests/orderList.test.ts`

- [ ] **Step 9.1 订单服务增加分组（红）**

  在 `order.ts` 增加内存存储：
  ```ts
  const localOrders: Order[] = []
  // createOrder 时 push
  export async function getOrders(): Promise<Order[]> {
    return [...localOrders]
  }
  export function groupOrders(orders: Order[]): {
    active: Order[]; pending_payment: Order[]; completed: Order[]
  } {
    return {
      active: orders.filter((o) => o.status === 'active'),
      pending_payment: orders.filter((o) => o.status === 'pending_payment'),
      completed: orders.filter((o) => o.status === 'completed'),
    }
  }
  ```
  测试 `tests/orderList.test.ts`：
  ```ts
  import { groupOrders } from '../miniprogram/services/order'
  it('groups orders by status', () => {
    const g = groupOrders([
      { id: 'a', lotId: 'p1', lotName: 'x', status: 'active', startTime: '' },
      { id: 'b', lotId: 'p2', lotName: 'y', status: 'completed', startTime: '' },
    ])
    expect(g.active.length).toBe(1)
    expect(g.completed.length).toBe(1)
    expect(g.pending_payment.length).toBe(0)
  })
  ```

- [ ] **Step 9.2 订单页渲染分组**

  重写 `pages/orders/index.ts`：
  ```ts
  import { getOrders, groupOrders } from '../../services/order'
  Component({
    data: { sections: [] as any },
    methods: {
      async load() {
        const orders = await getOrders()
        const g = groupOrders(orders)
        this.setData({ sections: g })
      },
    },
    lifetimes: { attached() { this.load() } },
  })
  ```
  WXML 展示三块，未读/空时显示空态。

- [ ] **Step 9.3 跑测试 + 工具验证**

  运行：`npx jest` 通过；完成一次下单后切到订单页应看到进行中单。
  期望：通过；进行中单可见。

- [ ] **Step 9.4 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram tests
  git commit -m "feat: orders page grouped by status"
  ```

## 10. 我的页（资料 + 权限引导）

**Files:**
- Modify: `miniprogram/pages/profile/index.ts`
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile/index.wxss`
- Modify: `miniprogram/pages/profile/index.json`
- Create: `tests/profile.test.ts`

- [ ] **Step 10.1 写可测设置入口逻辑（红）**

  新建 `miniprogram/pages/profile/profileSetting.ts`：
  ```ts
  export type ProfileAction =
    | { kind: 'open_setting' }
    | { kind: 'toast'; message: string }

  // 定位被拒时引导用户去设置；否则无需提示
  export function decideOpenSetting(
    locationGranted: boolean
  ): ProfileAction | null {
    if (!locationGranted) {
      return { kind: 'open_setting' }
    }
    return null
  }
  ```
  测试 `tests/profile.test.ts`：
  ```ts
  import { decideOpenSetting } from '../miniprogram/pages/profile/profileSetting'

  it('guides to settings when location denied', () => {
    expect(decideOpenSetting(false)).toEqual({ kind: 'open_setting' })
  })
  it('no prompt when location granted', () => {
    expect(decideOpenSetting(true)).toBeNull()
  })
  ```
  期望：失败（模块不存在）。

- [ ] **Step 10.2 实现我的页 UI**

  重写 `miniprogram/pages/profile/index.ts`：
  ```ts
  import { decideOpenSetting } from './profileSetting'

  Component({
    data: {
      userId: 'u1',
      locationGranted: false,
    },
    methods: {
      onCheckLocation() {
        wx.getSetting({
          success: (res) => {
            const granted = !!res.authSetting['scope.userLocation']
            this.setData({ locationGranted: granted })
            const action = decideOpenSetting(granted)
            if (action && action.kind === 'open_setting') {
              wx.openSetting()
            } else {
              wx.showToast({ title: '定位已开启', icon: 'success' })
            }
          },
        })
      },
    },
  })
  ```
  重写 `miniprogram/pages/profile/index.wxml`：
  ```xml
  <navigation-bar title="我的" back="{{false}}" color="black" background="#FFF" />
  <view class="profile">
    <view class="row">
      <text class="label">用户 ID</text>
      <text class="value">{{userId}}</text>
    </view>
    <view class="row">
      <text class="label">定位权限</text>
      <text class="value">{{locationGranted ? '已开启' : '未开启'}}</text>
    </view>
    <button bindtap="onCheckLocation">检查并引导定位授权</button>
  </view>
  ```
  更新 `index.json` 复用导航栏组件：
  ```json
  {
    "usingComponents": {
      "navigation-bar": "/components/navigation-bar/navigation-bar"
    }
  }
  ```
  `index.wxss` 基础行样式（间距 24rpx、按钮圆角）。

- [ ] **Step 10.3 跑测试 + 工具验证**

  运行：`npx jest`
  期望：通过；我的页可切换，检查授权按钮存在。

- [ ] **Step 10.4 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram/pages/profile tests
  git commit -m "feat: profile page with location permission guidance"
  ```

## 11. 腾讯地图 SDK 接入（规划）与真实定位

**Files:**
- Modify: `miniprogram/services/location.ts`
- Modify: `miniprogram/app.json`
- Modify: `project.config.json`

- [ ] **Step 11.1 申请腾讯地图 Key 并写入配置**

  需要小程序后台（appid `wx657c73ccec33ea8d`）配置：
  - `getLocation` 权限描述
  - 腾讯位置服务 Key（在 qqmap 控制台申请，域名白名单加 `https://apis.map.qq.com`）
  本计划不写死真实 Key，改由开发者工具本地变量注入。

- [ ] **Step 11.2 定位能力封装（先可测）**

  新建 `miniprogram/services/location.ts`，复用 Task 2 已定义的 `LatLng`：
  ```ts
  import type { LatLng } from '../utils/types'

  export function getCurrentLocation(): Promise<LatLng> {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: (r) => resolve({ lat: r.latitude, lng: r.longitude }),
        fail: reject,
      })
    })
  }
  ```
  将 `index.ts` 中默认 mock 中心替换为：attached 时先取定位，失败回退 mock 中心。

- [ ] **Step 11.3 工具真机验证定位**

  开发者工具开启模拟定位或真机预览；主页应拉取当前位置附近停车场。
  期望：获取到真实经纬度并搜索成功。

- [ ] **Step 11.4 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram project.config.json
  git commit -m "feat: real location fetch with mock fallback"
  ```

## 12. 收尾：error/empty 状态 + 空态样式完善

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`（空态、错误态文案与重试）
- Modify: `miniprogram/pages/index/index.ts`（try/catch 置 error）
- Test: `tests/homeState.test.ts`（补 error 状态覆盖）

- [ ] **Step 12.1 补状态覆盖测试**

  在 `homeState.ts` 增 `errorText` 函数返回提示；测试覆盖 error。

- [ ] **Step 12.2 接入错误处理与重试**

  `index.ts refresh()` 包 try/catch：
  ```ts
  try {
    ...
  } catch (e) {
    this.setData({ status: 'error', errorText: '加载失败，请重试' })
  }
  ```
  WXML 加“点击重试”按钮触发 `this.refresh()`。

- [ ] **Step 12.3 跑测试 + 验证**

  `npx jest` 通过；手动断网触发可看到空态与错误态。
  期望：通过；两态均有文案。

- [ ] **Step 12.4 Commit**

  ```bash
  cd "G:/114514/QNT"
  git add miniprogram tests
  git commit -m "feat: error & empty states with retry"
  ```

## 13. 后续接入真实订单/停车平台说明（不做为当前计划内实现）

真实停车场余位/收费数据需接入停车场平台或政务/商业开放 API。本计划用 Mock 按契约开发；接入时仅替换 `miniprogram/services/parking.ts` 数据源，不改 UI 契约。留到主流程稳定后再定具体对接方。

## DoD 对照

- [ ] 首次进入主页自动定位（或 mock 中心）返回停车场列表。
- [ ] 支持搜索指定目的地刷新推荐。
- [ ] 卡片展示余位、收费、距离。
- [ ] 可创建进行中订单并可在订单页看到。
- [ ] 登录链路稳定（mock session）。
- [ ] tabBar 三栏主页/订单/我的正常。
