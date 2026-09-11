# 公共停车场预约系统 · 计划 1：地基与免费层 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通「启动选身份 → 首页定位并推荐周边车场 → 搜索 → 车场详情」这条免费链路，并把领域逻辑（计费、评分、排序、时间窗口）以可单测的纯函数形式落地。

**Architecture:** 分三层。`domain/` 是零 `wx` 依赖的纯函数层，承载全部业务规则，用 jest 单测；`services/` 是薄适配层，封装 `wx.*` 与腾讯地图 WebService，不写业务规则；`pages/` + `components/` 只做渲染与事件转发。业务规则必须在 `domain/`，页面里不出现计费或评分算式。

**Tech Stack:** 原生微信小程序（TypeScript / Skyline / glass-easel）、腾讯位置服务 WebService REST API、jest + ts-jest（仅测 `domain/`）、`wx.openLocation` 做导航前往。

**范围说明：** 本计划只覆盖免费层（搜索 / 智能推荐 / 导航前往）。付费层（预约确认、凭证、订单中心）见计划 2；车场端见计划 3。设计依据：`docs/superpowers/specs/2026-09-11-smart-parking-miniprogram-ui-design.md`。

---

## 文件结构

| 路径 | 职责 |
|---|---|
| `jest.config.js`、`tsconfig.test.json` | 测试工具链 |
| `miniprogram/domain/types.ts` | 领域类型，全项目共用 |
| `miniprogram/domain/pricing.ts` | 预支停车费、服务费、合计 |
| `miniprogram/domain/time.ts` | 到达时间窗口 `[now, now+2h]`、入场截止 |
| `miniprogram/domain/scoring.ts` | 五因子归一化与加权评分 |
| `miniprogram/domain/sort.ts` | 四种排序（综合/距离/费用/空位） |
| `miniprogram/domain/format.ts` | 金额、距离、余位、倒计时的展示格式化 |
| `miniprogram/styles/tokens.wxss` | 设计 token（色彩、字阶、间距、圆角、阴影） |
| `miniprogram/services/storage.ts` | 角色、会话读写 |
| `miniprogram/services/location.ts` | 定位与授权 |
| `miniprogram/services/qqmap.ts` | 腾讯位置服务 WebService 调用 |
| `miniprogram/services/lot.ts` | POI + 估算字段聚合为 `ParkingLot` |
| `miniprogram/custom-tab-bar/*` | 按角色重建的 tabBar |
| `miniprogram/components/lot-card/*` | 车场卡片（双动作） |
| `miniprogram/components/sort-chips/*` | 排序 chips |
| `miniprogram/components/state-view/*` | 空态 / 骨架屏 / 错误态 |
| `miniprogram/pages/role-select/*` | 身份选择 |
| `miniprogram/pages/home/*` | 首页 |
| `miniprogram/pages/search/*` | 搜索 |
| `miniprogram/pages/lot-detail/*` | 车场详情 |

**删除**：`miniprogram/pages/index/`、`miniprogram/pages/logs/`（模板页，Task 1 清理）。

---

## Task 0: 技术验证 — Skyline 下地图浮层是否可行

**这是整个计划的风险闸门。** 结论决定首页采用「地图铺满 + 拖拽面板」还是退回「固定上下分栏」。不写测试，只做一次性验证，验证完保留该页作为回归页。

**Files:**
- Create: `miniprogram/pages/spike-map/spike-map.ts`
- Create: `miniprogram/pages/spike-map/spike-map.wxml`
- Create: `miniprogram/pages/spike-map/spike-map.wxss`
- Create: `miniprogram/pages/spike-map/spike-map.json`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: 建验证页**

`miniprogram/pages/spike-map/spike-map.json`：

```json
{
  "navigationStyle": "custom",
  "usingComponents": {}
}
```

`miniprogram/pages/spike-map/spike-map.wxml`：

```xml
<view class="wrap">
  <map
    id="spikeMap"
    class="map"
    latitude="{{lat}}"
    longitude="{{lng}}"
    scale="15"
    show-location
    enable-3D="{{false}}"
  />

  <!-- 验证点 1：普通 view 能否压在 map 之上 -->
  <view class="float-search">浮层能否压住地图？</view>

  <!-- 验证点 2：chips 行 -->
  <view class="float-chips">
    <view class="chip chip--on">综合</view>
    <view class="chip">距离</view>
    <view class="chip">价格</view>
  </view>

  <!-- 验证点 3：底部面板 + 拖拽手势 -->
  <view
    class="sheet"
    style="transform: translateY({{sheetY}}px);"
    bindtouchstart="onSheetTouchStart"
    bindtouchmove="onSheetTouchMove"
    bindtouchend="onSheetTouchEnd"
  >
    <view class="sheet__handle" />
    <view class="sheet__title">面板可拖拽 · 当前 {{sheetY}}px</view>
    <view class="sheet__card">万象城地下停车场 ¥6/时</view>
    <view class="sheet__card">银座商城 P2 停车场 ¥5/时</view>
    <view class="sheet__card">市第一人民医院停车场 ¥4/时</view>
  </view>

  <!-- 验证点 4：cover-view 对照组 -->
  <cover-view class="cover-probe">cover-view 对照</cover-view>
</view>
```

`miniprogram/pages/spike-map/spike-map.wxss`：

```css
.wrap {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.float-search {
  position: absolute;
  top: 100rpx;
  left: 32rpx;
  right: 32rpx;
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 24rpx;
  background: #fff;
  border-radius: 16rpx;
  box-shadow: 0 6rpx 24rpx rgba(15, 23, 42, 0.15);
  font-size: 26rpx;
  color: #94a3b8;
}

.float-chips {
  position: absolute;
  top: 200rpx;
  left: 32rpx;
  right: 32rpx;
  display: flex;
  gap: 14rpx;
}

.chip {
  padding: 10rpx 26rpx;
  border-radius: 999rpx;
  background: #fff;
  border: 2rpx solid #e2e8f0;
  font-size: 23rpx;
  color: #475569;
}

.chip--on {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  min-height: 60vh;
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  box-shadow: 0 -12rpx 48rpx rgba(15, 23, 42, 0.16);
  padding: 16rpx 32rpx 32rpx;
  will-change: transform;
}

.sheet__handle {
  width: 76rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: #cbd5e1;
  margin: 0 auto 20rpx;
}

.sheet__title {
  font-size: 24rpx;
  color: #94a3b8;
  margin-bottom: 16rpx;
}

.sheet__card {
  background: #fff;
  border: 2rpx solid #e2e8f0;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 18rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.cover-probe {
  position: absolute;
  top: 300rpx;
  right: 32rpx;
  padding: 8rpx 20rpx;
  background: #dc2626;
  color: #fff;
  font-size: 22rpx;
  border-radius: 8rpx;
}
```

`miniprogram/pages/spike-map/spike-map.ts`：

```ts
const SHEET_MIN = 0
const SHEET_MAX = 420

Page({
  data: {
    lat: 36.6512,
    lng: 117.1201,
    sheetY: SHEET_MAX,
    startY: 0,
    startSheetY: SHEET_MAX,
  },

  onSheetTouchStart(e: WechatMiniprogram.TouchEvent) {
    this.setData({ startY: e.touches[0].clientY, startSheetY: this.data.sheetY })
  },

  onSheetTouchMove(e: WechatMiniprogram.TouchEvent) {
    const delta = e.touches[0].clientY - this.data.startY
    const next = Math.min(SHEET_MAX, Math.max(SHEET_MIN, this.data.startSheetY + delta))
    this.setData({ sheetY: next })
  },

  onSheetTouchEnd() {
    // 吸附：过半则展开
    this.setData({ sheetY: this.data.sheetY < SHEET_MAX / 2 ? SHEET_MIN : SHEET_MAX })
  },
})
```

- [ ] **Step 2: 注册页面**

`miniprogram/app.json` 的 `pages` 数组首位加 `"pages/spike-map/spike-map"`（临时置首便于启动即见）。

- [ ] **Step 3: 人工验证**

用微信开发者工具打开项目，逐个确认并在本步记录结论：

1. 浮层（`.float-search`、`.float-chips`）是否盖得住地图？
2. `cover-view` 与普通 `view` 谁在上面？
3. 拖拽面板时，手指移动是拖动面板还是拖动地图？
4. 面板上的卡片能否点击？

Run: 微信开发者工具 → 编译 → 模拟器 + 真机预览各试一次

Expected: 记录四项结果。

- [ ] **Step 4: 按结论决定首页架构**

- 四项全通过 → 首页用「地图铺满 + 拖拽面板」（spec D7 原案）
- 浮层压不住地图 → 首页改用「固定上下分栏」（上地图 37% / 下列表），并在 `docs/superpowers/specs/2026-09-11-smart-parking-miniprogram-ui-design.md` 的 D7 行注明改判
- 拖拽手势被地图吃掉 → 面板去掉拖拽，改为点击展开/收起两档

把结论写进 `docs/superpowers/specs/2026-09-11-smart-parking-miniprogram-ui-design.md` §8 的对应行。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/app.json miniprogram/pages/spike-map docs/superpowers/specs
git commit -m "chore: add Skyline map overlay spike page and record findings"
```

---

## Task 1: 测试工具链与模板清理

**Files:**
- Create: `jest.config.js`
- Create: `tsconfig.test.json`
- Modify: `package.json`
- Delete: `miniprogram/pages/index/`、`miniprogram/pages/logs/`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: 安装依赖**

```bash
npm i -D jest ts-jest @types/jest typescript
npm i -D miniprogram-api-typings@latest
```

Expected: `package.json` 的 `devDependencies` 出现 `jest`、`ts-jest`、`@types/jest`，`miniprogram-api-typings` 升到 3.x。

> **为什么必须升 typings**：仓库原有的 `miniprogram-api-typings@2.8.3-1` 是 2021 年份的声明集，缺少基础库 2.20.1 之后新增的接口。Task 0 的验证页用了 `wx.getWindowInfo`，在旧 typings 下报 `TS2551: Property 'getWindowInfo' does not exist on type 'Wx'`。运行时没问题（`app.json` 的 `sdkVersionBegin` 是 3.0.0），但类型检查必须干净，否则后续每个 Task 都会淹没在这个假报错里。

- [ ] **Step 2: 写测试配置**

`tsconfig.test.json`：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "typeRoots": ["./node_modules/@types", "./typings"]
  }
}
```

> `typeRoots` 必须覆盖 `./node_modules/@types`，否则 `describe` / `it` / `expect` 没有类型。

`jest.config.js`：

```js
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/miniprogram/domain'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};
```

- [ ] **Step 3: 加 npm scripts**

`package.json` 的 `scripts` 改为：

```json
{
  "test": "jest",
  "test:watch": "jest --watch"
}
```

- [ ] **Step 4: 写一个哨兵测试确认链路通**

Create: `miniprogram/domain/__tests__/sentinel.test.ts`

```ts
describe('test toolchain', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: PASS，1 passed

- [ ] **Step 5: 清理模板**

```bash
rm -rf miniprogram/pages/index miniprogram/pages/logs
```

`miniprogram/app.json` 的 `pages` 改为（保留 Task 0 的验证页，其余待后续任务逐个加入）：

```json
{
  "pages": [
    "pages/spike-map/spike-map"
  ],
  "window": {
    "navigationBarTextStyle": "black",
    "navigationStyle": "custom",
    "backgroundColor": "#f8fafc"
  },
  "style": "v2",
  "renderer": "skyline",
  "rendererOptions": {
    "skyline": {
      "defaultDisplayBlock": true,
      "defaultContentBox": true,
      "tagNameStyleIsolation": "legacy",
      "disableABTest": true,
      "sdkVersionBegin": "3.0.0",
      "sdkVersionEnd": "15.255.255"
    }
  },
  "componentFramework": "glass-easel",
  "sitemapLocation": "sitemap.json",
  "lazyCodeLoading": "requiredComponents"
}
```

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json jest.config.js tsconfig.test.json miniprogram
git commit -m "chore: add jest toolchain and remove template pages"
```

---

## Task 2: 设计 token

**Files:**
- Create: `miniprogram/styles/tokens.wxss`
- Modify: `miniprogram/app.wxss`

- [ ] **Step 1: 写 token**

Create `miniprogram/styles/tokens.wxss`：

```css
page {
  /* 主色 */
  --color-primary: #2563eb;
  --color-primary-deep: #1e3a8a;
  --color-primary-soft: #eff6ff;

  /* 语义 */
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;

  /* 文字 */
  --color-text: #0f172a;
  --color-text-sub: #64748b;
  --color-text-weak: #94a3b8;

  /* 面 */
  --color-border: #e2e8f0;
  --color-bg: #f8fafc;
  --color-surface: #ffffff;

  /* 字阶 */
  --font-amount: 44rpx;
  --font-title: 36rpx;
  --font-card-title: 28rpx;
  --font-body: 26rpx;
  --font-sub: 24rpx;
  --font-tag: 22rpx;
  --font-micro: 20rpx;

  /* 间距 */
  --space-1: 8rpx;
  --space-2: 16rpx;
  --space-3: 24rpx;
  --space-4: 32rpx;
  --space-6: 48rpx;

  /* 圆角 */
  --radius-card: 16rpx;
  --radius-pill: 999rpx;
  --radius-sheet: 28rpx;

  /* 阴影 */
  --shadow-card: 0 2rpx 8rpx rgba(15, 23, 42, 0.06);
  --shadow-float: 0 8rpx 32rpx rgba(15, 23, 42, 0.16);
}
```

- [ ] **Step 2: 接入全局样式**

`miniprogram/app.wxss` 改为：

```css
@import "./styles/tokens.wxss";

page {
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-body);
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}

/* 金额数字等宽对齐；Skyline 不支持时自动退化为普通渲染 */
.tnum {
  font-feature-settings: "tnum";
}
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/styles miniprogram/app.wxss
git commit -m "feat: add design tokens"
```

---

## Task 3: 领域类型与计费规则

**Files:**
- Create: `miniprogram/domain/types.ts`
- Create: `miniprogram/domain/pricing.ts`
- Test: `miniprogram/domain/__tests__/pricing.test.ts`

- [ ] **Step 1: 写类型**

Create `miniprogram/domain/types.ts`：

```ts
export type DataSource = 'poi' | 'rule' | 'estimated'

export interface GeoPoint {
  lat: number
  lng: number
}

export interface LotPricing {
  /** 首小时标准价，单位元。预支停车费的单价基准 */
  firstHour: number
  /** 首小时之后的每小时单价 */
  perHourAfter: number
  /** 计费步长（分钟） */
  stepMinutes: 15 | 30 | 60
  /** 单日封顶 */
  capPerDay: number
  /** 夜间费率，可缺省 */
  nightRate?: number
  source: DataSource
}

export interface LotAvailability {
  freeSpots: number
  totalSpots: number
  source: DataSource
}

export interface ParkingLot {
  id: string
  name: string
  address: string
  location: GeoPoint
  distanceM: number
  walkMinutes: number
  pricing: LotPricing
  availability: LotAvailability
  /** 车场开放的可预约车位数 */
  reservableQuota: number
  rating: number
  tags: string[]
}

export interface ScoreFactors {
  fee: number
  distance: number
  availability: number
  infra: number
  reputation: number
}

export interface Recommendation {
  lot: ParkingLot
  score: number
  factors: ScoreFactors
  reasons: string[]
}

export type SortKey = 'composite' | 'distance' | 'fee' | 'availability'

export type ReservationStatus =
  | 'pending_entry'
  | 'entered'
  | 'completed'
  | 'cancelled'
  | 'violated'
  | 'released'

export interface Reservation {
  id: string
  orderNo: string
  lotId: string
  lotName: string
  plateNo: string
  /** ISO 字符串 */
  arriveTime: string
  /** 到达时间 + 15 分钟，ISO 字符串 */
  enterDeadline: string
  prepaidParkingFee: number
  serviceFee: number
  totalAmount: number
  status: ReservationStatus
  qrPayload: string
}
```

- [ ] **Step 2: 写失败的测试**

Create `miniprogram/domain/__tests__/pricing.test.ts`：

```ts
import { PLATFORM_SERVICE_FEE, leadHours, prepaidParkingFee, quoteTotal } from '../pricing'

describe('leadHours', () => {
  it('不足 1 小时按 1 小时计', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T10:40:00')
    expect(leadHours(now, arrive)).toBe(1)
  })

  it('整 1 小时为 1', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    expect(leadHours(now, arrive)).toBe(1)
  })

  it('整 2 小时为 2', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    expect(leadHours(now, arrive)).toBe(2)
  })

  it('1 小时零 1 分进位为 2', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:01:00')
    expect(leadHours(now, arrive)).toBe(2)
  })

  it('到达时间早于当前时间时按 1 小时兜底', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T09:30:00')
    expect(leadHours(now, arrive)).toBe(1)
  })
})

describe('prepaidParkingFee', () => {
  it('万象城首小时 ¥6，10:00 约 11:00 到 = ¥6', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    expect(prepaidParkingFee(now, arrive, 6)).toBe(6)
  })

  it('万象城首小时 ¥6，10:00 约 12:00 到 = ¥12', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    expect(prepaidParkingFee(now, arrive, 6)).toBe(12)
  })

  it('医院首小时 ¥4，预留 2 小时 = ¥8', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T12:00:00')
    expect(prepaidParkingFee(now, arrive, 4)).toBe(8)
  })
})

describe('quoteTotal', () => {
  it('预支 + 服务费', () => {
    const now = new Date('2026-09-11T10:00:00')
    const arrive = new Date('2026-09-11T11:00:00')
    expect(quoteTotal(now, arrive, 6)).toEqual({
      leadHours: 1,
      prepaidParkingFee: 6,
      serviceFee: 2,
      totalAmount: 8,
    })
  })

  it('服务费常量为 2', () => {
    expect(PLATFORM_SERVICE_FEE).toBe(2)
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- pricing`
Expected: FAIL，报 `Cannot find module '../pricing'`

- [ ] **Step 4: 实现计费**

Create `miniprogram/domain/pricing.ts`：

```ts
/** 平台服务费（元）。平台唯一收入来源，改签时不退还 */
export const PLATFORM_SERVICE_FEE = 2

/**
 * 预留小时数 = 到达时刻 − 当前时刻，向上取整，最小 1。
 * 到达时间早于或等于当前时间时返回 1。
 */
export function leadHours(now: Date, arrive: Date): number {
  const diffMs = arrive.getTime() - now.getTime()
  if (diffMs <= 0) return 1
  return Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)))
}

/**
 * 预支停车费 = 预留小时数 × 该车场首小时标准价。
 * 由平台代收后转付车场；出场时车场闸机按实际停放时长计费并抵扣。
 */
export function prepaidParkingFee(now: Date, arrive: Date, firstHourRate: number): number {
  return leadHours(now, arrive) * firstHourRate
}

export interface Quote {
  leadHours: number
  prepaidParkingFee: number
  serviceFee: number
  totalAmount: number
}

export function quoteTotal(now: Date, arrive: Date, firstHourRate: number): Quote {
  const hours = leadHours(now, arrive)
  const prepaid = hours * firstHourRate
  return {
    leadHours: hours,
    prepaidParkingFee: prepaid,
    serviceFee: PLATFORM_SERVICE_FEE,
    totalAmount: prepaid + PLATFORM_SERVICE_FEE,
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- pricing`
Expected: PASS，10 passed

- [ ] **Step 6: 提交**

```bash
git add miniprogram/domain/types.ts miniprogram/domain/pricing.ts miniprogram/domain/__tests__/pricing.test.ts
git commit -m "feat(domain): add parking fee rules"
```

---

## Task 4: 到达时间窗口与入场截止

**Files:**
- Create: `miniprogram/domain/time.ts`
- Test: `miniprogram/domain/__tests__/time.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `miniprogram/domain/__tests__/time.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- time`
Expected: FAIL，`Cannot find module '../time'`

- [ ] **Step 3: 实现**

Create `miniprogram/domain/time.ts`：

```ts
/** 预约窗口上限（小时）。超出不给约 */
export const MAX_LEAD_HOURS = 2

/** 入场宽限期（分钟）。超过则车位自动释放并记违约一次（PM BR-01） */
export const ENTRY_GRACE_MINUTES = 15

const MINUTE_MS = 60 * 1000

export interface ArrivalOption {
  offsetMinutes: number
  time: Date
  /** 展示标签：「现在」/「30 分」/「1 时」/「1.5 时」/「2 时」 */
  label: string
}

const OFFSETS = [0, 30, 60, 90, 120]

function labelFor(offsetMinutes: number): string {
  if (offsetMinutes === 0) return '现在'
  if (offsetMinutes < 60) return `${offsetMinutes} 分`
  const hours = offsetMinutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 时`
}

/** 生成预约确认页的到达时间选项 */
export function buildArrivalOptions(now: Date): ArrivalOption[] {
  return OFFSETS.map(offsetMinutes => ({
    offsetMinutes,
    time: new Date(now.getTime() + offsetMinutes * MINUTE_MS),
    label: labelFor(offsetMinutes),
  }))
}

/** 到达时间是否落在 [now, now + MAX_LEAD_HOURS] 窗口内 */
export function isWithinWindow(now: Date, arrive: Date): boolean {
  const diff = arrive.getTime() - now.getTime()
  return diff >= 0 && diff <= MAX_LEAD_HOURS * 60 * MINUTE_MS
}

/** 入场截止时刻 = 到达时间 + 入场宽限期 */
export function enterDeadline(arrive: Date): Date {
  return new Date(arrive.getTime() + ENTRY_GRACE_MINUTES * MINUTE_MS)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- time`
Expected: PASS，10 passed

- [ ] **Step 5: 提交**

```bash
git add miniprogram/domain/time.ts miniprogram/domain/__tests__/time.test.ts
git commit -m "feat(domain): add arrival window and entry deadline"
```

---

## Task 5: 五因子评分与排序

**Files:**
- Create: `miniprogram/domain/scoring.ts`
- Create: `miniprogram/domain/sort.ts`
- Test: `miniprogram/domain/__tests__/scoring.test.ts`
- Test: `miniprogram/domain/__tests__/sort.test.ts`

- [ ] **Step 1: 写失败的测试（评分）**

Create `miniprogram/domain/__tests__/scoring.test.ts`：

```ts
import { DEFAULT_WEIGHTS, SATURATION_THRESHOLD, scoreLot } from '../scoring'
import type { ParkingLot } from '../types'

function lot(over: Partial<ParkingLot> = {}): ParkingLot {
  return {
    id: 'L1',
    name: '万象城地下停车场',
    address: '历下区经十路 1234 号',
    location: { lat: 36.65, lng: 117.12 },
    distanceM: 320,
    walkMinutes: 4,
    pricing: { firstHour: 6, perHourAfter: 5, stepMinutes: 15, capPerDay: 40, source: 'estimated' },
    availability: { freeSpots: 46, totalSpots: 500, source: 'estimated' },
    reservableQuota: 120,
    rating: 4.8,
    tags: [],
    ...over,
  }
}

describe('DEFAULT_WEIGHTS', () => {
  it('沿用 PM 表 5 的默认权重且合计为 1', () => {
    const sum =
      DEFAULT_WEIGHTS.fee +
      DEFAULT_WEIGHTS.distance +
      DEFAULT_WEIGHTS.availability +
      DEFAULT_WEIGHTS.infra +
      DEFAULT_WEIGHTS.reputation
    expect(sum).toBeCloseTo(1, 10)
  })

  it('费用权重最高', () => {
    expect(DEFAULT_WEIGHTS.fee).toBe(0.3)
  })
})

describe('scoreLot', () => {
  it('候选只有一个车场时距离与费用因子都取 1', () => {
    const r = scoreLot(lot({ distanceM: 0 }), {
      allLots: [lot({ distanceM: 0 })],
      hasCharging: false,
      userNeedsCharging: false,
    })
    expect(r.factors.distance).toBe(1)
    expect(r.factors.fee).toBe(1)
    expect(r.score).toBeGreaterThan(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('距离越近距离因子越高', () => {
    const near = scoreLot(lot({ id: 'near', distanceM: 100 }), {
      allLots: [lot({ id: 'near', distanceM: 100 }), lot({ id: 'far', distanceM: 2000 })],
      hasCharging: false,
      userNeedsCharging: false,
    })
    const far = scoreLot(lot({ id: 'far', distanceM: 2000 }), {
      allLots: [lot({ id: 'near', distanceM: 100 }), lot({ id: 'far', distanceM: 2000 })],
      hasCharging: false,
      userNeedsCharging: false,
    })
    expect(near.factors.distance).toBeGreaterThan(far.factors.distance)
  })

  it('得分取整且在 0–100 之间', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: false })
    expect(Number.isInteger(r.score)).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })

  it('纯电车 + 车场有充电桩时基础设施因子为 1', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: true, userNeedsCharging: true })
    expect(r.factors.infra).toBe(1)
  })

  it('纯电车 + 车场无充电桩时基础设施因子为 0', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: true })
    expect(r.factors.infra).toBe(0)
  })

  it('燃油车不受充电桩影响，基础设施因子为 1', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: false })
    expect(r.factors.infra).toBe(1)
  })

  it('空位充足时可用性因子高于空位紧张时', () => {
    const plenty = scoreLot(lot({ availability: { freeSpots: 400, totalSpots: 500, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    const scarce = scoreLot(lot({ availability: { freeSpots: 3, totalSpots: 800, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(plenty.factors.availability).toBeGreaterThan(scarce.factors.availability)
  })

  it('空闲率低于警戒线时可用性因子为 0', () => {
    const r = scoreLot(lot({ availability: { freeSpots: 10, totalSpots: 100, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.factors.availability).toBe(0)
  })

  it('评分低于饱和警戒线时产出「高峰紧张」理由', () => {
    const r = scoreLot(lot({ availability: { freeSpots: 10, totalSpots: 100, source: 'estimated' } }), {
      allLots: [lot()], hasCharging: false, userNeedsCharging: false,
    })
    expect(r.reasons).toContain('高峰紧张')
  })

  it('产出可解释理由，最多 3 条', () => {
    const r = scoreLot(lot(), { allLots: [lot()], hasCharging: false, userNeedsCharging: false })
    expect(r.reasons.length).toBeGreaterThan(0)
    expect(r.reasons.length).toBeLessThanOrEqual(3)
  })

  it('饱和警戒线为 0.85', () => {
    expect(SATURATION_THRESHOLD).toBe(0.85)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- scoring`
Expected: FAIL，`Cannot find module '../scoring'`

- [ ] **Step 3: 实现评分**

Create `miniprogram/domain/scoring.ts`：

```ts
import type { ParkingLot, Recommendation, ScoreFactors } from './types'

/** 占用率超过该值即为饱和，推荐时降权或剔除（PM 2.2） */
export const SATURATION_THRESHOLD = 0.85

export interface ScoreWeights {
  fee: number
  distance: number
  availability: number
  infra: number
  reputation: number
}

/** PM 表 5 的默认权重 */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  fee: 0.3,
  distance: 0.15,
  availability: 0.25,
  infra: 0.2,
  reputation: 0.1,
}

/** 就医场景：可用性权重上调、费用下调（PM 2.2） */
export const MEDICAL_WEIGHTS: ScoreWeights = { ...DEFAULT_WEIGHTS, availability: 0.35, fee: 0.2 }

/** 通勤场景：费用权重上调（PM 2.2） */
export const COMMUTE_WEIGHTS: ScoreWeights = { ...DEFAULT_WEIGHTS, fee: 0.4 }

export interface ScoreContext {
  /** 同一批候选车场，用于归一化 */
  allLots: ParkingLot[]
  /** 该车场是否有充电桩 */
  hasCharging: boolean
  /** 用户车辆是否需要充电（纯电 / 插混） */
  userNeedsCharging: boolean
  weights?: ScoreWeights
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 1
  return (value - min) / (max - min)
}

export function scoreLot(lot: ParkingLot, ctx: ScoreContext): Recommendation {
  const weights = ctx.weights ?? DEFAULT_WEIGHTS

  const fees = ctx.allLots.map(l => l.pricing.firstHour)
  const dists = ctx.allLots.map(l => l.distanceM)

  // 费用：归一化倒数，越便宜越高
  const feeSpan = Math.max(...fees) - Math.min(...fees)
  const feeFactor = feeSpan === 0 ? 1 : 1 - normalize(lot.pricing.firstHour, Math.min(...fees), Math.max(...fees))

  // 距离：越近越高
  const distSpan = Math.max(...dists) - Math.min(...dists)
  const distanceFactor = distSpan === 0 ? 1 : 1 - normalize(lot.distanceM, Math.min(...dists), Math.max(...dists))

  // 可用性：预测空闲率，低于警戒线归零
  const freeRate = lot.availability.totalSpots === 0
    ? 0
    : lot.availability.freeSpots / lot.availability.totalSpots
  const availabilityFactor = freeRate < SATURATION_THRESHOLD ? 0 : normalize(freeRate, SATURATION_THRESHOLD, 1)

  // 基础设施：仅纯电/插混车受充电桩影响
  const infraFactor = ctx.userNeedsCharging ? (ctx.hasCharging ? 1 : 0) : 1

  // 口碑：4.0 分以下按 0 计
  const reputationFactor = Math.max(0, Math.min(1, (lot.rating - 4.0) / 1.0))

  const factors: ScoreFactors = {
    fee: feeFactor,
    distance: distanceFactor,
    availability: availabilityFactor,
    infra: infraFactor,
    reputation: reputationFactor,
  }

  const raw =
    weights.fee * factors.fee +
    weights.distance * factors.distance +
    weights.availability * factors.availability +
    weights.infra * factors.infra +
    weights.reputation * factors.reputation

  return {
    lot,
    score: Math.round(raw * 100),
    factors,
    reasons: buildReasons(lot, ctx, factors, freeRate),
  }
}

function buildReasons(
  lot: ParkingLot,
  ctx: ScoreContext,
  factors: ScoreFactors,
  freeRate: number,
): string[] {
  const reasons: string[] = []

  if (freeRate < SATURATION_THRESHOLD) {
    reasons.push('高峰紧张')
  } else if (factors.availability >= 0.6) {
    reasons.push('空位充足')
  }

  if (factors.fee >= 0.8) {
    const cheapest = Math.min(...ctx.allLots.map(l => l.pricing.firstHour))
    const diff = lot.pricing.firstHour - cheapest
    if (diff > 0) reasons.push(`比最低价贵 ¥${diff}`)
    else reasons.push('单价最低')
  }

  if (factors.distance >= 0.8) reasons.push('距目的地最近')

  if (ctx.userNeedsCharging && ctx.hasCharging) reasons.push('有充电桩')

  return reasons.slice(0, 3)
}

/** 按评分降序取 Top N（PM FR-U06 要求 Top3） */
export function topRecommendations(lots: ParkingLot[], ctx: Omit<ScoreContext, 'allLots'>, n = 3): Recommendation[] {
  const scored = lots.map(l =>
    scoreLot(l, { ...ctx, allLots: lots, hasCharging: l.tags.includes('充电桩') }),
  )
  return scored.sort((a, b) => b.score - a.score).slice(0, n)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- scoring`
Expected: PASS，13 passed

- [ ] **Step 5: 写失败的测试（排序）**

Create `miniprogram/domain/__tests__/sort.test.ts`：

```ts
import { sortLots } from '../sort'
import type { ParkingLot, Recommendation } from '../types'

function rec(id: string, score: number, distanceM: number, firstHour: number, freeSpots: number): Recommendation {
  const lot: ParkingLot = {
    id,
    name: id,
    address: '',
    location: { lat: 0, lng: 0 },
    distanceM,
    walkMinutes: 1,
    pricing: { firstHour, perHourAfter: firstHour, stepMinutes: 15, capPerDay: 40, source: 'estimated' },
    availability: { freeSpots, totalSpots: 100, source: 'estimated' },
    reservableQuota: 10,
    rating: 4.5,
    tags: [],
  }
  return { lot, score, factors: { fee: 0, distance: 0, availability: 0, infra: 0, reputation: 0 }, reasons: [] }
}

const input = [
  rec('B', 88, 890, 5, 112),
  rec('A', 92, 320, 6, 46),
  rec('C', 71, 1200, 4, 3),
]

describe('sortLots', () => {
  it('综合：按评分降序', () => {
    expect(sortLots(input, 'composite').map(r => r.lot.id)).toEqual(['A', 'B', 'C'])
  })

  it('距离：最近的在前', () => {
    expect(sortLots(input, 'distance').map(r => r.lot.id)).toEqual(['A', 'B', 'C'])
  })

  it('费用：最便宜的在前', () => {
    expect(sortLots(input, 'fee').map(r => r.lot.id)).toEqual(['C', 'B', 'A'])
  })

  it('空位：余位最多的在前', () => {
    expect(sortLots(input, 'availability').map(r => r.lot.id)).toEqual(['B', 'A', 'C'])
  })

  it('不修改入参数组', () => {
    const before = input.map(r => r.lot.id)
    sortLots(input, 'fee')
    expect(input.map(r => r.lot.id)).toEqual(before)
  })
})
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npm test -- sort`
Expected: FAIL，`Cannot find module '../sort'`

- [ ] **Step 7: 实现排序**

Create `miniprogram/domain/sort.ts`：

```ts
import type { Recommendation, SortKey } from './types'

/**
 * 对推荐结果排序。综合 = 评分降序；其余三个维度各自降序/升序。
 * 返回新数组，不修改入参。
 */
const COMPARATORS: Record<SortKey, (a: Recommendation, b: Recommendation) => number> = {
  composite: (a, b) => b.score - a.score,
  distance: (a, b) => a.lot.distanceM - b.lot.distanceM,
  fee: (a, b) => a.lot.pricing.firstHour - b.lot.pricing.firstHour,
  availability: (a, b) => b.lot.availability.freeSpots - a.lot.availability.freeSpots,
}

export function sortLots(recs: Recommendation[], key: SortKey): Recommendation[] {
  return recs.slice().sort(COMPARATORS[key])
}
```

- [ ] **Step 8: 运行全部测试确认通过**

Run: `npm test`
Expected: PASS，全部通过

- [ ] **Step 9: 提交**

```bash
git add miniprogram/domain/scoring.ts miniprogram/domain/sort.ts miniprogram/domain/__tests__/scoring.test.ts miniprogram/domain/__tests__/sort.test.ts
git commit -m "feat(domain): add five-factor scoring and sorting"
```

---

## Task 6: 展示格式化

**Files:**
- Create: `miniprogram/domain/format.ts`
- Test: `miniprogram/domain/__tests__/format.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `miniprogram/domain/__tests__/format.test.ts`：

```ts
import { formatAmount, formatCountdown, formatDistance, formatPlate, formatSpots, formatTimeRangeLabel } from '../format'

describe('formatDistance', () => {
  it('小于 1 公里用米', () => {
    expect(formatDistance(320)).toBe('320m')
  })

  it('1 公里及以上用公里，保留 1 位小数', () => {
    expect(formatDistance(1200)).toBe('1.2km')
  })

  it('刚好 1000 米为 1.0km', () => {
    expect(formatDistance(1000)).toBe('1.0km')
  })

  it('负数按 0 处理', () => {
    expect(formatDistance(-5)).toBe('0m')
  })
})

describe('formatSpots', () => {
  it('正常值显示 余位/总数', () => {
    expect(formatSpots(46, 500)).toBe('46/500')
  })

  it('余位缺失显示 --，不显示 0', () => {
    expect(formatSpots(null, 500)).toBe('--/500')
  })

  it('总数缺失显示 --', () => {
    expect(formatSpots(46, null)).toBe('46/--')
  })
})

describe('formatAmount', () => {
  it('保留两位小数', () => {
    expect(formatAmount(8)).toBe('8.00')
  })

  it('四舍五入到分', () => {
    expect(formatAmount(8.005)).toBe('8.01')
  })
})

describe('formatCountdown', () => {
  const now = new Date('2026-09-11T13:40:00')

  it('剩余 14 分钟', () => {
    expect(formatCountdown(now, new Date('2026-09-11T13:54:30'))).toBe('剩 14 分钟')
  })

  it('超过 1 小时显示小时', () => {
    expect(formatCountdown(now, new Date('2026-09-11T15:10:00'))).toBe('剩 1 小时 30 分')
  })

  it('已过期返回空字符串', () => {
    expect(formatCountdown(now, new Date('2026-09-11T13:39:00'))).toBe('')
  })
})

describe('formatTimeRangeLabel', () => {
  it('当天显示「今天 HH:mm」', () => {
    const now = new Date('2026-09-11T10:00:00')
    expect(formatTimeRangeLabel(new Date('2026-09-11T13:40:00'), now)).toBe('今天 13:40')
  })

  it('次日显示「明天 HH:mm」', () => {
    const now = new Date('2026-09-11T23:00:00')
    expect(formatTimeRangeLabel(new Date('2026-09-12T00:30:00'), now)).toBe('明天 00:30')
  })
})

describe('formatPlate', () => {
  it('保留完整车牌用于本人订单展示', () => {
    expect(formatPlate('京A8F2K9')).toBe('京A·8F2K9')
  })

  it('已带分隔符时不重复插入', () => {
    expect(formatPlate('京A·8F2K9')).toBe('京A·8F2K9')
  })

  it('长度不足时原样返回', () => {
    expect(formatPlate('京A8')).toBe('京A8')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- format`
Expected: FAIL，`Cannot find module '../format'`

- [ ] **Step 3: 实现**

Create `miniprogram/domain/format.ts`：

```ts
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function formatDistance(meters: number): string {
  const m = Math.max(0, Math.round(meters))
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

/** 余位展示。缺失时显示 `--`，绝不显示 0（0 与未知语义不同） */
export function formatSpots(free: number | null, total: number | null): string {
  const f = free === null || free === undefined ? '--' : String(free)
  const t = total === null || total === undefined ? '--' : String(total)
  return `${f}/${t}`
}

export function formatAmount(yuan: number): string {
  return (Math.round(yuan * 100) / 100).toFixed(2)
}

/** 倒计时文案。已过期返回空串 */
export function formatCountdown(now: Date, deadline: Date): string {
  const diffMin = Math.floor((deadline.getTime() - now.getTime()) / 60000)
  if (diffMin < 0) return ''
  if (diffMin < 60) return `剩 ${diffMin} 分钟`
  const h = Math.floor(diffMin / 60)
  const m = diffMin % 60
  return m === 0 ? `剩 ${h} 小时` : `剩 ${h} 小时 ${m} 分`
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function formatTimeRangeLabel(time: Date, now: Date): string {
  const hhmm = `${pad2(time.getHours())}:${pad2(time.getMinutes())}`
  if (isSameDay(time, now)) return `今天 ${hhmm}`
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  if (isSameDay(time, tomorrow)) return `明天 ${hhmm}`
  return `${time.getMonth() + 1}月${time.getDate()}日 ${hhmm}`
}

/** 车牌展示：省市简称 + 字母后插入分隔点 */
export function formatPlate(plate: string): string {
  const raw = plate.replace('·', '')
  if (raw.length < 3) return plate
  return `${raw.slice(0, 2)}·${raw.slice(2)}`
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- format`
Expected: PASS，17 passed

- [ ] **Step 5: 提交**

```bash
git add miniprogram/domain/format.ts miniprogram/domain/__tests__/format.test.ts
git commit -m "feat(domain): add display formatters"
```

---

## Task 7: 存储与角色状态

**Files:**
- Create: `miniprogram/services/storage.ts`

服务层依赖 `wx.*`，不做单测；逻辑足够薄，人工在开发者工具里验证。

- [ ] **Step 1: 实现**

Create `miniprogram/services/storage.ts`：

```ts
export type Role = 'driver' | 'owner'

const ROLE_KEY = 'qnt.role'
const PLATE_KEY = 'qnt.defaultPlate'
const SESSION_KEY = 'qnt.session'

export interface Session {
  token: string
  userId: string
  expireAt: number
}

export function getRole(): Role | null {
  const v = wx.getStorageSync(ROLE_KEY)
  return v === 'driver' || v === 'owner' ? v : null
}

export function setRole(role: Role): void {
  wx.setStorageSync(ROLE_KEY, role)
}

export function clearRole(): void {
  wx.removeStorageSync(ROLE_KEY)
}

export function getDefaultPlate(): string {
  return wx.getStorageSync(PLATE_KEY) || ''
}

export function setDefaultPlate(plate: string): void {
  wx.setStorageSync(PLATE_KEY, plate)
}

export function getSession(): Session | null {
  const s = wx.getStorageSync(SESSION_KEY)
  return s && typeof s.token === 'string' ? (s as Session) : null
}

export function setSession(session: Session): void {
  wx.setStorageSync(SESSION_KEY, session)
}

export function clearSession(): void {
  wx.removeStorageSync(SESSION_KEY)
}
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/services/storage.ts
git commit -m "feat(services): add role and session storage"
```

---

## Task 8: 自定义 tabBar（双角色）

**Files:**
- Create: `miniprogram/custom-tab-bar/index.ts`
- Create: `miniprogram/custom-tab-bar/index.json`
- Create: `miniprogram/custom-tab-bar/index.wxml`
- Create: `miniprogram/custom-tab-bar/index.wxss`

- [ ] **Step 1: 写组件**

Create `miniprogram/custom-tab-bar/index.json`：

```json
{
  "component": true,
  "usingComponents": {}
}
```

Create `miniprogram/custom-tab-bar/index.ts`：

```ts
import { getRole, type Role } from '../services/storage'

interface TabItem {
  pagePath: string
  text: string
  icon: string
}

const TABS: Record<Role, TabItem[]> = {
  driver: [
    { pagePath: '/pages/home/home', text: '首页', icon: '◉' },
    { pagePath: '/pages/orders/orders', text: '订单', icon: '▤' },
    { pagePath: '/pages/profile/profile', text: '我的', icon: '◍' },
  ],
  owner: [
    { pagePath: '/pages/owner/dashboard/dashboard', text: '看板', icon: '◉' },
    { pagePath: '/pages/owner/reservations/reservations', text: '预约', icon: '▤' },
    { pagePath: '/pages/owner/lot/lot', text: '车场', icon: '▦' },
    { pagePath: '/pages/owner/profile/profile', text: '我的', icon: '◍' },
  ],
}

Component({
  data: {
    role: 'driver' as Role,
    list: TABS.driver,
    selected: 0,
  },

  attached() {
    const role = getRole() ?? 'driver'
    this.setData({ role, list: TABS[role] })
  },

  methods: {
    /** 由页面在 onShow 中调用，同步高亮项 */
    setSelected(index: number) {
      this.setData({ selected: index })
    },

    onTap(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index)
      const url = this.data.list[index].pagePath
      if (index === this.data.selected) return
      wx.switchTab({ url })
    },
  },
})
```

Create `miniprogram/custom-tab-bar/index.wxml`：

```xml
<view class="tabbar">
  <view
    wx:for="{{list}}"
    wx:key="pagePath"
    class="tabbar__item {{selected === index ? 'tabbar__item--on' : ''}}"
    data-index="{{index}}"
    bindtap="onTap"
  >
    <view class="tabbar__icon">{{item.icon}}</view>
    <view class="tabbar__text">{{item.text}}</view>
  </view>
</view>
```

Create `miniprogram/custom-tab-bar/index.wxss`：

```css
.tabbar {
  display: flex;
  height: 100rpx;
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--color-surface);
  border-top: 2rpx solid var(--color-border);
}

.tabbar__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  font-size: 21rpx;
  color: var(--color-text-weak);
}

.tabbar__item--on {
  color: var(--color-primary);
  font-weight: 600;
}

.tabbar__icon {
  font-size: 36rpx;
  line-height: 1;
  opacity: 0.55;
}

.tabbar__item--on .tabbar__icon {
  opacity: 1;
}
```

- [ ] **Step 2: 开启自定义 tabBar**

`miniprogram/app.json` 增加 `"tabBar"` 段。**注意**：`list` 必须至少 2 项，微信要求；这里列的是两个角色的全部页面，`custom-tab-bar` 只渲染当前角色那批。

```json
"tabBar": {
  "custom": true,
  "color": "#94a3b8",
  "selectedColor": "#2563eb",
  "backgroundColor": "#ffffff",
  "list": [
    { "pagePath": "pages/home/home", "text": "首页" },
    { "pagePath": "pages/orders/orders", "text": "订单" },
    { "pagePath": "pages/profile/profile", "text": "我的" },
    { "pagePath": "pages/owner/dashboard/dashboard", "text": "看板" },
    { "pagePath": "pages/owner/reservations/reservations", "text": "预约" },
    { "pagePath": "pages/owner/lot/lot", "text": "车场" },
    { "pagePath": "pages/owner/profile/profile", "text": "车场我的" }
  ]
}
```

同时 `pages` 数组加入这 7 个页面路径。**本任务只建到占位页**（Task 9–12 会逐个填实现），先各写一个最小页面：

对 7 个路径各建 4 个文件。以 `pages/home/home` 为例：

`miniprogram/pages/home/home.json`：

```json
{ "navigationStyle": "custom", "usingComponents": {} }
```

`miniprogram/pages/home/home.wxml`：

```xml
<view class="page">首页（待实现）</view>
```

`miniprogram/pages/home/home.wxss`：

```css
.page {
  padding: var(--space-4);
  color: var(--color-text-weak);
}
```

`miniprogram/pages/home/home.ts`：

```ts
Page({
  data: {},
  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(0)
  },
})
```

其余 6 个页面同样结构，只改 `text`、`setSelected` 的索引与 `wxml` 文案：

| 页面 | setSelected | 文案 |
|---|---|---|
| `pages/orders/orders` | 1 | 订单（待实现） |
| `pages/profile/profile` | 2 | 我的（待实现） |
| `pages/owner/dashboard/dashboard` | 0 | 车场看板（待实现） |
| `pages/owner/reservations/reservations` | 1 | 车场预约（待实现） |
| `pages/owner/lot/lot` | 2 | 车场配置（待实现） |
| `pages/owner/profile/profile` | 3 | 车场我的（待实现） |

- [ ] **Step 3: 人工验证**

微信开发者工具 → 编译。

Expected: 首页正常显示，底部出现 3 个 tab（首页/订单/我的），点击可切换且高亮跟随。

若 `getTabBar` 为 undefined：确认 `app.json` 里 `tabBar.custom` 为 true，且 `custom-tab-bar` 目录与 `pages` 同级（在 `miniprogram/` 根下）。

- [ ] **Step 4: 提交**

```bash
git add miniprogram/app.json miniprogram/custom-tab-bar miniprogram/pages
git commit -m "feat: add role-aware custom tab bar with placeholder pages"
```

---

## Task 9: 身份选择页

**Files:**
- Create: `miniprogram/pages/role-select/*`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.ts`

- [ ] **Step 1: 写页面**

`miniprogram/pages/role-select/role-select.json`：

```json
{ "navigationStyle": "custom", "usingComponents": {} }
```

`miniprogram/pages/role-select/role-select.wxml`：

```xml
<view class="page">
  <view class="page__title">选择你的身份</view>
  <view class="page__subtitle">可随时在「我的」中切换</view>

  <view
    class="role {{role === 'driver' ? 'role--on' : ''}}"
    data-role="driver"
    bindtap="onPick"
  >
    <view class="role__emoji">🚗</view>
    <view class="role__name role__name--driver">我是车主</view>
    <view class="role__desc">找车位 · 比价 · 预约锁位\n车牌识别入场 · 在线缴费</view>
  </view>

  <view
    class="role {{role === 'owner' ? 'role--on' : ''}}"
    data-role="owner"
    bindtap="onPick"
  >
    <view class="role__emoji">🏢</view>
    <view class="role__name">我是车场方</view>
    <view class="role__desc">车位额度 · 收费规则\n预约看板 · 对账结算</view>
  </view>

  <view class="page__spacer" />

  <view class="enter {{role ? '' : 'enter--disabled'}}" bindtap="onEnter">进入</view>
</view>
```

`miniprogram/pages/role-select/role-select.wxss`：

```css
.page {
  min-height: 100vh;
  padding: 200rpx 52rpx 52rpx;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  text-align: center;
}

.page__title {
  font-size: 50rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
}

.page__subtitle {
  font-size: 25rpx;
  color: var(--color-text-weak);
  margin-top: 18rpx;
}

.role {
  margin-top: 40rpx;
  border: 4rpx solid var(--color-border);
  background: var(--color-surface);
  border-radius: 28rpx;
  padding: 48rpx 40rpx;
  text-align: left;
}

.role--on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.role__emoji {
  font-size: 60rpx;
  line-height: 1;
}

.role__name {
  font-size: 38rpx;
  font-weight: 700;
  color: #334155;
  margin-top: 24rpx;
}

.role__name--driver {
  color: #1d4ed8;
}

.role--on .role__name {
  color: #1d4ed8;
}

.role__desc {
  font-size: 25rpx;
  color: #475569;
  line-height: 1.85;
  margin-top: 16rpx;
  white-space: pre-line;
}

.page__spacer {
  flex: 1;
}

.enter {
  height: 96rpx;
  line-height: 96rpx;
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: #fff;
  font-size: 30rpx;
  font-weight: 600;
}

.enter--disabled {
  background: #cbd5e1;
}
```

`miniprogram/pages/role-select/role-select.ts`：

```ts
import { setRole, type Role } from '../../services/storage'

Page({
  data: {
    role: '' as Role | '',
  },

  onLoad() {
    // 已在别处选过身份时直接回首页
    const existing = wx.getStorageSync('qnt.role')
    if (existing) {
      wx.reLaunch({ url: existing === 'owner' ? '/pages/owner/dashboard/dashboard' : '/pages/home/home' })
    }
  },

  onPick(e: WechatMiniprogram.TouchEvent) {
    this.setData({ role: e.currentTarget.dataset.role as Role })
  },

  onEnter() {
    const role = this.data.role
    if (!role) {
      wx.showToast({ title: '请先选择身份', icon: 'none' })
      return
    }
    setRole(role)
    wx.reLaunch({ url: role === 'owner' ? '/pages/owner/dashboard/dashboard' : '/pages/home/home' })
  },
})
```

- [ ] **Step 2: 注册页面并设为启动页**

`miniprogram/app.json` 的 `pages` 首位插入 `"pages/role-select/role-select"`。

- [ ] **Step 3: 清掉模板登录逻辑**

`miniprogram/app.ts` 改为（模板里的 `wx.login` 会打印无效 code，且往 storage 塞 logs，本阶段不需要）：

```ts
App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 会话在 Task 10 的 api 层按需建立，这里不做任何请求
  },
})
```

- [ ] **Step 4: 人工验证**

清缓存后编译。

Expected:
- 首次进入停在身份选择页，两个卡片可选中（选中的变蓝底蓝框）
- 未选就点「进入」→ toast「请先选择身份」
- 选车主 → 进入首页，底部 3 个 tab
- 重新编译（不清缓存）→ 直接进首页，不再出现身份选择页

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/role-select miniprogram/app.json miniprogram/app.ts
git commit -m "feat: add role selection page"
```

---

## Task 10: 定位与腾讯位置服务封装

**Files:**
- Create: `miniprogram/services/location.ts`
- Create: `miniprogram/services/qqmap.ts`
- Create: `miniprogram/config.ts`
- Modify: `miniprogram/app.json`

**前置**：需要腾讯位置服务的 Key，且在小程序后台把 `https://apis.map.qq.com` 加进 request 合法域名。Key 未就绪时本任务的服务会返回明确错误，不影响后续任务的编写与提交。完整的申请步骤见 `docs/setup/tencent-map-setup.md`。

- [ ] **Step 0: 声明地理位置接口**

`wx.getLocation` 除了后台开通，还必须在 `app.json` 显式声明，否则接口直接 fail、提审也会被拦。在 `miniprogram/app.json` 顶层加两个键：

```json
"requiredPrivateInfos": ["getLocation"],
"permission": {
  "scope.userLocation": {
    "desc": "用于查询并推荐您当前位置周边的停车场"
  }
}
```

只声明实际用到的接口。`wx.openLocation`（导航前往）不需要声明。

- [ ] **Step 1: 写配置**

Create `miniprogram/config.ts`：

```ts
/** 腾讯位置服务 Key。在小程序后台配置 request 合法域名 https://apis.map.qq.com */
export const QQMAP_KEY = 'REPLACE_WITH_YOUR_KEY'

/** 首页默认搜索半径（米） */
export const DEFAULT_RADIUS_M = 3000

/** 请求超时（毫秒）。失败重试 1 次 */
export const REQUEST_TIMEOUT_MS = 3000
```

> ⚠️ `QQMAP_KEY` 必须替换为真实 Key 后再联调，否则 `qqmap` 全部调用返回 `INVALID_KEY`。

- [ ] **Step 2: 写定位服务**

Create `miniprogram/services/location.ts`：

```ts
import type { GeoPoint } from '../domain/types'

export type LocationResult =
  | { ok: true; point: GeoPoint }
  | { ok: false; reason: 'denied' | 'failed' }

/** 获取当前位置。用户拒绝授权时返回 denied，不抛异常 */
export function getCurrentPoint(): Promise<LocationResult> {
  return new Promise(resolve => {
    wx.getLocation({
      type: 'gcj02',
      success: res => resolve({ ok: true, point: { lat: res.latitude, lng: res.longitude } }),
      fail: err => {
        const denied = typeof err.errMsg === 'string' && err.errMsg.indexOf('auth deny') >= 0
        resolve({ ok: false, reason: denied ? 'denied' : 'failed' })
      },
    })
  })
}

/** 用系统内置地图打开导航。无需额外 SDK 与域名配置 */
export function openNavigation(point: GeoPoint, name: string, address: string): void {
  wx.openLocation({
    latitude: point.lat,
    longitude: point.lng,
    name,
    address,
    scale: 15,
  })
}
```

- [ ] **Step 3: 写腾讯地图服务**

Create `miniprogram/services/qqmap.ts`：

```ts
import { QQMAP_KEY, REQUEST_TIMEOUT_MS } from '../config'
import type { GeoPoint } from '../domain/types'

const BASE = 'https://apis.map.qq.com'

interface QQMapEnvelope<T> {
  status: number
  message: string
  data?: T
}

export class QQMapError extends Error {
  constructor(public code: number, message: string) {
    super(message)
    this.name = 'QQMapError'
  }
}

/** 带超时与一次重试的 GET。失败抛 QQMapError */
function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const query = Object.keys(params)
    .map(k => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join('&')
  const url = `${BASE}${path}?${query}&key=${QQMAP_KEY}`

  const attempt = (): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      wx.request({
        url,
        timeout: REQUEST_TIMEOUT_MS,
        success: res => {
          const body = res.data as QQMapEnvelope<T>
          if (body && body.status === 0 && body.data !== undefined) {
            resolve(body.data)
          } else {
            reject(new QQMapError(body?.status ?? -1, body?.message ?? 'unknown'))
          }
        },
        fail: err => reject(new QQMapError(-2, err.errMsg || 'request failed')),
      })
    })

  return attempt().catch(() => attempt())
}

export interface PoiItem {
  id: string
  title: string
  address: string
  location: GeoPoint
  /** 距离中心点的直线距离（米），由接口返回 */
  distanceM: number
}

interface SearchRaw {
  data?: Array<{
    id: string
    title: string
    address: string
    location: { lat: number; lng: number }
    _distance?: number
  }>
}

/** 关键词周边检索。region 为城市名，小程序端可留空由坐标决定 */
export async function searchNearby(keyword: string, center: GeoPoint, radiusM: number): Promise<PoiItem[]> {
  const raw = await get<SearchRaw>('/ws/place/v1/search', {
    keyword,
    boundary: `nearby(${center.lat},${center.lng},${radiusM})`,
    page_size: 20,
    page_index: 1,
  })
  return (raw.data ?? []).map(item => ({
    id: item.id,
    title: item.title,
    address: item.address,
    location: { lat: item.location.lat, lng: item.location.lng },
    distanceM: item._distance ?? 0,
  }))
}

/** 关键词城市级检索，用于搜索页输入目的地/车场名 */
export async function searchByKeyword(keyword: string, region: string): Promise<PoiItem[]> {
  const raw = await get<SearchRaw>('/ws/place/v1/search', {
    keyword,
    boundary: `region(${region},0)`,
    page_size: 20,
    page_index: 1,
  })
  return (raw.data ?? []).map(item => ({
    id: item.id,
    title: item.title,
    address: item.address,
    location: { lat: item.location.lat, lng: item.location.lng },
    distanceM: item._distance ?? 0,
  }))
}

interface DistanceRaw {
  elements?: Array<{ distance: number; duration: number }>
}

/** 步行距离与时长。失败返回 null，调用方降级为直线距离 */
export async function walkingDistance(from: GeoPoint, to: GeoPoint): Promise<{ distanceM: number; durationMin: number } | null> {
  try {
    const raw = await get<DistanceRaw>('/ws/distance/v1/matrix', {
      mode: 'walking',
      from: `${from.lat},${from.lng}`,
      to: `${to.lat},${to.lng}`,
    })
    const el = raw.elements?.[0]
    if (!el) return null
    return { distanceM: el.distance, durationMin: Math.round(el.duration / 60) }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: 编译验证**

Run: 微信开发者工具 → 编译

Expected: 编译无错误（Key 未配置不影响编译）。

- [ ] **Step 5: 提交**

```bash
git add miniprogram/config.ts miniprogram/services/location.ts miniprogram/services/qqmap.ts
git commit -m "feat(services): add location and QQ map wrappers"
```

---

## Task 11: 车场聚合服务（POI → ParkingLot）

POI 只提供名称、地址、坐标、距离。其余字段由本项目估算，**必须打上 `source: 'estimated'` 标记**，界面上要向用户标注来源。

**Files:**
- Create: `miniprogram/services/lot.ts`

- [ ] **Step 1: 实现**

Create `miniprogram/services/lot.ts`：

```ts
import type { ParkingLot } from '../domain/types'
import { searchNearby, walkingDistance, type PoiItem } from './qqmap'
import { DEFAULT_RADIUS_M } from '../config'
import type { GeoPoint } from '../domain/types'

/**
 * 由 POI 名称稳定派生估算字段。
 * 用 POI id 做种子，保证同一车场每次进入 App 看到的估算值一致——
 * 否则列表每次刷新数字都在跳，既不像真实数据也不便演示。
 */
function seedOf(poiId: string): number {
  let h = 2166136261
  for (let i = 0; i < poiId.length; i++) {
    h ^= poiId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function pick(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1))
}

const NAME_HINTS: Array<{ match: string; firstHour: number; totalSpots: number }> = [
  { match: '医院', firstHour: 4, totalSpots: 800 },
  { match: '商城', firstHour: 5, totalSpots: 300 },
  { match: '广场', firstHour: 5, totalSpots: 420 },
  { match: '万象', firstHour: 6, totalSpots: 500 },
]

function pricingHint(title: string) {
  const hit = NAME_HINTS.find(h => title.indexOf(h.match) >= 0)
  return hit ?? { firstHour: 5, totalSpots: 260 }
}

function toParkingLot(poi: PoiItem, index: number): ParkingLot {
  const seed = seedOf(poi.id)
  const hint = pricingHint(poi.title)
  const totalSpots = hint.totalSpots
  const freeRate = 0.03 + (seed % 55) / 100
  const freeSpots = Math.max(0, Math.round(totalSpots * freeRate))
  const isHospital = poi.title.indexOf('医院') >= 0

  return {
    id: poi.id,
    name: poi.title,
    address: poi.address,
    location: poi.location,
    distanceM: poi.distanceM,
    walkMinutes: Math.max(1, Math.round(poi.distanceM / 80)),
    pricing: {
      firstHour: hint.firstHour,
      perHourAfter: Math.max(1, hint.firstHour - 1),
      stepMinutes: 15,
      capPerDay: isHospital ? 30 : 40,
      nightRate: 3,
      source: 'estimated',
    },
    availability: {
      freeSpots,
      totalSpots,
      source: 'estimated',
    },
    reservableQuota: pick(seed, 40, 160),
    rating: 4.0 + (seed % 9) / 10,
    tags: seed % 3 === 0 ? ['充电桩'] : [],
  }
}

export interface NearbyResult {
  lots: ParkingLot[]
  /** 真实步行距离是否可用；false 表示已降级为直线距离估算 */
  walkDistanceResolved: boolean
}

/**
 * 取周边车场。直线距离来自 POI 接口；步行距离逐个查询路径矩阵，
 * 失败则降级为「直线距离 × 1.3」并如实返回 walkDistanceResolved=false。
 */
export async function fetchNearbyLots(
  center: GeoPoint,
  radiusM: number = DEFAULT_RADIUS_M,
  keyword = '停车场',
): Promise<NearbyResult> {
  const pois = await searchNearby(keyword, center, radiusM)
  const lots = pois.map(toParkingLot)

  const walkResults = await Promise.all(
    lots.map(l => walkingDistance(center, l.location)),
  )

  let resolved = true
  walkResults.forEach((w, i) => {
    if (w) {
      lots[i].distanceM = w.distanceM
      lots[i].walkMinutes = w.durationMin
    } else {
      resolved = false
      lots[i].distanceM = Math.round(lots[i].distanceM * 1.3)
      lots[i].walkMinutes = Math.max(1, Math.round(lots[i].distanceM / 80))
    }
  })

  return { lots, walkDistanceResolved: resolved }
}
```

- [ ] **Step 2: 提交**

```bash
git add miniprogram/services/lot.ts
git commit -m "feat(services): aggregate POI into parking lots with estimated fields"
```

---

## Task 12: 车场卡片与排序 chips 组件

**Files:**
- Create: `miniprogram/components/lot-card/*`
- Create: `miniprogram/components/sort-chips/*`

- [ ] **Step 1: 写 sort-chips**

`miniprogram/components/sort-chips/sort-chips.json`：

```json
{ "component": true, "usingComponents": {} }
```

`miniprogram/components/sort-chips/sort-chips.ts`：

```ts
import type { SortKey } from '../../domain/types'

const OPTIONS: Array<{ key: SortKey; text: string }> = [
  { key: 'composite', text: '综合' },
  { key: 'distance', text: '距离' },
  { key: 'fee', text: '价格' },
  { key: 'availability', text: '空位' },
]

Component({
  properties: {
    value: { type: String, value: 'composite' },
    /** 首页用短标签，搜索页用长标签 */
    variant: { type: String, value: 'short' },
  },

  data: {
    options: OPTIONS,
  },

  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const key = e.currentTarget.dataset.key as SortKey
      this.triggerEvent('change', { key })
    },
  },
})
```

`miniprogram/components/sort-chips/sort-chips.wxml`：

```xml
<view class="chips">
  <view
    wx:for="{{options}}"
    wx:key="key"
    class="chip {{value === item.key ? 'chip--on' : ''}}"
    data-key="{{item.key}}"
    bindtap="onTap"
  >{{item.text}}</view>
</view>
```

`miniprogram/components/sort-chips/sort-chips.wxss`：

```css
.chips {
  display: flex;
  gap: 14rpx;
}

.chip {
  padding: 10rpx 26rpx;
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  border: 2rpx solid var(--color-border);
  font-size: 23rpx;
  color: #475569;
}

.chip--on {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
```

- [ ] **Step 2: 写 lot-card**

`miniprogram/components/lot-card/lot-card.json`：

```json
{ "component": true, "usingComponents": {} }
```

`miniprogram/components/lot-card/lot-card.ts`：

```ts
Component({
  properties: {
    /** Recommendation，由页面转换好展示字段后传入 */
    item: { type: Object, value: null },
    selected: { type: Boolean, value: false },
    /** 是否显示底部的「导航前往 / 预约车位」双动作 */
    showActions: { type: Boolean, value: false },
  },

  methods: {
    onCardTap() {
      this.triggerEvent('cardtap', { id: this.data.item.lot.id })
    },
    onNavigate(e: WechatMiniprogram.TouchEvent) {
      this.triggerEvent('navigate', { id: e.currentTarget.dataset.id })
    },
    onReserve(e: WechatMiniprogram.TouchEvent) {
      this.triggerEvent('reserve', { id: e.currentTarget.dataset.id })
    },
  },
})
```

`miniprogram/components/lot-card/lot-card.wxml`：

```xml
<view class="card {{selected ? 'card--on' : ''}}" bindtap="onCardTap">
  <view class="card__head">
    <view class="card__name">{{item.lot.name}}</view>
    <view class="card__price">
      <text class="tnum">¥{{item.lot.pricing.firstHour}}</text>
      <text class="card__unit">/时</text>
    </view>
  </view>

  <view class="card__meta">
    <text>{{item.distanceText}}</text>
    <text class="card__dot">·</text>
    <text>步行 {{item.walkText}}</text>
    <text class="card__dot">·</text>
    <text>余位 <text class="card__free {{item.freeClass}}">{{item.spotsText}}</text></text>
    <text class="card__dot">·</text>
    <text>综合 <text class="card__score tnum">{{item.score}}</text> 分</text>
  </view>

  <view class="card__tags" wx:if="{{item.reasons.length}}">
    <view
      wx:for="{{item.reasons}}"
      wx:key="*this"
      class="tag {{item.tone}}"
    >{{item}}</view>
  </view>

  <view class="card__actions" wx:if="{{showActions}}">
    <view class="act act--ghost" data-id="{{item.lot.id}}" catchtap="onNavigate">导航前往</view>
    <view class="act act--primary" data-id="{{item.lot.id}}" catchtap="onReserve">预约车位</view>
  </view>
</view>
```

> `catchtap` 而非 `bindtap`：防止点击按钮时同时触发卡片跳转。

`miniprogram/components/lot-card/lot-card.wxss`：

```css
.card {
  background: var(--color-surface);
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 24rpx;
}

.card--on {
  border-color: var(--color-primary);
  box-shadow: 0 4rpx 18rpx rgba(37, 99, 235, 0.16);
}

.card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.card__name {
  font-size: 29rpx;
  font-weight: 700;
  flex: 1;
  margin-right: 16rpx;
}

.card__price {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: -1rpx;
  white-space: nowrap;
}

.card__unit {
  font-size: 20rpx;
  font-weight: 400;
}

.card__meta {
  font-size: 23rpx;
  color: var(--color-text-sub);
  margin-top: 10rpx;
}

.card__dot {
  margin: 0 6rpx;
}

.card__free.ok { color: var(--color-success); }
.card__free.warn { color: var(--color-warning); }
.card__free.bad { color: var(--color-danger); }

.card__score { font-weight: 700; color: var(--color-text); }

.card__tags {
  display: flex;
  gap: 12rpx;
  margin-top: 14rpx;
  flex-wrap: wrap;
}

.tag {
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
  font-size: 21rpx;
}

.tag.info { background: #dbeafe; color: #1d4ed8; }
.tag.good { background: #dcfce7; color: #15803d; }
.tag.bad { background: #fee2e2; color: #b91c1c; }
.tag.plain { background: #f1f5f9; color: #475569; }

.card__actions {
  display: flex;
  gap: 18rpx;
  margin-top: 22rpx;
}

.act {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  text-align: center;
  border-radius: var(--radius-pill);
  font-size: 25rpx;
  font-weight: 600;
}

.act--ghost {
  border: 2rpx solid #cbd5e1;
  color: #334155;
}

.act--primary {
  flex: 1.2;
  background: var(--color-primary);
  color: #fff;
}
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/components/lot-card miniprogram/components/sort-chips
git commit -m "feat(components): add lot card and sort chips"
```

---

## Task 13: 首页

`item` 的展示字段（`distanceText` / `walkText` / `spotsText` / `freeClass` / `score` / `reasons` / `tone`）在页面层用 Task 6 的格式化函数预先算好，组件只负责渲染。

**Files:**
- Modify: `miniprogram/pages/home/*`

- [ ] **Step 1: 写页面**

`miniprogram/pages/home/home.json`：

```json
{
  "navigationStyle": "custom",
  "usingComponents": {
    "lot-card": "/components/lot-card/lot-card",
    "sort-chips": "/components/sort-chips/sort-chips",
    "state-view": "/components/state-view/state-view"
  }
}
```

`miniprogram/pages/home/home.ts`：

```ts
import { DEFAULT_RADIUS_M } from '../../config'
import { sortLots } from '../../domain/sort'
import { topRecommendations } from '../../domain/scoring'
import { formatDistance, formatSpots } from '../../domain/format'
import type { ParkingLot, Recommendation, SortKey } from '../../domain/types'
import { fetchNearbyLots } from '../../services/lot'
import { getCurrentPoint, openNavigation } from '../../services/location'

type ViewState = 'loading' | 'ready' | 'empty' | 'error' | 'no-location'

interface Pin {
  id: string
  latitude: number
  longitude: number
  label: string
  active: boolean
}

/** map 组件的 marker.id 必须是数字，所以用数组下标做 id，再靠 pins 反查车场 */
function toMarkers(pins: Pin[]) {
  return pins.map((p, i) => ({
    id: i,
    latitude: p.latitude,
    longitude: p.longitude,
    width: 1,
    height: 1,
    label: {
      content: p.label,
      fontSize: 12,
      color: p.active ? '#ffffff' : '#0f172a',
      bgColor: p.active ? '#2563eb' : '#ffffff',
      borderRadius: 11,
      padding: 6,
      textAlign: 'center',
    },
  }))
}

interface CardVM {
  lot: ParkingLot
  score: number
  reasons: string[]
  tone: string
  distanceText: string
  walkText: string
  spotsText: string
  freeClass: string
}

function toVM(rec: Recommendation): CardVM {
  const free = rec.lot.availability.freeSpots
  const total = rec.lot.availability.totalSpots
  const rate = total === 0 ? 0 : free / total
  return {
    lot: rec.lot,
    score: rec.score,
    reasons: rec.reasons,
    tone: rec.reasons[0] === '高峰紧张' ? 'bad' : 'good',
    distanceText: formatDistance(rec.lot.distanceM),
    walkText: `${rec.lot.walkMinutes} 分钟`,
    spotsText: formatSpots(free, total),
    freeClass: rate < 0.1 ? 'bad' : rate < 0.25 ? 'warn' : 'ok',
  }
}

Page({
  data: {
    state: 'loading' as ViewState,
    sortKey: 'composite' as SortKey,
    cards: [] as CardVM[],
    selectedId: '',
    degraded: false,
    /** 地图中心与图钉 */
    lat: 36.6512,
    lng: 117.1201,
    pins: [] as Pin[],
    markers: [] as unknown[],
  },

  recommendations: [] as Recommendation[],
  center: null as { lat: number; lng: number } | null,
  loaded: false,

  onShow() {
    this.getTabBar?.()?.setSelected(0)
    // 只在首次进入时拉取；从详情页返回时保留原有列表与排序，避免闪一下
    if (!this.loaded) {
      this.loaded = true
      this.load()
    }
  },

  async load() {
    this.setData({ state: 'loading' })

    const loc = await getCurrentPoint()
    if (!loc.ok) {
      this.setData({ state: 'no-location' })
      return
    }
    this.center = loc.point

    try {
      const { lots, walkDistanceResolved } = await fetchNearbyLots(loc.point, DEFAULT_RADIUS_M)
      if (lots.length === 0) {
        this.setData({ state: 'empty' })
        return
      }

      this.recommendations = topRecommendations(
        lots,
        { userNeedsCharging: false },
        lots.length,
      )

      this.setData({
        lat: loc.point.lat,
        lng: loc.point.lng,
        degraded: !walkDistanceResolved,
        state: 'ready',
      })
      this.applySort(this.data.sortKey)
    } catch (e) {
      this.setData({ state: 'error' })
    }
  },

  applySort(key: SortKey) {
    const sorted = sortLots(this.recommendations, key)
    const pins: Pin[] = sorted.map(r => ({
      id: r.lot.id,
      latitude: r.lot.location.lat,
      longitude: r.lot.location.lng,
      label: `¥${r.lot.pricing.firstHour} · ${formatDistance(r.lot.distanceM)}`,
      active: r.lot.id === this.data.selectedId,
    }))
    this.setData({
      sortKey: key,
      cards: sorted.map(toVM),
      pins,
      markers: toMarkers(pins),
    })
  },

  onSortChange(e: WechatMiniprogram.CustomEvent<{ key: SortKey }>) {
    this.applySort(e.detail.key)
  },

  onPinTap(e: WechatMiniprogram.CustomEvent<{ markerId: number }>) {
    const pin = this.data.pins[e.detail.markerId]
    if (!pin) return
    this.setData({ selectedId: pin.id })
    this.applySort(this.data.sortKey)
  },

  onCardTap(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    wx.navigateTo({ url: `/pages/lot-detail/lot-detail?id=${e.detail.id}` })
  },

  onNavigate(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const rec = this.recommendations.find(r => r.lot.id === e.detail.id)
    if (!rec || !this.center) return
    openNavigation(rec.lot.location, rec.lot.name, rec.lot.address)
  },

  onReserve(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    // 付费链路在计划 2 实现
    wx.navigateTo({ url: `/pages/lot-detail/lot-detail?id=${e.detail.id}&intent=reserve` })
  },

  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  onRetry() {
    this.load()
  },
})
```

`miniprogram/pages/home/home.wxml`：

```xml
<view class="wrap">
  <map
    class="wrap__map"
    latitude="{{lat}}"
    longitude="{{lng}}"
    scale="15"
    show-location
    markers="{{markers}}"
    bindmarkertap="onPinTap"
  />

  <view class="search" bindtap="onSearchTap">
    <text class="search__icon">🔍</text>
    <text class="search__ph">搜目的地 / 车场</text>
    <text class="search__map">地图</text>
  </view>

  <view class="chips-row">
    <sort-chips value="{{sortKey}}" bind:change="onSortChange" />
  </view>

  <view class="banner" wx:if="{{degraded}}">
    预测服务暂不可用，已按实时余位与历史同期推荐
  </view>

  <view class="sheet">
    <view class="sheet__handle" />
    <view class="sheet__hint" wx:if="{{state === 'ready'}}">附近 {{cards.length}} 个车场 · 已按{{sortKey === 'composite' ? '综合评分' : '所选维度'}}排序</view>

    <state-view wx:elif="{{state === 'loading'}}" kind="loading" text="正在获取周边车场…" />

    <state-view
      wx:elif="{{state === 'no-location'}}"
      kind="empty"
      text="未获取到定位授权"
      hint="可在设置中开启定位，或直接搜索目的地"
      action-text="去搜索"
      bind:action="onSearchTap"
    />

    <state-view
      wx:elif="{{state === 'empty'}}"
      kind="empty"
      text="附近 3 公里内未找到停车场"
      hint="试试搜索指定目的地"
      action-text="去搜索"
      bind:action="onSearchTap"
    />

    <state-view
      wx:elif="{{state === 'error'}}"
      kind="error"
      text="车场数据加载失败"
      hint="请检查网络后重试"
      action-text="重试"
      bind:action="onRetry"
    />

    <scroll-view wx:else class="sheet__list" scroll-y>
      <lot-card
        wx:for="{{cards}}"
        wx:key="lot.id"
        item="{{item}}"
        selected="{{item.lot.id === selectedId}}"
        bind:cardtap="onCardTap"
        bind:navigate="onNavigate"
        bind:reserve="onReserve"
      />
      <view class="sheet__tail" />
    </scroll-view>
  </view>
</view>
```

> `markers` 由 `applySort` 里的 `toMarkers(pins)` 生成，`pins` 保留原样供 `onPinTap` 用 `markerId` 反查车场 id。

`miniprogram/pages/home/home.wxss`：

```css
.wrap {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #eaefe9;
}

.wrap__map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.search {
  position: absolute;
  top: 104rpx;
  left: 28rpx;
  right: 28rpx;
  height: 80rpx;
  display: flex;
  align-items: center;
  padding: 0 26rpx;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-float);
  font-size: 26rpx;
  color: var(--color-text-weak);
}

.search__icon { margin-right: 12rpx; }
.search__ph { flex: 1; }
.search__map { color: var(--color-primary); font-weight: 600; font-size: 25rpx; }

.chips-row {
  position: absolute;
  top: 200rpx;
  left: 28rpx;
}

.banner {
  position: absolute;
  top: 290rpx;
  left: 28rpx;
  right: 28rpx;
  background: #fffbeb;
  border: 2rpx solid #fde68a;
  color: #92400e;
  font-size: 23rpx;
  padding: 16rpx 22rpx;
  border-radius: 12rpx;
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 58vh;
  background: var(--color-surface);
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  box-shadow: 0 -12rpx 48rpx rgba(15, 23, 42, 0.16);
  padding: 18rpx 28rpx 0;
  display: flex;
  flex-direction: column;
}

.sheet__handle {
  width: 76rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: #cbd5e1;
  margin: 0 auto 20rpx;
  flex: none;
}

.sheet__hint {
  font-size: 23rpx;
  color: var(--color-text-weak);
  margin-bottom: 18rpx;
  flex: none;
}

.sheet__list {
  flex: 1;
  height: 0;
}

.sheet__list lot-card {
  display: block;
  margin-bottom: 18rpx;
}

.sheet__tail { height: 40rpx; }
```

- [ ] **Step 2: 建 state-view 组件**

`miniprogram/components/state-view/state-view.json`：

```json
{ "component": true, "usingComponents": {} }
```

`miniprogram/components/state-view/state-view.ts`：

```ts
Component({
  properties: {
    kind: { type: String, value: 'empty' },
    text: { type: String, value: '' },
    hint: { type: String, value: '' },
    actionText: { type: String, value: '' },
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    },
  },
})
```

`miniprogram/components/state-view/state-view.wxml`：

```xml
<view class="sv">
  <view class="sv__skel" wx:if="{{kind === 'loading'}}">
    <view class="sv__bar" wx:for="{{[1,2,3]}}" wx:key="*this" />
  </view>
  <block wx:else>
    <view class="sv__text">{{text}}</view>
    <view class="sv__hint" wx:if="{{hint}}">{{hint}}</view>
    <view class="sv__action" wx:if="{{actionText}}" bindtap="onAction">{{actionText}}</view>
  </block>
</view>
```

`miniprogram/components/state-view/state-view.wxss`：

```css
.sv {
  padding: 80rpx 20rpx;
  text-align: center;
}

.sv__bar {
  height: 140rpx;
  border-radius: var(--radius-card);
  background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
  background-size: 400% 100%;
  animation: sv-shimmer 1.4s ease infinite;
  margin-bottom: 18rpx;
}

@keyframes sv-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

.sv__text {
  font-size: 27rpx;
  color: var(--color-text-sub);
}

.sv__hint {
  font-size: 23rpx;
  color: var(--color-text-weak);
  margin-top: 12rpx;
  line-height: 1.7;
}

.sv__action {
  display: inline-block;
  margin-top: 28rpx;
  padding: 16rpx 46rpx;
  border-radius: var(--radius-pill);
  border: 2rpx solid var(--color-primary);
  color: var(--color-primary);
  font-size: 26rpx;
  font-weight: 600;
}
```

- [ ] **Step 3: 人工验证**

确保 `config.ts` 已填真实 Key、后台已配 `https://apis.map.qq.com` 为 request 合法域名。

Expected:
- 首页显示地图与悬浮搜索框，底部面板列出真实车场（来自腾讯 POI，如「万象城地下停车场」）
- 切换 chips：价格升序生效、距离升序生效
- 定位被拒时（在开发者工具里模拟）显示「未获取到定位授权」空态且可跳搜索
- 图钉与卡片选中态联动

- [ ] **Step 4: 提交**

```bash
git add miniprogram/pages/home miniprogram/components/state-view
git commit -m "feat: implement home page with map, recommendations and sorting"
```

---

## Task 14: 搜索页

**Files:**
- Create: `miniprogram/pages/search/*`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: 写页面**

`miniprogram/pages/search/search.json`：

```json
{
  "navigationStyle": "custom",
  "usingComponents": {
    "lot-card": "/components/lot-card/lot-card",
    "sort-chips": "/components/sort-chips/sort-chips",
    "state-view": "/components/state-view/state-view"
  }
}
```

`miniprogram/pages/search/search.ts`：

```ts
import { DEFAULT_RADIUS_M } from '../../config'
import { formatDistance, formatSpots } from '../../domain/format'
import { topRecommendations } from '../../domain/scoring'
import { sortLots } from '../../domain/sort'
import type { Recommendation, SortKey } from '../../domain/types'
import { fetchNearbyLots } from '../../services/lot'
import { openNavigation } from '../../services/location'
import { searchByKeyword, type PoiItem } from '../../services/qqmap'

const HISTORY_KEY = 'qnt.searchHistory'
const REGION = '济南'

Page({
  data: {
    keyword: '',
    history: [] as string[],
    state: 'idle' as 'idle' | 'loading' | 'ready' | 'empty' | 'error',
    sortKey: 'composite' as SortKey,
    cards: [] as unknown[],
    centerLat: 36.6512,
    centerLng: 117.1201,
    markers: [] as unknown[],
  },

  recommendations: [] as Recommendation[],

  onLoad() {
    this.setData({ history: wx.getStorageSync(HISTORY_KEY) || [] })
  },

  onInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value })
  },

  onHistoryTap(e: WechatMiniprogram.TouchEvent) {
    const kw = e.currentTarget.dataset.kw as string
    this.setData({ keyword: kw })
    this.search()
  },

  async search() {
    const keyword = this.data.keyword.trim()
    if (!keyword) {
      wx.showToast({ title: '请输入目的地或车场名', icon: 'none' })
      return
    }

    this.pushHistory(keyword)
    this.setData({ state: 'loading' })

    try {
      // 先按关键词找目的地坐标，再用该坐标找周边车场
      const pois: PoiItem[] = await searchByKeyword(keyword, REGION)
      if (pois.length === 0) {
        this.setData({ state: 'empty' })
        return
      }
      const target = pois[0].location

      const { lots } = await fetchNearbyLots(target, DEFAULT_RADIUS_M)
      if (lots.length === 0) {
        this.setData({ state: 'empty' })
        return
      }

      this.recommendations = topRecommendations(lots, { userNeedsCharging: false }, lots.length)
      this.setData({ centerLat: target.lat, centerLng: target.lng, state: 'ready' })
      this.applySort('composite')
    } catch {
      this.setData({ state: 'error' })
    }
  },

  applySort(key: SortKey) {
    const sorted = sortLots(this.recommendations, key)
    this.setData({
      sortKey: key,
      cards: sorted.map(r => this.toVM(r)),
      markers: sorted.map((r, i) => ({
        id: i,
        latitude: r.lot.location.lat,
        longitude: r.lot.location.lng,
        width: 1,
        height: 1,
        label: {
          content: `${i === 0 ? '★ 推荐 · ' : ''}${r.lot.name} ¥${r.lot.pricing.firstHour}`,
          fontSize: 12,
          color: i === 0 ? '#ffffff' : '#0f172a',
          bgColor: i === 0 ? '#2563eb' : '#ffffff',
          borderRadius: 11,
          padding: 6,
          textAlign: 'center',
        },
      })),
    })
  },

  toVM(rec: Recommendation) {
    const free = rec.lot.availability.freeSpots
    const total = rec.lot.availability.totalSpots
    const rate = total === 0 ? 0 : free / total
    return {
      lot: rec.lot,
      score: rec.score,
      reasons: rec.reasons,
      tone: rec.reasons[0] === '高峰紧张' ? 'bad' : 'good',
      distanceText: formatDistance(rec.lot.distanceM),
      walkText: `${rec.lot.walkMinutes} 分钟`,
      spotsText: formatSpots(free, total),
      freeClass: rate < 0.1 ? 'bad' : rate < 0.25 ? 'warn' : 'ok',
    }
  },

  pushHistory(keyword: string) {
    const next = [keyword].concat(this.data.history.filter(h => h !== keyword)).slice(0, 8)
    this.setData({ history: next })
    wx.setStorageSync(HISTORY_KEY, next)
  },

  onSortChange(e: WechatMiniprogram.CustomEvent<{ key: SortKey }>) {
    this.applySort(e.detail.key)
  },

  onCardTap(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    wx.navigateTo({ url: `/pages/lot-detail/lot-detail?id=${e.detail.id}` })
  },

  onNavigate(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const rec = this.recommendations.find(r => r.lot.id === e.detail.id)
    if (!rec) return
    openNavigation(rec.lot.location, rec.lot.name, rec.lot.address)
  },

  onReserve(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    wx.navigateTo({ url: `/pages/lot-detail/lot-detail?id=${e.detail.id}&intent=reserve` })
  },

  onBack() {
    wx.navigateBack()
  },
})
```

`miniprogram/pages/search/search.wxml`：

```xml
<view class="wrap">
  <view class="sb" />

  <view class="bar">
    <view class="bar__back" bindtap="onBack">‹</view>
    <input
      class="bar__input"
      value="{{keyword}}"
      placeholder="搜目的地 / 车场"
      confirm-type="search"
      bindinput="onInput"
      bindconfirm="search"
    />
    <view class="bar__cancel" bindtap="onBack">取消</view>
  </view>

  <block wx:if="{{state === 'idle'}}">
    <view class="hist" wx:if="{{history.length}}">
      <view class="hist__title">历史搜索</view>
      <view class="hist__list">
        <view
          wx:for="{{history}}"
          wx:key="*this"
          class="hist__item"
          data-kw="{{item}}"
          bindtap="onHistoryTap"
        >{{item}}</view>
      </view>
    </view>
  </block>

  <block wx:else>
    <map
      class="wrap__map"
      latitude="{{centerLat}}"
      longitude="{{centerLng}}"
      scale="15"
      markers="{{markers}}"
    />
    <view class="chips-row" wx:if="{{state === 'ready'}}">
      <sort-chips value="{{sortKey}}" bind:change="onSortChange" />
    </view>
  </block>

  <view class="sheet">
    <view class="sheet__handle" />

    <state-view wx:if="{{state === 'loading'}}" kind="loading" text="正在检索…" />
    <state-view
      wx:elif="{{state === 'empty'}}"
      kind="empty"
      text="没有找到相关车场"
      hint="换个关键词，或直接输入目的地"
    />
    <state-view
      wx:elif="{{state === 'error'}}"
      kind="error"
      text="检索失败"
      hint="请检查网络后重试"
      action-text="重试"
      bind:action="search"
    />
    <scroll-view wx:elif="{{state === 'ready'}}" class="sheet__list" scroll-y>
      <lot-card
        wx:for="{{cards}}"
        wx:key="lot.id"
        item="{{item}}"
        show-actions
        bind:cardtap="onCardTap"
        bind:navigate="onNavigate"
        bind:reserve="onReserve"
      />
      <view class="sheet__tail" />
    </scroll-view>
  </view>
</view>
```

`miniprogram/pages/search/search.wxss`：

```css
.wrap {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg);
}

.sb {
  height: 88rpx;
}

.bar {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 0 28rpx 20rpx;
}

.bar__back {
  font-size: 40rpx;
  color: var(--color-primary);
  line-height: 1;
}

.bar__input {
  flex: 1;
  height: 72rpx;
  background: #f1f5f9;
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 0 24rpx;
  font-size: 26rpx;
}

.bar__cancel {
  font-size: 26rpx;
  color: var(--color-text-weak);
}

.hist {
  padding: 20rpx 28rpx;
}

.hist__title {
  font-size: 23rpx;
  color: var(--color-text-weak);
  margin-bottom: 20rpx;
}

.hist__list {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.hist__item {
  padding: 12rpx 28rpx;
  background: var(--color-surface);
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-pill);
  font-size: 24rpx;
  color: #475569;
}

.wrap__map {
  position: absolute;
  top: 180rpx;
  left: 0;
  right: 0;
  height: 480rpx;
}

.chips-row {
  position: absolute;
  top: 670rpx;
  left: 28rpx;
}

.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 740rpx;
  background: var(--color-bg);
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  padding: 18rpx 28rpx 0;
  display: flex;
  flex-direction: column;
}

.sheet__handle {
  width: 76rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: #cbd5e1;
  margin: 0 auto 20rpx;
  flex: none;
}

.sheet__list {
  flex: 1;
  height: 0;
}

.sheet__list lot-card {
  display: block;
  margin-bottom: 18rpx;
}

.sheet__tail { height: 40rpx; }
```

- [ ] **Step 2: 注册页面**

`miniprogram/app.json` 的 `pages` 加入 `"pages/search/search"`。

- [ ] **Step 3: 人工验证**

Expected:
- 输入真实地点（如「齐鲁医院」「济南万象城」）回车后，地图定位到该处，下方列出周边车场
- 排序 chips 切换生效
- 每张卡片有「导航前往」「预约车位」两个按钮，分别触发 `wx.openLocation` 与跳详情页
- 历史搜索记录保留并在重进页面时展示

- [ ] **Step 4: 提交**

```bash
git add miniprogram/pages/search miniprogram/app.json
git commit -m "feat: implement search page with map and recommendations"
```

---

## Task 15: 车场详情页

**Files:**
- Create: `miniprogram/pages/lot-detail/*`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: 写页面**

`miniprogram/pages/lot-detail/lot-detail.json`：

```json
{
  "navigationStyle": "custom",
  "usingComponents": {
    "state-view": "/components/state-view/state-view"
  }
}
```

`miniprogram/pages/lot-detail/lot-detail.ts`：

```ts
import { DEFAULT_RADIUS_M } from '../../config'
import { formatAmount, formatDistance, formatSpots } from '../../domain/format'
import { scoreLot } from '../../domain/scoring'
import type { ParkingLot } from '../../domain/types'
import { fetchNearbyLots } from '../../services/lot'
import { getCurrentPoint, openNavigation } from '../../services/location'

Page({
  data: {
    state: 'loading' as 'loading' | 'ready' | 'error',
    lot: null as ParkingLot | null,
    /** 地图默认中心，避免 lot 未就绪时 map 组件拿到 undefined 坐标 */
    lat: 36.6512,
    lng: 117.1201,
    score: 0,
    reasons: [] as string[],
    distanceText: '',
    walkText: '',
    spotsText: '',
    freeClass: 'ok',
    freeRatePercent: 0,
    priceText: '',
    nextHourText: '',
    capText: '',
    nightText: '',
    /** 未来 2 小时预测柱，高 0–100 */
    forecast: [] as number[],
    forecastLabels: [] as string[],
  },

  intent: '' as '' | 'reserve',

  onLoad(query: Record<string, string>) {
    this.intent = query.intent === 'reserve' ? 'reserve' : ''
    this.load(query.id)
  },

  async load(id: string) {
    this.setData({ state: 'loading' })
    try {
      const loc = await getCurrentPoint()
      const center = loc.ok ? loc.point : { lat: 36.6512, lng: 117.1201 }

      const { lots } = await fetchNearbyLots(center, DEFAULT_RADIUS_M)
      const lot = lots.find(l => l.id === id)
      if (!lot) {
        this.setData({ state: 'error' })
        return
      }

      const rec = scoreLot(lot, { allLots: lots, hasCharging: lot.tags.includes('充电桩'), userNeedsCharging: false })
      const free = lot.availability.freeSpots
      const total = lot.availability.totalSpots
      const rate = total === 0 ? 0 : free / total

      this.setData({
        state: 'ready',
        lot,
        lat: lot.location.lat,
        lng: lot.location.lng,
        score: rec.score,
        reasons: rec.reasons,
        distanceText: formatDistance(lot.distanceM),
        walkText: `${lot.walkMinutes} 分钟`,
        spotsText: formatSpots(free, total),
        freeClass: rate < 0.1 ? 'bad' : rate < 0.25 ? 'warn' : 'ok',
        freeRatePercent: Math.round(rate * 100),
        priceText: formatAmount(lot.pricing.firstHour),
        nextHourText: formatAmount(lot.pricing.perHourAfter),
        capText: formatAmount(lot.pricing.capPerDay),
        nightText: lot.pricing.nightRate ? formatAmount(lot.pricing.nightRate) : '--',
        forecast: this.buildForecast(rate),
        forecastLabels: ['现在', '+30分', '+1时', '+1.5时', '+2时', '+2.5时'],
      })
    } catch {
      this.setData({ state: 'error' })
    }
  },

  /** 由当前空闲率推出一条 6 点的占位预测曲线，接入真实预测服务后替换 */
  buildForecast(rate: number): number[] {
    const shape = [1.0, 0.82, 0.62, 0.4, 0.66, 0.88]
    return shape.map(s => Math.max(6, Math.min(100, Math.round(rate * 100 * s * 3.2))))
  },

  onNavigate() {
    const lot = this.data.lot
    if (!lot) return
    openNavigation(lot.location, lot.name, lot.address)
  },

  onReserve() {
    wx.showToast({ title: '预约流程将在下一阶段接入', icon: 'none' })
  },

  onBack() {
    wx.navigateBack()
  },

  onRetry() {
    const lot = this.data.lot
    if (lot) this.load(lot.id)
  },
})
```

`miniprogram/pages/lot-detail/lot-detail.wxml`：

```xml
<view class="wrap">
  <map
    class="hero"
    latitude="{{lat}}"
    longitude="{{lng}}"
    scale="16"
  />
  <view class="hero__back" bindtap="onBack">‹ 返回</view>

  <state-view wx:if="{{state === 'loading'}}" kind="loading" text="加载车场信息…" />
  <state-view
    wx:elif="{{state === 'error'}}"
    kind="error"
    text="车场信息加载失败"
    hint="请检查网络后重试"
    action-text="重试"
    bind:action="onRetry"
  />

  <block wx:else>
    <scroll-view class="body" scroll-y>
      <view class="card card--lift">
        <view class="card__head">
          <view class="card__name">{{lot.name}}</view>
          <view class="card__rating">★ {{lot.rating}}</view>
        </view>
        <view class="card__addr">{{lot.address}} · 步行 {{walkText}}</view>

        <view class="stats">
          <view class="stat">
            <view class="stat__k">实时余位</view>
            <view class="stat__v {{freeClass}}">{{spotsText}}</view>
          </view>
          <view class="stat">
            <view class="stat__k">标准收费</view>
            <view class="stat__v primary">¥{{priceText}}<text class="stat__u">/时</text></view>
          </view>
          <view class="stat">
            <view class="stat__k">综合评分</view>
            <view class="stat__v">{{score}}</view>
          </view>
        </view>
      </view>

      <view class="card">
        <view class="card__title">未来 2 小时空闲预测</view>
        <view class="bars">
          <view
            wx:for="{{forecast}}"
            wx:key="index"
            class="bars__col"
          >
            <view class="bars__bar {{item < 25 ? 'bars__bar--bad' : ''}}" style="height: {{item}}%;" />
          </view>
        </view>
        <view class="bars__labels">
          <view wx:for="{{forecastLabels}}" wx:key="*this" class="bars__label">{{item}}</view>
        </view>
      </view>

      <view class="card">
        <view class="card__title">收费规则</view>
        <view class="row"><text class="row__k">首小时</text><text>¥{{priceText}}</text></view>
        <view class="row"><text class="row__k">后续每小时</text><text>¥{{nextHourText}}</text></view>
        <view class="row"><text class="row__k">计费步长</text><text>15 分钟</text></view>
        <view class="row"><text class="row__k">单日封顶</text><text>¥{{capText}}</text></view>
        <view class="row"><text class="row__k">夜间 22:00–08:00</text><text>¥{{nightText}}/时</text></view>
      </view>

      <view class="card">
        <view class="card__title">可预约额度</view>
        <view class="quota">本车场已开放 <text class="primary bold">{{lot.reservableQuota}}</text> 个预约车位</view>
        <view class="quota__note">直接导航前往不收费；预约锁位需支付预支停车费 + 平台服务费</view>
      </view>

      <view class="tail" />
    </scroll-view>

    <view class="bottom">
      <view class="bottom__ghost" bindtap="onNavigate">导航前往</view>
      <view class="bottom__primary" bindtap="onReserve">预约车位</view>
    </view>
  </block>
</view>
```

`miniprogram/pages/lot-detail/lot-detail.wxss`：

```css
.wrap {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg);
}

.hero {
  width: 100%;
  height: 420rpx;
}

.hero__back {
  position: absolute;
  top: 104rpx;
  left: 28rpx;
  background: rgba(255, 255, 255, 0.94);
  border-radius: var(--radius-pill);
  padding: 10rpx 26rpx;
  font-size: 25rpx;
}

.body {
  position: absolute;
  top: 380rpx;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0 28rpx;
  box-sizing: border-box;
}

.card {
  background: var(--color-surface);
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 28rpx;
  margin-bottom: 20rpx;
}

.card--lift {
  margin-top: -32rpx;
  box-shadow: var(--shadow-card);
}

.card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.card__name {
  font-size: 38rpx;
  font-weight: 700;
  flex: 1;
}

.card__rating {
  font-size: 25rpx;
  font-weight: 700;
  color: #f59e0b;
}

.card__addr {
  font-size: 24rpx;
  color: var(--color-text-sub);
  margin-top: 12rpx;
}

.card__title {
  font-size: 27rpx;
  font-weight: 700;
  margin-bottom: 18rpx;
}

.stats {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}

.stat {
  flex: 1;
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 18rpx 20rpx;
}

.stat__k { font-size: 21rpx; color: var(--color-text-weak); }
.stat__v { font-size: 36rpx; font-weight: 700; margin-top: 6rpx; letter-spacing: -1rpx; }
.stat__u { font-size: 20rpx; font-weight: 400; color: var(--color-text-weak); }

.ok { color: var(--color-success); }
.warn { color: var(--color-warning); }
.bad { color: var(--color-danger); }
.primary { color: var(--color-primary); }
.bold { font-weight: 700; }

.bars {
  display: flex;
  align-items: flex-end;
  gap: 12rpx;
  height: 140rpx;
}

.bars__col {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.bars__bar {
  background: #93c5fd;
  border-radius: 4rpx;
}

.bars__bar--bad { background: #fca5a5; }

.bars__labels {
  display: flex;
  gap: 12rpx;
  margin-top: 10rpx;
}

.bars__label {
  flex: 1;
  text-align: center;
  font-size: 19rpx;
  color: var(--color-text-weak);
}

.row {
  display: flex;
  justify-content: space-between;
  font-size: 25rpx;
  padding: 8rpx 0;
}

.row__k { color: var(--color-text-sub); }

.quota { font-size: 25rpx; color: var(--color-text-sub); }

.quota__note {
  font-size: 21rpx;
  color: var(--color-text-weak);
  margin-top: 16rpx;
  line-height: 1.7;
}

.tail { height: 140rpx; }

.bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 20rpx;
  padding: 22rpx 28rpx calc(22rpx + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border-top: 2rpx solid var(--color-border);
}

.bottom__ghost,
.bottom__primary {
  height: 92rpx;
  line-height: 92rpx;
  text-align: center;
  border-radius: var(--radius-pill);
  font-size: 29rpx;
  font-weight: 600;
}

.bottom__ghost {
  flex: 1;
  border: 2rpx solid #cbd5e1;
  color: #334155;
}

.bottom__primary {
  flex: 1.5;
  background: var(--color-primary);
  color: #fff;
}
```

- [ ] **Step 2: 注册页面**

`miniprogram/app.json` 的 `pages` 加入 `"pages/lot-detail/lot-detail"`。

- [ ] **Step 3: 人工验证**

Expected:
- 从首页或搜索页点卡片进入详情，顶部地图定位到该车场
- 信息卡显示真实车场名与地址，余位/收费为估算值
- 收费规则、预测柱、可预约额度三张卡正常渲染
- 底部「导航前往」调起微信内置地图，「预约车位」给出下一阶段提示

- [ ] **Step 4: 提交**

```bash
git add miniprogram/pages/lot-detail miniprogram/app.json
git commit -m "feat: implement lot detail page"
```

---

## 完成定义

计划 1 完成时应当能：

1. 首次启动停在身份选择页，选车主后进入 3 tab 的主界面
2. 首页自动定位并列出周边**真实**车场（腾讯 POI），支持综合/距离/价格/空位四种排序
3. 搜索页可搜目的地或车场名，展示推荐结果并标出推荐理由
4. 车场详情展示余位、收费规则、预测曲线、可预约额度
5. 每个车场都有「导航前往」（免费）与「预约车位」（占位）两个动作
6. `npm test` 全绿

## 已知未完成（后续计划）

- 预约确认、预约凭证、订单中心、我的、我的车辆、信用与违约 → 计划 2
- 车场端全部页面 → 计划 3
- 真实车流预测服务：当前 `buildForecast` 是由实时空闲率推导的占位曲线，接入后替换
- 登录与会话：`app.ts` 本阶段不做 `wx.login`，`services/api.ts` 在计划 2 需要后端时再引入
- `miniprogram/services/lot.ts` 的估算字段（车位数、余位、收费）在界面上尚未逐处标注来源，计划 2 统一处理
