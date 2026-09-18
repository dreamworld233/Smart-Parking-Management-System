# 体验优化 + 1:N 拓展 + 输入上限 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全部二级/三级页面操作便利性优化（返回键触摸区、orders 详情返回、地图气泡可点）+ 车主多车辆与车场主多车场 1:N 拓展（本地存储）+ 收费价格/步长输入上限 + 移除 spike-map 遗留页。

**Architecture:** A 部分纯前端（wxss/wxml/domain）；B 部分本地 storage（车辆数组）+ confirm/profile 两页；C 部分云函数 `adminGetLot` 返回车场列表、`adminDashboard`/`adminReservations` 显式接 `lotId` + 归属校验，前端四页经 `resolveCurrentLotId()`（storage 优先）取当前车场；D 部分客户端 + 云端双向校验。

**Tech Stack:** 微信小程序原生 TS + Skyline + glass-easel；云开发云函数（CommonJS）；jest 离线测试（`jest.mock('wx-server-sdk')` mockStore 套路）。

**验收命令：** `npm test`（全量离线单测）、`npx tsc --noEmit`（类型）、`npm run test:live`（真接口，别连刷）。地图/Skyline 相关只在真机验。

---

## 文件结构

**新增：**
- `miniprogram/assets/transparent.png`（1×1 透明 PNG，图钉命中区用）

**修改（前端 domain/services）：**
- `miniprogram/domain/pins.ts` — toMarkers 加 iconPath/anchor/放大命中区
- `miniprogram/services/storage.ts` — 车辆数组 + 当前车场 id + getDefaultPlate 兼容
- `miniprogram/services/cloud.ts` — AdminGetLotData 改 lots、fetchAdminDashboard/fetchAdminReservations 加 lotId、resolveCurrentLotId

**修改（前端页面）：**
- `pages/confirm/*` — 返回键命中区 + 已存车牌 chips
- `pages/search/*`、`pages/owner/bind-lot/*` — 返回键命中区
- `pages/orders/*` — 详情返回键
- `pages/profile/*` — 车辆管理卡（内容改 scroll-view）
- `pages/owner/lot/*` — 当前车场解析 + 价格/步长上限
- `pages/owner/dashboard/*`、`pages/owner/reservations/*` — 当前车场解析并传 lotId
- `pages/owner/profile/*` — 切换车场卡
- `components/lot-detail/*` — 面板返回命中区

**修改（云函数 + 测试）：**
- `cloudfunctions/adminGetLot/index.js` — 返回 lots 列表
- `cloudfunctions/adminDashboard/index.js`、`cloudfunctions/adminReservations/index.js` — 加 lotId + 归属校验
- `cloudfunctions/adminUpdateLot/index.js` — 价格/步长上限
- `tests/domain/pins.test.ts`、`tests/services/storage.test.ts`、`tests/services/cloud.test.ts`、`tests/cloudfunctions/adminGetLot.test.ts`、`tests/cloudfunctions/adminDashboard.test.ts`、`tests/cloudfunctions/adminReservations.test.ts`、`tests/cloudfunctions/adminUpdateLot.test.ts`

**删除：**
- `miniprogram/pages/spike-map/`（目录）
- `miniprogram/app.json` — `pages/spike-map/spike-map` 行

---

## Task 1: A1 返回键触摸区

**Files:**
- Modify: `miniprogram/pages/confirm/confirm.wxss:21-25`（`.bar__back`）
- Modify: `miniprogram/pages/search/search.wxss:26-30`（`.bar__back`）
- Modify: `miniprogram/pages/owner/bind-lot/bind-lot.wxss:21-25`（`.bar__back`）
- Modify: `miniprogram/components/lot-detail/lot-detail.wxss:12-18`（`.detail__back`）

- [ ] **Step 1: 四页 `.bar__back` 加命中区**

用 weui 负 margin 套路（组件 `navigation-bar.wxss:40-43` 同款）：padding 扩命中区、负 margin 抵消布局位移，顶栏其他子项位置不变。

`confirm.wxss`、`search.wxss`、`bind-lot.wxss` 三处 `.bar__back` 改成：

```css
.bar__back {
  font-size: 40rpx;
  color: var(--color-primary);
  line-height: 1;
  /* 触摸区 ≥ 88rpx：padding 扩命中、负 margin 抵消，不挤动顶栏其他项 */
  padding: 24rpx 20rpx;
  margin: -24rpx -20rpx;
}
```

- [ ] **Step 2: lot-detail 面板返回加命中区**

`lot-detail.wxss` `.detail__back`（12-18 行）改成：

```css
.detail__back {
  flex: none;
  font-size: var(--font-sub);
  font-weight: 600;
  color: var(--color-primary);
  /* 与页面返回键同套路：命中区撑大，负 margin 抵消布局 */
  padding: 20rpx 24rpx;
  margin: -20rpx -24rpx;
}
```

- [ ] **Step 3: 类型与测试**

无单测覆盖（纯 wxss）。运行：

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: 提交**

```bash
git add miniprogram/pages/confirm/confirm.wxss miniprogram/pages/search/search.wxss miniprogram/pages/owner/bind-lot/bind-lot.wxss miniprogram/components/lot-detail/lot-detail.wxss
git commit -m "fix(ux): 返回键触摸区扩到 88rpx（confirm/search/bind-lot/lot-detail）"
```

---

## Task 2: A2 orders 详情页补返回键

**Files:**
- Modify: `miniprogram/pages/orders/orders.wxml:2-5`（顶栏）
- Modify: `miniprogram/pages/orders/orders.wxss`（`.bar__back`）

- [ ] **Step 1: wxml 加返回键**

`orders.wxml` 顶栏（3-5 行）改成：

```xml
  <view class="bar" style="top: {{navTop}}px">
    <view class="bar__back" wx:if="{{detail}}" bindtap="onBack">‹</view>
    <view class="bar__title">我的订单</view>
  </view>
```

`onBack()` 在 `orders.ts:168-170` 已存在（`setData({ detail: null })`），无需改 ts。

- [ ] **Step 2: wxss 加 `.bar__back`**

`orders.wxss` 在 `.bar__title`（20-24 行）前加：

```css
.bar__back {
  font-size: 40rpx;
  color: var(--color-primary);
  line-height: 1;
  margin-right: 20rpx;
  /* 触摸区 ≥ 88rpx：padding 扩命中、负 margin 抵消（与 confirm 页同套路） */
  padding: 24rpx 20rpx;
  margin: -24rpx -20rpx 0 0;
}
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/pages/orders/orders.wxml miniprogram/pages/orders/orders.wxss
git commit -m "fix(orders): 详情视图补返回键（onBack 早已存在，只缺按钮）"
```

---

## Task 3: A3 地图图钉及气泡可点击

**Files:**
- Create: `miniprogram/assets/transparent.png`
- Modify: `miniprogram/domain/pins.ts:26-41,106-123`
- Test: `tests/domain/pins.test.ts:126-154`

- [ ] **Step 1: 建透明 PNG 资产**

Run（Git Bash base64 解出 1×1 透明 PNG）：

```bash
mkdir -p miniprogram/assets && echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > miniprogram/assets/transparent.png
```

验证：`ls -la miniprogram/assets/transparent.png` 应存在且约 68 字节。开发者工具重编译后可见（新增文件需工具重新读取）。

- [ ] **Step 2: MapMarker 接口加 iconPath/anchor**

`pins.ts` `MapMarker` 接口（26-41 行）加字段：

```ts
export interface MapMarker {
  id: number
  latitude: number
  longitude: number
  width: number
  height: number
  /** 透明图标：marker 命中区（width×height）盖住整个气泡。label 是视觉，不参与点击 */
  iconPath: string
  /** 图标中心对准坐标点（默认锚点即 0.5/0.5，显式写出防将来改忘） */
  anchor: { x: number; y: number }
  label: {
    content: string
    fontSize: number
    color: string
    bgColor: string
    borderRadius: number
    padding: number
    textAlign: string
  }
}
```

- [ ] **Step 3: toMarkers 放大命中区**

`pins.ts` `toMarkers`（106-123 行）map 回调改成：

```ts
export function toMarkers(pins: MapPin[]): MapMarker[] {
  return pins.map((p, i) => ({
    id: i,
    latitude: p.latitude,
    longitude: p.longitude,
    // 命中区要盖住气泡：以前 width/height 是 1×1，气泡点不到（2026-09-17 组员反馈）。
    // 透明图标只负责「点得到」，label 仍是唯一视觉
    iconPath: '/assets/transparent.png',
    width: 100,
    height: 48,
    anchor: { x: 0.5, y: 0.5 },
    label: {
      content: p.label,
      fontSize: p.selected ? PIN_FONT_SELECTED : PIN_FONT,
      color: p.selected ? PIN_FG_ON : PIN_FG_OFF,
      bgColor: p.selected ? PIN_BG_ON : PIN_BG_OFF,
      borderRadius: 11,
      padding: p.selected ? PIN_PADDING_SELECTED : PIN_PADDING,
      textAlign: 'center',
    },
  }))
}
```

- [ ] **Step 4: 更新测试**

`tests/domain/pins.test.ts` `describe('toMarkers')` 追加：

```ts
  it('命中区放大：透明 iconPath + width/height 盖住气泡（气泡可点）', () => {
    const m = toMarkers(pins)[0]
    expect(m.iconPath).toBe('/assets/transparent.png')
    expect(m.width).toBe(100)
    expect(m.height).toBe(48)
    expect(m.anchor).toEqual({ x: 0.5, y: 0.5 })
  })

  it('选中态只体现在 label 样式，命中区与默认一致', () => {
    const [plain, selected] = toMarkers(pins)
    expect(selected.width).toBe(plain.width)
    expect(selected.iconPath).toBe(plain.iconPath)
  })
```

- [ ] **Step 5: 跑测试**

Run: `npx jest tests/domain/pins.test.ts`
Expected: 全部通过（原 toMatchObject 断言不受新增字段影响）

- [ ] **Step 6: 提交**

```bash
git add miniprogram/assets/transparent.png miniprogram/domain/pins.ts tests/domain/pins.test.ts
git commit -m "fix(map): 图钉透明图标放大命中区，气泡可点击（width 1→100）"
```

- [ ] **Step 7: 真机验证（用户在场）**

验证点：① 图钉 label 视觉位置不因加 icon 而偏移（加 icon 可能改变 label 锚点）② 点气泡（价格·距离文字）触发 `bindmarkertap` 选中该车场。
若 label 偏移：回退方案 = 去掉 `iconPath`，改 `callout`（`display:'ALWAYS'`）承载同一视觉，`bindmarkertap` + `bindcallouttap` 都绑 `onPinTap`（两页 home.ts/search.ts 的 map 组件都要加 `bindcallouttap="onPinTap"`）。改完重跑本 Task 测试。

---

## Task 4: D1 owner/lot 客户端价格/步长上限

**Files:**
- Modify: `miniprogram/pages/owner/lot/lot.ts:208-221`（onConfirmEdit 校验）+ 常量区

- [ ] **Step 1: 加上限常量**

`lot.ts` 在 `CACHE_TTL_MS`（45 行）后加：

```ts
/** 收费价格上限（元）：车位数量已限量，价格无上限会出离谱值（2026-09-17 组员反馈） */
const PRICE_MAX = 200
const CAP_MAX = 1000
/** 计费步长（分钟）：过小无意义、过大不合理 */
const STEP_MIN = 5
const STEP_MAX = 120
```

- [ ] **Step 2: onConfirmEdit 校验加上限**

`lot.ts` `onConfirmEdit`（208-221 行）数字分支改成：

```ts
    if (numeric) {
      const n = Number(val)
      if (!Number.isFinite(n) || n < 0) {
        this.setData({ inputInvalid: true })
        return
      }
      // 步长独立上下限；单价/夜间费率上限 PRICE_MAX；封顶上限 CAP_MAX
      const over = field === 'stepMinutes'
        ? (!Number.isInteger(n) || n < STEP_MIN || n > STEP_MAX)
        : field === 'capPerDay'
          ? n > CAP_MAX
          : n > PRICE_MAX
      if (over) {
        this.setData({ inputInvalid: true })
        return
      }
    } else if (val === '') {
```

`inputInvalid` 提示文案由 `lot.wxml:88` 的 `{{edit.label}}` 与「输入不合法」承担，无需改 wxml。

- [ ] **Step 3: 提交**

```bash
git add miniprogram/pages/owner/lot/lot.ts
git commit -m "feat(owner/lot): 收费价格 0~200、封顶 0~1000、步长 5~120 客户端上限"
```

---

## Task 5: D2 adminUpdateLot 云端价格/步长上限

**Files:**
- Modify: `cloudfunctions/adminUpdateLot/index.js`（sanitizePatch）
- Test: `tests/cloudfunctions/adminUpdateLot.test.ts`

- [ ] **Step 1: sanitizePatch 加上限**

`adminUpdateLot/index.js` 顶部常量区（`FLAT_KEYS` 之后）加：

```js
// 与前端 owner/lot.ts 同口径的上限（云端是权威，客户端可被绕过）
const PRICE_MAX = 200
const CAP_MAX = 1000
const STEP_MIN = 5
const STEP_MAX = 120
```

`sanitizePatch` 里 pricing 的 for 循环整体替换成：

```js
    for (const k of pKeys) {
      if (k === 'nightRate') {
        // 夜间费率：null 合法（没有夜间计费），数字必须非负且不超单价上限
        if (raw.pricing[k] !== null) {
          if (!isFiniteNum(raw.pricing[k]) || raw.pricing[k] < 0 || raw.pricing[k] > PRICE_MAX) return null
        }
        pricing[k] = raw.pricing[k]
      } else if (!isFiniteNum(raw.pricing[k]) || raw.pricing[k] < 0) {
        return null
      } else if (k === 'stepMinutes') {
        // 计费步长：整数且在 5~120 之间
        const s = raw.pricing[k]
        if (!Number.isInteger(s) || s < STEP_MIN || s > STEP_MAX) return null
        pricing[k] = s
      } else if (k === 'capPerDay') {
        if (raw.pricing[k] > CAP_MAX) return null
        pricing[k] = raw.pricing[k]
      } else if (raw.pricing[k] > PRICE_MAX) {
        return null
      } else {
        pricing[k] = raw.pricing[k]
      }
    }
```

- [ ] **Step 2: 跑现有测试确认结构没断**

Run: `npx jest tests/cloudfunctions/adminUpdateLot.test.ts`
Expected: 现有全过（合法值不受影响）

- [ ] **Step 3: 补上限测试**

`tests/cloudfunctions/adminUpdateLot.test.ts` 的 `describe('adminUpdateLot')` 内追加（文件已 `seedUser()`/`seedLot()`/`main({ lotId, patch })` 套路，直接复用）：

```ts
  it('收费价格超上限 → 拒绝（云端权威，客户端可被绕过）', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', patch: { pricing: { firstHour: 500 } } })).code).toBe('BAD_REQUEST')
  })

  it('单日封顶超上限 → 拒绝', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', patch: { pricing: { capPerDay: 9999 } } })).code).toBe('BAD_REQUEST')
  })

  it('步长超出 5~120 → 拒绝；步长非整数 → 拒绝', async () => {
    seedUser()
    seedLot()
    expect((await main({ lotId: 'lot1', patch: { pricing: { stepMinutes: 2 } } })).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1', patch: { pricing: { stepMinutes: 300 } } })).code).toBe('BAD_REQUEST')
    expect((await main({ lotId: 'lot1', patch: { pricing: { stepMinutes: 10.5 } } })).code).toBe('BAD_REQUEST')
  })

  it('上限内合法值通过', async () => {
    seedUser()
    seedLot()
    const r = await main({ lotId: 'lot1', patch: { pricing: { firstHour: 200, capPerDay: 1000, stepMinutes: 60 } } })
    expect(r.code).toBe(0)
  })
```

- [ ] **Step 4: 跑测试**

Run: `npx jest tests/cloudfunctions/adminUpdateLot.test.ts`
Expected: 全部通过

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/adminUpdateLot/index.js tests/cloudfunctions/adminUpdateLot.test.ts
git commit -m "feat(adminUpdateLot): 价格/封顶/步长云端上限校验（与前端同口径）"
```

---

## Task 6: B1 storage 车辆数组 + 当前车场 id

**Files:**
- Modify: `miniprogram/services/storage.ts`
- Test: `tests/services/storage.test.ts`

- [ ] **Step 1: storage.ts 加车辆/当前车场 API**

`storage.ts` 常量区（`LOT_DIRTY_KEY` 后）加：

```ts
/** 车主车辆列表（车牌数组，本地存储，换设备丢失 —— 用户拍板接受） */
const VEHICLES_KEY = 'qnt.vehicles'
/** 车场主当前管理的车场 id（本地存储；切换在「车场我的」） */
const CURRENT_LOT_KEY = 'qnt.currentLotId'
/** 车辆数上限 */
export const VEHICLES_MAX = 5
```

`getDefaultPlate`（34-42 行）改成「旧 key 优先、回退车辆首条」：

```ts
export function getDefaultPlate(): string {
  const v = wx.getStorageSync(PLATE_KEY)
  if (typeof v === 'string' && v !== '') return v
  // 兼容：老用户只有 defaultPlate；新用户走车辆列表
  return getVehicles()[0] ?? ''
}
```

文件尾部（`pushSearchHistory` 后）加：

```ts
/**
 * 已存车辆列表。与 searchHistory 同规格地校验形状：非数组 → 空；
 * 非字符串项逐条剔，一条脏数据不该让整个列表没掉
 */
export function getVehicles(): string[] {
  const v = wx.getStorageSync(VEHICLES_KEY)
  if (!Array.isArray(v)) return []
  return v.filter((item): item is string => typeof item === 'string')
}

/** 添加车辆：去重置顶、截到上限。返回写入后的列表 */
export function addVehicle(plate: string): string[] {
  const next = [plate].concat(getVehicles().filter(p => p !== plate)).slice(0, VEHICLES_MAX)
  wx.setStorageSync(VEHICLES_KEY, next)
  return next
}

/** 删除车辆。返回写入后的列表 */
export function removeVehicle(plate: string): string[] {
  const next = getVehicles().filter(p => p !== plate)
  wx.setStorageSync(VEHICLES_KEY, next)
  return next
}

export function getCurrentLotId(): string {
  const v = wx.getStorageSync(CURRENT_LOT_KEY)
  return typeof v === 'string' && v !== '' ? v : ''
}

export function setCurrentLotId(id: string): void {
  wx.setStorageSync(CURRENT_LOT_KEY, id)
}
```

- [ ] **Step 2: 补测试**

`tests/services/storage.test.ts` 追加 describe（`stubWx` 已有 `store`/`g.wx`）：

```ts
import {
  addVehicle, getCurrentLotId, getDefaultPlate, getVehicles, removeVehicle,
  setCurrentLotId,
} from '../../miniprogram/services/storage'

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
    for (let i = 0; i < 5; i++) addVehicle(`京C${i}000`)
    const next = addVehicle('京D00000')
    expect(next).toHaveLength(5)
    expect(next[0]).toBe('京D00000')
  })

  it('删除后返回剩余列表', () => {
    store['qnt.vehicles'] = ['京A12345', '京B00001']
    expect(removeVehicle('京A12345')).toEqual(['京B00001'])
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
```

- [ ] **Step 3: 跑测试**

Run: `npx jest tests/services/storage.test.ts`
Expected: 全部通过

- [ ] **Step 4: 提交**

```bash
git add miniprogram/services/storage.ts tests/services/storage.test.ts
git commit -m "feat(storage): 车辆数组 + 当前车场 id，getDefaultPlate 回退车辆首条"
```

---

## Task 7: B2 profile 页「我的车辆」卡

**Files:**
- Modify: `miniprogram/pages/profile/profile.wxml`
- Modify: `miniprogram/pages/profile/profile.ts`
- Modify: `miniprogram/pages/profile/profile.wxss`

- [ ] **Step 1: wxml 内容改 scroll-view + 加车辆卡**

`profile.wxml` 整份替换为：

```xml
<view class="wrap">
  <scroll-view class="page" scroll-y style="padding-top: {{navTop}}px">
    <view class="me">
      <view class="me__avatar">🚗</view>
      <view class="me__identity">{{identityText}}</view>
      <view class="me__plate">常用车牌 {{plateText}}</view>
    </view>

    <!-- 我的车辆：列表 + 添加（1:N，本地存储） -->
    <view class="card vehicles">
      <view class="vehicles__head">
        <text class="vehicles__title">我的车辆</text>
        <text class="vehicles__add" bindtap="onToggleAdd">{{adding ? '取消' : '+ 添加'}}</text>
      </view>
      <view class="vehicles__list" wx:if="{{vehicles.length}}">
        <view wx:for="{{vehicles}}" wx:key="*this" class="vehicles__item">
          <text class="vehicles__plate">{{item}}</text>
          <text class="vehicles__del" data-plate="{{item}}" bindtap="onRemoveVehicle">删除</text>
        </view>
      </view>
      <view class="vehicles__empty" wx:else>还没有车辆，预约时可直接输入车牌</view>
      <view class="vehicles__addrow" wx:if="{{adding}}">
        <input
          class="vehicles__input {{plateInput && !plateInputValid ? 'vehicles__input--invalid' : ''}}"
          value="{{plateInput}}"
          placeholder="输入车牌，如 京A8F2K9"
          maxlength="8"
          bindinput="onVehicleInput"
          focus
        />
        <view class="vehicles__ok" bindtap="onConfirmAdd">确定</view>
      </view>
    </view>

    <view class="card" bindtap="onSwitchRole">
      <text>切换身份</text>
      <text class="card__arrow">›</text>
    </view>

    <view class="version">智慧停车 · 车主端</view>
  </scroll-view>
</view>
```

- [ ] **Step 2: wxss 车辆卡样式**

`profile.wxss` `.page` 保持 padding 逻辑（改由 scroll-view 承载），尾部追加：

```css
.vehicles__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vehicles__title {
  font-size: var(--font-body);
  font-weight: 600;
  color: var(--color-text);
}

.vehicles__add {
  font-size: var(--font-sub);
  color: var(--color-primary);
  font-weight: 600;
  padding: 8rpx 16rpx;
}

.vehicles__list {
  margin-top: var(--space-2);
}

.vehicles__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 2rpx solid var(--color-border);
}

.vehicles__plate {
  font-size: var(--font-body);
  letter-spacing: 2rpx;
  color: var(--color-text);
}

.vehicles__del {
  font-size: var(--font-sub);
  color: var(--color-danger);
  padding: 8rpx 12rpx;
}

.vehicles__empty {
  font-size: var(--font-micro);
  color: var(--color-text-weak);
  margin-top: var(--space-2);
}

.vehicles__addrow {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.vehicles__input {
  flex: 1;
  height: 72rpx;
  background: var(--color-bg);
  border: 2rpx solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 0 20rpx;
  font-size: var(--font-body);
  letter-spacing: 4rpx;
}

.vehicles__input--invalid {
  border-color: var(--color-danger);
}

.vehicles__ok {
  padding: 0 36rpx;
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-card);
  font-size: var(--font-sub);
  font-weight: 600;
  display: flex;
  align-items: center;
}
```

- [ ] **Step 3: ts 加车辆逻辑**

`profile.ts` 改 import + data + 方法：

```ts
import { formatPlate, isValidPlate } from '../../domain/format'
import { addVehicle, clearRole, getDefaultPlate, getVehicles, removeVehicle } from '../../services/storage'

Page({
  data: {
    plateText: '',
    identityText: '车主',
    navTop: 100,
    vehicles: [] as string[],
    adding: false,
    plateInput: '',
    plateInputValid: false,
  },
  // onLoad 不变
  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(2)
    const plate = getDefaultPlate()
    this.setData({
      plateText: plate ? formatPlate(plate) : '未设置',
      vehicles: getVehicles(),
    })
  },
  onToggleAdd() {
    this.setData({ adding: !this.data.adding, plateInput: '', plateInputValid: false })
  },
  onVehicleInput(e: WechatMiniprogram.Input) {
    const v = e.detail.value
    this.setData({ plateInput: v, plateInputValid: isValidPlate(v) })
  },
  onConfirmAdd() {
    const v = this.data.plateInput.trim()
    if (!isValidPlate(v)) {
      this.setData({ plateInputValid: false })
      wx.showToast({ title: '车牌格式不正确', icon: 'none' })
      return
    }
    const list = addVehicle(v)
    this.setData({ vehicles: list, adding: false, plateInput: '', plateText: formatPlate(getDefaultPlate()) })
    wx.showToast({ title: '已添加', icon: 'success' })
  },
  onRemoveVehicle(e: WechatMiniprogram.TouchEvent) {
    const plate = String(e.currentTarget.dataset.plate)
    wx.showModal({
      title: '删除车辆',
      content: `确定删除 ${plate}？`,
      confirmColor: '#dc2626',
      success: res => {
        if (!res.confirm) return
        const list = removeVehicle(plate)
        this.setData({ vehicles: list, plateText: formatPlate(getDefaultPlate()) })
      },
    })
  },
  onSwitchRole() {
    clearRole()
    wx.navigateTo({ url: '/pages/role-select/role-select' })
  },
})
```

`onLoad` 原样保留（navTop 计算）。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0（`onShow` 原先是同步方法，本次仍同步）

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/profile/profile.wxml miniprogram/pages/profile/profile.ts miniprogram/pages/profile/profile.wxss
git commit -m "feat(profile): 车主「我的车辆」卡（添加/删除，本地存储）"
```

---

## Task 8: B3 confirm 页已存车牌 chips

**Files:**
- Modify: `miniprogram/pages/confirm/confirm.wxml:44-56`（车牌卡）
- Modify: `miniprogram/pages/confirm/confirm.ts`
- Modify: `miniprogram/pages/confirm/confirm.wxss`

- [ ] **Step 1: wxml 车牌卡加 chips**

`confirm.wxml` 车牌卡（44-56 行）改成：

```xml
    <!-- 车牌 -->
    <view class="card">
      <view class="card__title">车牌号</view>
      <view class="plates" wx:if="{{vehicles.length}}">
        <view
          wx:for="{{vehicles}}"
          wx:key="*this"
          class="plate-chip {{plate === item ? 'plate-chip--on' : ''}}"
          data-plate="{{item}}"
          bindtap="onVehicleTap"
        >{{item}}</view>
      </view>
      <input
        class="plate {{plate && !plateValid ? 'plate--invalid' : ''}}"
        value="{{plate}}"
        placeholder="输入车牌，如 京A8F2K9"
        maxlength="8"
        bindinput="onPlateInput"
      />
      <view class="hint" wx:if="{{plate && !plateValid}}">车牌格式不正确</view>
      <view class="hint" wx:else>下次预约自动带出</view>
    </view>
```

- [ ] **Step 2: wxss chips 样式**

`confirm.wxss` 在 `.plate`（123-135 行）前加：

```css
.plates {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: var(--space-2);
}

.plate-chip {
  padding: 12rpx 24rpx;
  border-radius: var(--radius-pill);
  border: 2rpx solid var(--color-border);
  background: var(--color-surface);
  font-size: var(--font-sub);
  color: var(--color-text);
  letter-spacing: 2rpx;
}

.plate-chip--on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
```

- [ ] **Step 3: ts 加载车辆 + 点选 + 提交存车**

`confirm.ts`：

import 行（8 行）改成：

```ts
import { addVehicle, getDefaultPlate, getVehicles, markLotDataDirty, setDefaultPlate } from '../../services/storage'
```

data 加 `vehicles: [] as string[]`。

`load()` 里 setData（111-116 行）加 `vehicles: getVehicles()`：

```ts
      this.setData({
        state: 'ready',
        lot: {...},
        options,
        firstHourText: formatAmount(firstHour),
        plate: getDefaultPlate(),
        plateValid: isValidPlate(getDefaultPlate()),
        vehicles: getVehicles(),
      })
```

加方法（`onPlateInput` 后）：

```ts
  onVehicleTap(e: WechatMiniprogram.TouchEvent) {
    const plate = String(e.currentTarget.dataset.plate)
    this.setData({ plate, plateValid: isValidPlate(plate) })
  },
```

`submit()` 成功分支（195-197 行）改成存进车辆列表（保留 setDefaultPlate 兼容）：

```ts
    if (r.ok) {
      // 记住这次车牌：进车辆列表（若合法），并保留旧 defaultPlate 键兼容
      setDefaultPlate(plate)
      if (isValidPlate(plate)) addVehicle(plate)
      markLotDataDirty()
      wx.showToast({ title: '支付成功（模拟）', icon: 'success' })
      setTimeout(() => wx.switchTab({ url: '/pages/orders/orders' }), 800)
      return
    }
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/confirm/confirm.wxml miniprogram/pages/confirm/confirm.ts miniprogram/pages/confirm/confirm.wxss
git commit -m "feat(confirm): 预约选车 chips（已存车牌点选 + 手输保留）"
```

---

## Task 9: C1 adminGetLot 返回车场列表

**Files:**
- Modify: `cloudfunctions/adminGetLot/index.js`
- Test: `tests/cloudfunctions/adminGetLot.test.ts`
- Modify（类型契约，Task 11 一起）：`miniprogram/services/cloud.ts` 的 `AdminGetLotData`

- [ ] **Step 1: 云函数改 lots 列表**

`adminGetLot/index.js` 顶部 `const lots = db.collection('lots')`（约 29 行）改名为 `const lotColl = db.collection('lots')`（避免与返回字段 `lots` 冲突）。

`exports.main` 主体「自动解析车场」段（`let lot = null` 那段，约 49-56 行）替换成：

```js
  // 车场主可管理多个车场（1:N）：返回全部名下车场，不再 limit(1) 取第一条
  let list = []
  try {
    const r = await lotColl.where({ adminUserId: OPENID }).limit(20).get()
    list = r.data.map(pickLot)
  } catch (e) {
    // lots 读失败：返回空列表不阻塞，前端按未绑定处理；真错误会在后续写操作暴露
  }

  return { code: 0, data: { role, lots: list } }
```

- [ ] **Step 2: 更新测试**

`tests/cloudfunctions/adminGetLot.test.ts`：

- 「lot_admin 且绑定了车场」断言改 `r.data.lots[0]`（原 `r.data.lot`）：

```ts
    expect(r.data.lots).toHaveLength(1)
    expect(r.data.lots[0]._id).toBe('lot1')
    expect(r.data.lots[0].name).toBe('合肥大学(南艳湖校区)停车场')
    expect(r.data.lots[0].reservedCount).toBe(3)
    expect(r.data.lots[0].note).toBeUndefined()
```

- 「没绑定车场」改：

```ts
    expect(r.data.lots).toEqual([])
```

- 「多个绑定车场取第一条」改为「多个绑定车场全返回」：

```ts
  it('多个绑定车场 → 全量返回', async () => {
    seedUser()
    seedLot()
    mockStore.lots.set('lot2', {
      _id: 'lot2',
      name: '第二家',
      address: 'x',
      adminUserId: 'openid-test-1',
    })
    const r = await main({})
    expect(r.code).toBe(0)
    expect(r.data.lots.map((l: { _id: string }) => l._id)).toEqual(['lot1', 'lot2'])
  })
```

- [ ] **Step 3: 跑测试**

Run: `npx jest tests/cloudfunctions/adminGetLot.test.ts`
Expected: 全部通过

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/adminGetLot/index.js tests/cloudfunctions/adminGetLot.test.ts
git commit -m "feat(adminGetLot): 返回管理员名下全部车场（1:N）"
```

---

## Task 10: C1b adminDashboard / adminReservations 加 lotId + 归属校验

**Files:**
- Modify: `cloudfunctions/adminDashboard/index.js`
- Modify: `cloudfunctions/adminReservations/index.js`
- Test: `tests/cloudfunctions/adminDashboard.test.ts`
- Test: `tests/cloudfunctions/adminReservations.test.ts`

- [ ] **Step 1: adminDashboard 加 lotId + 归属校验**

`adminDashboard/index.js` `exports.main` 改成 `async (event)`，头部（`exports.main = async () => {` 那行）后加：

```js
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }

  // 车场主多车场：前端解析当前车场后显式传 lotId（2026-09-18 设计 C1）
  const { lotId } = event || {}
  if (typeof lotId !== 'string' || lotId === '') {
    return { code: 'BAD_REQUEST', message: '缺少车场' }
  }
```

原「自动解析车场」段（`let lot; try { lot = (await lots.where({ adminUserId: OPENID }).limit(1).get()).data[0] ?? null } catch ...`）替换成：

```js
  let lot
  try {
    lot = (await lots.doc(lotId).get()).data
  } catch (e) {
    return { code: 'NOT_FOUND', message: '车场不存在' }
  }
  if (!lot || lot.adminUserId !== OPENID) {
    return { code: 'FORBIDDEN', message: '只能查看自己管理的车场' }
  }
```

原 `if (!lot) { return { code: 0, data: { lot: null, ... } } }` 分支删除（lotId 缺失已由 BAD_REQUEST 拦截；lot 必有值）。`const lotId = lot._id` 那行改为直接用入参 `lotId`（变量名冲突，把入参改成 `reqLotId` 或让入参名直接用 `lotId`、删除重赋值行）。

- [ ] **Step 2: adminReservations 同样改**

`adminReservations/index.js` 同套路：`exports.main = async (event)`，加 lotId 入参 + 校验 + `lots.doc(lotId)` 归属检查 + 删 `lot: null` 分支。

- [ ] **Step 3: 更新 adminDashboard 测试**

`tests/cloudfunctions/adminDashboard.test.ts` mock 的 `mkCollection` 加 `doc` 支持（`where` 方法后加）：

```ts
    const mkCollection = (collName: string) => ({
      doc: (id: string) => ({
        get: async () => ({ data: mockStore[collName].get(id) ?? null }),
      }),
      where: (query: Record<string, unknown>) => ({ /* 原样保留 */ }),
    })
```

调用处全部改传 `{ lotId: 'lot1' }`：

- 「无微信身份」→ `mockOpenid = null`，`main({ lotId: 'lot1' })`
- 「非 lot_admin」→ `main({ lotId: 'lot1' })`
- 「未绑定车场 → lot null」改为两条新用例：

```ts
  it('缺少 lotId → BAD_REQUEST', async () => {
    seedUser()
    seedLot()
    expect((await main({})).code).toBe('BAD_REQUEST')
  })

  it('查看非本人车场 → FORBIDDEN', async () => {
    seedUser()
    seedLot()
    mockStore.lots.set('lot2', {
      _id: 'lot2',
      name: '别人家的',
      address: 'x',
      adminUserId: 'openid-other',
      availability: { freeSpots: 1, totalSpots: 2, source: 'reported' },
    })
    const r = await main({ lotId: 'lot2' })
    expect(r.code).toBe('FORBIDDEN')
  })
```

- 其余统计/列表用例 `seedLot()` 后 `main({ lotId: 'lot1' })`。

- [ ] **Step 4: 更新 adminReservations 测试**

`tests/cloudfunctions/adminReservations.test.ts` 同套路：mkCollection 加 `doc`，调用改 `main({ lotId: 'lot1' })`，加 BAD_REQUEST / FORBIDDEN 用例（按该文件现有 seed 手法）。

- [ ] **Step 5: 跑测试**

Run: `npx jest tests/cloudfunctions/adminDashboard.test.ts tests/cloudfunctions/adminReservations.test.ts`
Expected: 全部通过

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/adminDashboard/index.js cloudfunctions/adminReservations/index.js tests/cloudfunctions/adminDashboard.test.ts tests/cloudfunctions/adminReservations.test.ts
git commit -m "feat(owner): adminDashboard/adminReservations 显式接 lotId + 归属校验（多车场）"
```

---

## Task 11: C2/C3 cloud.ts 封装 + resolveCurrentLotId

**Files:**
- Modify: `miniprogram/services/cloud.ts`
- Test: `tests/services/cloud.test.ts`

- [ ] **Step 1: AdminGetLotData 改 lots**

`cloud.ts`（151-154 行）：

```ts
export interface AdminGetLotData {
  role: 'driver' | 'lot_admin' | 'ops_admin'
  /** 车场主名下全部车场（1:N，2026-09-18）。空数组 = 未绑定 */
  lots: AdminLot[]
}
```

`fetchAdminLot` 的 JSDoc（157-162 行）更新为「返回名下全部车场」。

- [ ] **Step 2: data 函数加 lotId 参数**

`cloud.ts`（184-187 行）：

```ts
/** 车场端看板：统计 + 待核销列表（云函数 adminDashboard）。lotId 由调用方传入当前车场 */
export function fetchAdminDashboard(lotId: string): Promise<CloudResult<AdminDashboardData>> {
  return callFunction<AdminDashboardData>('adminDashboard', { lotId })
}
```

`cloud.ts`（272-275 行）：

```ts
/** 车场端预约核销列表（云函数 adminReservations）。lotId 由调用方传入当前车场 */
export function fetchAdminReservations(lotId: string): Promise<CloudResult<AdminReservationsData>> {
  return callFunction<AdminReservationsData>('adminReservations', { lotId })
}
```

- [ ] **Step 3: resolveCurrentLotId**

`cloud.ts` 顶部 import（`getCloudApi` 前）加：

```ts
import { getCurrentLotId, setCurrentLotId } from './storage'
```

文件尾部加：

```ts
export type ResolveCurrentLotResult =
  | { ok: true; lotId: string }
  | { ok: false; code: 'no_auth' | 'no_lot' | 'error' }

/**
 * 车场端解析当前管理的车场 id（1:N）：
 * 先信 storage（「车场我的」切换时写入）；storage 为空再拉 adminGetLot，
 * 默认取名下第一个并写回 storage。storage 里的车场若已解绑/删除，
 * 数据函数会返回 FORBIDDEN/NOT_FOUND，调用方清掉 storage 后重解析（见各页 refresh）
 */
export async function resolveCurrentLotId(): Promise<ResolveCurrentLotResult> {
  const stored = getCurrentLotId()
  if (stored) return { ok: true, lotId: stored }
  const r = await fetchAdminLot()
  if (!r.ok) return { ok: false, code: r.code === 'NO_AUTH' ? 'no_auth' : 'error' }
  if (!r.data.lots.length) return { ok: false, code: 'no_lot' }
  const first = r.data.lots[0]._id
  setCurrentLotId(first)
  return { ok: true, lotId: first }
}
```

- [ ] **Step 4: 补测试**

`tests/services/cloud.test.ts` 追加（复用现有 `stubCloud()`/`lastCall`/`respond` 手法，补 wx storage stub；import 行加 `resolveCurrentLotId`）：

```ts
import { resolveCurrentLotId } from '../../miniprogram/services/cloud'

describe('resolveCurrentLotId', () => {
  let store: Record<string, unknown>
  beforeEach(() => {
    stubCloud()
    lastCall = null
    store = {}
    const g = globalThis as unknown as {
      wx: { getStorageSync: (k: string) => unknown; setStorageSync: (k: string, v: unknown) => void }
    }
    g.wx = Object.assign(g.wx, {
      getStorageSync: (k: string) => store[k],
      setStorageSync: (k: string, v: unknown) => {
        store[k] = v
      },
    })
  })

  it('storage 有当前车场 → 直接用，不调云函数', async () => {
    store['qnt.currentLotId'] = 'lotA'
    respond = () => {
      throw new Error('不该调用云函数')
    }
    await expect(resolveCurrentLotId()).resolves.toEqual({ ok: true, lotId: 'lotA' })
  })

  it('storage 空 → 拉 adminGetLot 取首条并写回', async () => {
    respond = () => ({
      result: { code: 0, data: { role: 'lot_admin', lots: [{ _id: 'lotA' }, { _id: 'lotB' }] } },
    })
    await expect(resolveCurrentLotId()).resolves.toEqual({ ok: true, lotId: 'lotA' })
    expect(store['qnt.currentLotId']).toBe('lotA')
  })

  it('NO_AUTH → no_auth', async () => {
    respond = () => ({ result: { code: 'NO_AUTH', message: '非车场管理员' } })
    await expect(resolveCurrentLotId()).resolves.toEqual({ ok: false, code: 'no_auth' })
  })

  it('lots 空 → no_lot', async () => {
    respond = () => ({ result: { code: 0, data: { role: 'lot_admin', lots: [] } } })
    await expect(resolveCurrentLotId()).resolves.toEqual({ ok: false, code: 'no_lot' })
  })
})
```

- [ ] **Step 5: 跑测试**

Run: `npx jest tests/services/cloud.test.ts && npx tsc --noEmit`
Expected: 全过 + exit 0

- [ ] **Step 6: 提交**

```bash
git add miniprogram/services/cloud.ts tests/services/cloud.test.ts
git commit -m "feat(owner): cloud 封装加 lotId + resolveCurrentLotId（storage 优先）"
```

---

## Task 12: C3b owner dashboard / reservations / lot 三页接当前车场

**Files:**
- Modify: `miniprogram/pages/owner/dashboard/dashboard.ts`
- Modify: `miniprogram/pages/owner/reservations/reservations.ts`
- Modify: `miniprogram/pages/owner/lot/lot.ts`

- [ ] **Step 1: dashboard.ts**

import 行（1-4 行）改成：

```ts
import { formatAmount, formatTimeRangeLabel } from '../../../domain/format'
import { fetchAdminDashboard, reportAvailability, resolveCurrentLotId } from '../../../services/cloud'
import type { AdminDashboardData } from '../../../services/cloud'
import { clearRole, setCurrentLotId } from '../../../services/storage'
```

`refresh`（96-149 行）改成：

```ts
  async refresh(silent: boolean) {
    let cur = await resolveCurrentLotId()
    if (!cur.ok) {
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: cur.code === 'no_auth' ? 'no_role' : cur.code === 'no_lot' ? 'no_lot' : 'error' })
      return
    }
    let r = await fetchAdminDashboard(cur.lotId)
    if (r.code === 'FORBIDDEN' || r.code === 'NOT_FOUND') {
      // storage 里的车场被解绑/删除：清掉重解析再试一次
      setCurrentLotId('')
      cur = await resolveCurrentLotId()
      if (!cur.ok) {
        if (silent) return
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: cur.code === 'no_auth' ? 'no_role' : cur.code === 'no_lot' ? 'no_lot' : 'error' })
        return
      }
      r = await fetchAdminDashboard(cur.lotId)
    }
    if (!r.ok) {
      if (silent) return
      if (r.code === 'NO_AUTH') {
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.lot === null) {
      // 兜底：云端不该返回 null（lotId 缺失已 BAD_REQUEST），保留防御
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_lot' })
      return
    }
    const d: AdminDashboardData = r.data
    const lot = d.lot!
    const avail = lot.availability
    const spotsText =
      avail && typeof avail.freeSpots === 'number' && typeof avail.totalSpots === 'number'
        ? `${avail.freeSpots} / ${avail.totalSpots}`
        : '待上报'

    const cache: DashboardCache = {
      lotId: lot._id,
      lotName: lot.name,
      lotAddress: lot.address,
      stat: {
        todayReservations: String(d.todayReservations),
        pendingEntry: String(d.pendingEntry),
        todayIncome: formatAmount(d.todayIncome),
      },
      spotsText,
      pendingList: d.pendingList.map(x => ({
        id: x._id,
        plateText: String(x.plateNo || '--'),
        arriveText: formatTimeRangeLabel(new Date(), new Date(x.arriveTime)),
        verifyCode: String(x.verifyCode || '--'),
      })),
    }
    this.lastData = cache
    this.lastLoadedAt = Date.now()
    this.applyCache(cache)
  },
```

- [ ] **Step 2: reservations.ts**

import 行（1-5 行）改成：

```ts
import { formatPlate, formatTimeRangeLabel, platesMatch, RESERVATION_STATUS_LABELS } from '../../../domain/format'
import { fetchAdminReservations, recognizePlate, resolveCurrentLotId, verifyReservation } from '../../../services/cloud'
import type { AdminReservationItem, RecognizePlateData } from '../../../services/cloud'
import type { ReservationStatus } from '../../../domain/types'
import { clearRole, setCurrentLotId } from '../../../services/storage'
```

`refresh`（114-151 行）改成与 dashboard 同结构（resolve → fetchAdminReservations(lotId) → FORBIDDEN/NOT_FOUND 清 storage 重试一次 → NO_AUTH no_role → lot null no_lot 防御 → 组装 cache）。`r.data.lot._id` 处不再需要（lotId 已由调用传入），cache 仍记 `lotId: cur.lotId`（核销弹窗用 `this.lotId`）。

- [ ] **Step 3: owner/lot.ts**

import 行（1-3 行）改成：

```ts
import { fetchAdminLot, updateLot } from '../../../services/cloud'
import type { AdminLot } from '../../../services/cloud'
import { clearRole, getCurrentLotId, setCurrentLotId } from '../../../services/storage'
```

`refresh`（101-133 行）改成（单次 fetchAdminLot 拿到 lots 列表，再解析当前）：

```ts
  async refresh(silent: boolean) {
    const r = await fetchAdminLot()
    if (!r.ok) {
      if (silent) return
      if (r.code === 'NO_AUTH') {
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.role !== 'lot_admin') {
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_role' })
      return
    }
    const lots = r.data.lots
    if (!lots.length) {
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_lot' })
      return
    }
    // 1:N：按 storage 的当前车场取，storage 失效回退首条并写回
    const stored = getCurrentLotId()
    const lot = lots.find(l => l._id === stored) ?? lots[0]
    if (lot._id !== stored) setCurrentLotId(lot._id)
    const cache: LotCache = { lot, vm: toVM(lot) }
    this.lastData = cache
    this.lastLoadedAt = Date.now()
    this.applyCache(cache)
  },
```

`applyCache`（136-145 行）不变（`this.lot = c.lot` 已由 cache 提供）。`onConfirmEdit` 的 `updateLot(this.lot!._id, ...)`（231 行）不变 —— `this.lot` 已是当前解析的车场。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/owner/dashboard/dashboard.ts miniprogram/pages/owner/reservations/reservations.ts miniprogram/pages/owner/lot/lot.ts
git commit -m "refactor(owner): 三页经 resolveCurrentLotId 解析当前车场，数据函数传 lotId"
```

---

## Task 13: C4 owner profile 页切换车场卡

**Files:**
- Modify: `miniprogram/pages/owner/profile/profile.ts`
- Modify: `miniprogram/pages/owner/profile/profile.wxml`
- Modify: `miniprogram/pages/owner/profile/profile.wxss`

- [ ] **Step 1: ts 加车场列表 + 切换**

`profile.ts` import 行（1-2 行）改成：

```ts
import { fetchAdminLot } from '../../../services/cloud'
import { clearRole, getCurrentLotId, setCurrentLotId } from '../../../services/storage'
```

`ProfileCache` 接口加 `lotList: { id: string; name: string }[]`。

data 加：

```ts
    /** 名下全部车场（>1 才显示切换卡） */
    lotList: [] as { id: string; name: string }[],
    /** 当前选中的车场 id（高亮用） */
    currentLotId: '',
    /** 切换车场弹窗 */
    lotDialog: false,
```

`refresh`（54-78 行）改成：

```ts
  async refresh(silent: boolean) {
    const r = await fetchAdminLot()
    if (!r.ok) {
      if (silent) return
      if (r.code === 'NO_AUTH') {
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.role !== 'lot_admin') {
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_role' })
      return
    }
    const lots = r.data.lots
    const lotList = lots.map(l => ({ id: l._id, name: l.name }))
    // 1:N：当前车场 = storage 值，失效回退首条
    const stored = getCurrentLotId()
    const current = lots.find(l => l._id === stored) ?? lots[0] ?? null
    const lotName = current ? current.name : '尚未绑定车场'
    if (current && current._id !== stored) setCurrentLotId(current._id)
    this.lastData = { lotName, lotList }
    this.lastLoadedAt = Date.now()
    this.setData({ state: 'ready', lotName, lotList, currentLotId: current ? current._id : '' })
  },
```

`applyCache`（`lastData` 快照落 data，若有此函数）同步加 `lotList`/`currentLotId`。

加方法：

```ts
  /** 打开切换车场弹窗（名下多车场才显示入口） */
  onShowLots() {
    this.setData({ lotDialog: true })
  },

  onCloseLots() {
    this.setData({ lotDialog: false })
  },

  onPickLot(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    if (id === this.data.currentLotId) {
      this.setData({ lotDialog: false })
      return
    }
    setCurrentLotId(id)
    this.setData({ lotDialog: false, currentLotId: id })
    wx.showToast({ title: '已切换车场', icon: 'success' })
    // 其他车场页（看板/预约/车场）切 tab 时会经 resolveCurrentLotId 读到新值
  },
```

- [ ] **Step 2: wxml 加切换卡 + 弹窗**

`profile.wxml` 在「切换身份」卡前加：

```xml
      <view class="card" wx:if="{{lotList.length > 1}}" bindtap="onShowLots">
        <text>切换车场</text>
        <text class="card__arrow">›</text>
      </view>
```

`</block>` 前加弹窗（仿 owner/lot 的 mask/dialog 结构）：

```xml
    <view class="mask" wx:if="{{lotDialog}}" bindtap="onCloseLots">
      <view class="dialog" catchtap="noop">
        <view class="dialog__title">切换车场</view>
        <view
          wx:for="{{lotList}}"
          wx:key="id"
          class="lot-opt {{item.id === currentLotId ? 'lot-opt--on' : ''}}"
          data-id="{{item.id}}"
          bindtap="onPickLot"
        >
          <text>{{item.name}}</text>
          <text class="lot-opt__mark" wx:if="{{item.id === currentLotId}}">✓</text>
        </view>
        <view class="dialog__btns">
          <view class="dialog__btn" bindtap="onCloseLots">取消</view>
        </view>
      </view>
    </view>
```

需要 `noop() {}` 方法（ts 加，或复用现有 —— 若无则补）。

- [ ] **Step 3: wxss 弹窗样式**

`profile.wxss` 尾部追加（对齐 owner/lot.wxss 的 mask/dialog 命名）：

```css
.mask {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 2;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog {
  width: 600rpx;
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: var(--space-4);
}

.dialog__title {
  font-size: var(--font-card-title);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-3);
}

.lot-opt {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22rpx 0;
  border-bottom: 2rpx solid var(--color-border);
  font-size: var(--font-body);
  color: var(--color-text);
}

.lot-opt--on {
  color: var(--color-primary);
  font-weight: 600;
}

.lot-opt__mark {
  color: var(--color-primary);
}

.dialog__btns {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-3);
}

.dialog__btn {
  padding: 12rpx 32rpx;
  border-radius: var(--radius-pill);
  font-size: var(--font-sub);
  color: var(--color-text-weak);
}
```

若 owner/profile.wxml 的根 `.wrap` 是 `position: relative`（profile.wxss 有 `.wrap { position: relative }`），mask 的 absolute 可正常覆盖。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: 提交**

```bash
git add miniprogram/pages/owner/profile/profile.ts miniprogram/pages/owner/profile/profile.wxml miniprogram/pages/owner/profile/profile.wxss
git commit -m "feat(owner/profile): 车场主切换车场（名下多车场弹窗选择，写本地 storage）"
```

---

## Task 14: E 移除 spike-map 遗留页

**Files:**
- Modify: `miniprogram/app.json`
- Delete: `miniprogram/pages/spike-map/`

- [ ] **Step 1: app.json 移除注册**

`app.json` pages 数组（2-15 行）删掉 `"pages/spike-map/spike-map",` 行。

- [ ] **Step 2: 删目录**

```bash
rm -rf miniprogram/pages/spike-map
```

- [ ] **Step 3: 验证无残留引用**

Run: `grep -rn "spike-map" miniprogram/ | grep -v node_modules`
Expected: 无输出

- [ ] **Step 4: 提交**

```bash
git add -A miniprogram/app.json miniprogram/pages/spike-map
git commit -m "chore: 移除 spike-map 拖拽验证遗留页"
```

---

## Task 15: 全量回归 + 真机清单

- [ ] **Step 1: 全量单测**

Run: `npm test`
Expected: 全绿（基线 402/30 套件 + 新增用例）

- [ ] **Step 2: 类型**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: 推送**

```bash
git push origin main
```

- [ ] **Step 4: 真机验收清单（用户在场）**

1. A1：confirm/search/bind-lot 返回键命中区明显变大，顶栏布局不挤
2. A2：orders 详情打开后顶栏有 `‹ 返回`，点按回列表
3. A3：地图点气泡（价格·距离）选中该车场 + 卡片滚入视野；label 位置未漂移（漂移则走 Task 3 回退方案）
4. B2/B3：我的页添加/删除车辆；confirm 页点 chips 填入车牌、手输仍可用、下单后新车牌进车辆列表
5. C4：车场主绑两个车场（或已有多个）→ 「车场我的」出现切换车场，切换后看板/预约/车场页数据跟着变
6. D1/D2：owner/lot 改价输入 999 被拒；云端接口被绕过时（如直接调 adminUpdateLot）同样拒
7. 回归：首页/搜索/预约全链路、车场端核销、车主端订单

---

## 自审对照（spec → task）

- A1 返回键触摸区 → Task 1
- A2 orders 详情返回键 → Task 2
- A3 图钉/气泡命中区 → Task 3（含真机回退）
- B1 storage 车辆/当前车场 → Task 6
- B2 profile 车辆卡 → Task 7
- B3 confirm chips → Task 8
- C1 adminGetLot lots 列表 → Task 9
- C1b adminDashboard/adminReservations lotId → Task 10
- C2/C3 cloud 封装 + resolve → Task 11
- C3b 三页接线 → Task 12
- C4 owner profile 切换 → Task 13
- D1 客户端上限 → Task 4
- D2 云端上限 → Task 5
- E spike-map 移除 → Task 14
- 测试/真机收尾 → Task 15
