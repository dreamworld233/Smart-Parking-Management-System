# Plan 2b：车主预约闭环（第一阶段）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking。

**Goal:** 把付费层核心闭环跑通：车场详情 → 预约确认（选到达时刻 + 输车牌 + 费用试算）→ 模拟支付 → 落单 → 我的订单（列表 / 详情 / 核销码 / 取消退款）。**不含**定时任务、车场端核销、车牌识别、Web 后台（各自下一轮）。

**用户 2026-09-15 拍板：**
- 模拟支付**在确认页内直接付**（弹模拟支付成功，不加收银台页 —— 费用试算并入确认页的既定决定延续）
- 车牌**确认页直接输入 + 记住最近一次**（不做车辆管理页，`cars` 集合本轮不建交互）
- **先车主闭环**，定时任务（超时释放 / 每日对账）下一轮

**上游依据：**
- `docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`：§4 的 `reservations` / `orders` / `payments` / `violations`；§5.1 CAS 额度；§5.2 状态机（**把 `violated` 从状态里去掉**）；§5.8 支付与退款
- `miniprogram/domain/pricing.ts`（已单测）：`PLATFORM_SERVICE_FEE`、`prepaidParkingFee`、`quoteReservation`、`cancelRefund`（含 `isBreach`）—— **领域层计价/退款已就位，本轮主要是云函数与页面**
- 需求基线：`ceil(预约时长) × 首小时单价 + ¥2`，10 分钟内取消全额退、之后退锁位费不退服务费，退款为 0 ≠ 违约（用 `isBreach` 判定）

---

## 执行进度（2026-09-15，计划初稿）

| Task | 状态 | 提交 |
|---|---|---|
| Task 0 前置核对与地基 | — | — |
| Task 1 createReservation 云函数 | — | — |
| Task 2 预约确认页 | — | — |
| Task 3 cancelReservation 云函数 | — | — |
| Task 4 我的订单页 | — | — |
| Task 5 接线 + 真机验收 | — | — |

---

## 关键口径（先验算过，写代码时照此）

1. **`lots` 额度字段**：2a 种子里是扁平 `reservableQuota`（数量上限），没有「已预约数」。**本轮给 `lots` 加 `reservedCount`（默认 0）**，CAS 用它和 `reservableQuota` 比。`seedLots` 的 upsert 加写 `reservedCount: 0`（幂等，重跑覆盖即可），**已部署的旧种子重跑一次就带上**。
2. **云函数不能 import 小程序的 TS 领域层**（`wx-server-sdk` 的 CommonJS 环境）：计费/退款公式在 `cloudfunctions/shared/pricing.js` 用 CommonJS **重写一份**，createReservation 与 cancelReservation 共用。**两处实现必须同口径** —— `miniprogram/domain/pricing.ts` 的单测是真值，JS 侧照抄并在文件头互相引用，改一边必须改另一边。
3. **CAS 抢额度**（spec §5.1，官方 `_.inc()` 原子 + `stats.updated` 判定）：
   ```
   where({ _id: lotId, reservedCount: _.lt(reservableQuota) }).update({ data: { reservedCount: _.inc(1) } })
   → stats.updated === 1 抢到，0 已满
   ```
   `updated === 0` 无法区分「没匹配到」与「匹配到了值没变」，但 `_.inc(1)` 必然改变值，本场景无歧义 —— 注释写明。CAS 成功后再写单，写单失败回补 `_.inc(-1)`。
4. **verifyCode**：6 位数字（核销用）。`orderNo`：`'PK' + 时间戳 + 随机 3 位`。
5. **身份**：云函数内 `cloud.getWXContext().OPENID`，`userId` 存 openid（Task 4 的教训，安全规则 `doc.userId == auth.openid`）。
6. **前端只读自己的预约**：`reservations` / `orders` 前端直读 `where({ userId: OPENID })`，写一律走云函数（安全规则已按 Task 1 口径配好）。
7. **状态机**：`domain/types.ts` 的 `ReservationStatus` **去掉 `'violated'`**（spec §5.2：车位侧结果用 `released`，用户侧后果进 `violations`）。相关类型与测试一起改。
8. **到达时刻窗口** `[现在, 现在+2h]`，入场截止 = 到达 + 15 分钟（`config.ts` 已有相关常量则复用，没有就加）。锁位时长 = `ceil(到达 − 现在)`，恒为 1–2 小时。
9. **退款公式**（云函数 JS 照抄 pricing.ts）：`max(0, (预约时长 − 已占用时长)) × 首小时单价`；下单 ≤10 分钟全额退（含服务费），否则退锁位费、服务费不退；`cancelAt >= arriveAt` → `isBreach`（写 `violations` `'late_cancel'` + `users.credit.violationCount` 自增）。

---

## 文件结构总览

| 文件 | 动作 | 职责 |
|---|---|---|
| `cloudfunctions/shared/pricing.js` | 建 | 计费/退款公式的 CommonJS 版（与 TS 侧同口径） |
| `cloudfunctions/createReservation/index.js` + `package.json` | 建 | CAS 抢额度 + 建 reservations/orders×2/payments(模拟) |
| `cloudfunctions/cancelReservation/index.js` + `package.json` | 建 | 退款 + orders(refund) + 回补额度 + 违约落 violations |
| `cloudfunctions/seedLots/index.js` | 改 | upsert 加 `reservedCount: 0` |
| `miniprogram/domain/types.ts` | 改 | 去掉 `'violated'`；Reservation 补 verifyCode/退款字段/时间戳 |
| `miniprogram/domain/pricing.ts` | 不动 | 试算与退款的真值，已有单测 |
| `miniprogram/services/cloud.ts` | 改 | 加 `createReservation` / `cancelReservation` 封装（或页面直调 callFunction） |
| `miniprogram/services/storage.ts` | 复用 | `getDefaultPlate` / `setDefaultPlate`（已存在，不新建） |
| `miniprogram/config.ts` | 改 | 到达窗口 / 入场缓冲 / 时刻步长常量 |
| `miniprogram/pages/confirm/*` | 建 | 预约确认页（到达时刻 + 车牌 + 试算 + 模拟支付） |
| `miniprogram/pages/orders/*` | 改 | 占位 → 我的订单（列表 / 详情 / 核销码 / 取消） |
| `miniprogram/components/lot-detail/*`、`pages/home|search` | 改 | 详情「预约车位」→ `navigateTo` confirm（带 lotId） |
| `tests/*` | 改/增 | 类型去 violated、云函数 JS 口径与 TS 侧对齐的离线段、storage 车牌 |

---

### Task 0: 前置核对（2026-09-15 已完成）

- ✅ `services/cloud.ts`：`callFunction<T>` + `CloudResult<T>` + `ensureLogin()` 就绪，create/cancel 封装直接薄套 `callFunction`
- ✅ `services/storage.ts`：**已有 `getDefaultPlate` / `setDefaultPlate`**（车牌记住功能早存在，直接复用，不新建 API）—— 文件结构总览里的 storage 行改为「复用」
- ✅ `app.ts`：`onLaunch` 已调 `ensureLogin` 建档（身份地基在）
- ✅ `app.json`：`pages/orders/orders` 已注册（占位页在）；`pages/confirm` 需新增注册
- ⚠️ `config.ts`：**没有**到达窗口/入场缓冲/时刻步长常量 —— Task 2 加 `ARRIVE_WINDOW_MIN`(120)、`ENTRY_GRACE_MINUTES`(15)、`ARRIVE_STEP_MIN`(15)
- ⚠️ **安全规则待用户控制台核对**：`reservations` / `orders` 是否已有 `doc.userId == auth.openid` 只读（Task 1 配的 11 条，需确认含这两张）
- ✅ `npm test` 基线 225 全绿

### Task 1: createReservation 云函数

`cloudfunctions/shared/pricing.js` + `cloudfunctions/createReservation/index.js`：

```js
// shared/pricing.js —— 与 miniprogram/domain/pricing.ts 同口径，改一边必须改另一边
const HOUR_MS = 3600 * 1000
function ceilHours(diffMs) { return Math.ceil(diffMs / HOUR_MS) }
function prepaidParkingFee(now, arrive, firstHourRate) { return ceilHours(arrive - now) * firstHourRate }
function quoteReservation(now, arrive, firstHourRate) {
  const prepaid = prepaidParkingFee(now, arrive, firstHourRate)
  return { prepaidParkingFee: prepaid, serviceFee: 2, totalAmount: prepaid + 2 }
}
// cancelRefund：见 miniprogram/domain/pricing.ts 的注释与单测，逐行照抄
function cancelRefund(orderAt, arrive, cancelAt, firstHourRate) { /* ... */ }
module.exports = { HOUR_MS, ceilHours, prepaidParkingFee, quoteReservation, cancelRefund }
```

主函数：
- 取 `OPENID`；校验 `lotId` / `arriveAt`（在 `[now, now+2h]`）/ `plateNo`（车牌正则）
- 读 `lots` 文档：签约、`pricing.firstHour` 为数字、`reservableQuota` 为数字
- CAS 抢额度（见上「关键口径 3」）；`updated === 0` → `{code: 'LOT_FULL', message: '可预约车位已满'}`
- 生成 `orderNo` / `verifyCode`；写 `reservations`（status `pending_entry`，enterDeadline = arrive + 15min，prepaid/service/total，`createdAt`）→ 失败回补额度
- 写 `orders` 两条（prepaid / service，status `paid`）→ 失败回补
- 写 `payments` 一条（channel `'mock'`，status `'paid'`，tradeNo 模拟）——**界面必须标「模拟支付」**
- 返回 `{code:0, data:{ reservationId, orderNo, verifyCode, totalAmount, ... }}`
- 测试：离线段测 CAS（updated 0/1 分支）、arriveAt 越界拒绝、车牌非法拒绝、写单失败回补

### Task 2: 预约确认页

`miniprogram/pages/confirm/*`：
- 入参 `lotId`；`onLoad` 读 `lots` 文档取名称/地址/价格/额度
- 到达时刻：步长 15 分钟的 chips 或 picker，范围 `[now, now+2h]`；默认选中最近整 15 分钟档
- 车牌输入（实时格式校验），读 `storage.getLastPlate()` 预填
- 费用试算随到达时刻联动：`quoteReservation`（TS 侧）→ 锁位费 / 服务费 ¥2 / 合计；入场截止时间提示
- 「确认支付 ¥X」→ 弹确认（注明**模拟支付**）→ 调 `createReservation` 云函数 → 成功：存车牌 + 弹「支付成功（模拟）」→ 跳订单详情；`LOT_FULL` / 错误 → 对应提示

### Task 3: cancelReservation 云函数

- 入参 `reservationId`；校验 `userId === OPENID`、status 为 `pending_entry`
- 用 `shared/pricing.js` 的 `cancelRefund(orderAt, arriveAt, now, firstHourRate)` 算退款与 `isBreach`
- 更新 reservation：status `cancelled`、`cancelledAt`、退款字段（refundParking/refundService/refundTotal）
- 写 `orders` 一条 `type:'refund'`（amount 为负）—— 退款不新开 payments（模拟，不回流）
- 回补额度 `reservedCount: _.inc(-1)`
- `isBreach` → 写 `violations`（`late_cancel`）+ `users.credit.violationCount` 自增
- 返回退款明细
- 测试：≤10min 全额 / >10min 退锁位 / 退款 0 但非违约（用 isBreach） / 取消晚于到达 → 违约

### Task 4: 我的订单页

`miniprogram/pages/orders/*`（替换占位）：
- 列表：`reservations.where({userId: OPENID}).orderBy('createdAt','desc')`，状态标签（待入场/已入场/已完成/已取消/已释放）
- 详情：金额三笔 + 到达/截止时间 + **核销码**（放大展示）+ 状态；`pending_entry` 时显示「取消预约」按钮
- 取消 → 确认 → `cancelReservation` → 刷新
- 空态文案

### Task 5: 接线 + 真机验收

- `lot-detail` 的「预约车位」按钮 → `navigateTo('/pages/confirm?lotId=...')`（未签约车场无此按钮，已实现）
- `app.json` 注册 `pages/confirm`
- `types.ts` 去 `'violated'` + 相关测试
- `seedLots` 加 `reservedCount: 0` + 重新部署执行（云端 `lots` 每家有 0）
- 部署 createReservation / cancelReservation → 云端测试 → 控制台核对
- `npx tsc --noEmit && npm test` 全绿
- **真机验收 checklist**（用户操作）：详情点预约 → 确认页选时刻/输车牌/看试算 → 模拟支付 → 订单详情有核销码 → 我的订单列表出现 → 取消 → 退款金额 + 额度回补（控制台核对 `reservedCount` 回落）

---

## 已知未完成（本轮之后）

- 定时任务：超时释放（released + violations no_show + credit）、余位采样、每日对账 —— 下一轮
- 车场端：余位上报、核销（扫/输码 → entry_logs）、预约看板、对账 —— 下一轮
- 车牌识别（OCR）、Web 运营后台
- `reservedCount` 的「额度来源」标注问题仍挂着（2a 已知未完成：`reservableQuota` 无来源字段）
- `review` / `ratingSummary` 真数据接入
