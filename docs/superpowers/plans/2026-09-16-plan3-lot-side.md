# Plan 3：车场端（余位上报 + 核销 + 车场配置）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking。

**Goal:** 把车场端 4 tab 从占位页变成可用：看板（余位上报 + 今日预约 + 额度）+ 预约核销（输码/手动 → `entry_logs` 留痕）+ 车场配置（信息/收费/额度，改价留痕 `lot_price_changes`）+ 我的（身份与切换）。**不含**车牌识别 OCR（Plan 4）、定时任务（超时释放/余位采样/对账）、Web 后台（组员做）。

**用户 2026-09-16 拍板：**
- **角色统一 `lot_admin`**（storage / custom-tab-bar / role-select 从 `'owner'` 改，login 出口加角色白名单，见 backlog #2）
- 车场管理员账号**本轮手动标**：控制台把某 `users` 文档 `role` 改 `'lot_admin'`，`lots.adminUserId` 指向其 openid
- 核销做**输码 + 手动**两级，**OCR 留 Plan 4**（数据模型 §10：扫/输码必须实现，OCR 是增强）
- **车场主管自己车场的一切日常**：信息 / 收费 / 可预约额度，改价落 `lot_price_changes` 留痕；**Web 端只在特殊情况兜底**（推翻数据模型 §11 旧分界「Web 管签约与价格」——那是写给「平台运营 vs 车场管理员」的旧分工，用户明确车场主应能自助）
- 看板额度条：展示 + **车场端可调**（改 `reservableQuota`），不另设入口页

**上游依据：**
- `docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`：§4 的 `lots` / `reservations` / `orders` / `entry_logs` / `lot_price_changes` / `availability_samples`；§5.6 权限；§10 核销三级降级链
- `docs/superpowers/specs/2026-09-11-smart-parking-miniprogram-ui-design.md`：§3.2 车场端 4 tab、§5.7 看板设计
- `docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md` §10：匹配命中 `(lotId, plateNo, status==='pending_entry')` → `entered` + `entry_logs`（`method` / `confidence` / `imageFileID`）
- 预约闭环已就位（Plan 2b）：`createReservation` / `cancelReservation` 云函数在跑，`reservations` 状态机 `pending_entry → entered → completed`，`cancelled` / `released`

---

## 执行进度（2026-09-16）

| Task | 状态 | 提交 |
|---|---|---|
| Task 0 角色统一 lot_admin | ✅ | 8a3ee0d |
| Task 1 车场端登录与身份 | ✅ | 8924657 |
| Task 2 看板页 | ✅ | 368a779 |
| Task 3 余位上报 | ✅（云函数提前做） | f4ad6fd |
| Task 4 核销（输码+手动） | ✅ | 652ff01 |
| Task 5 车场配置页 | ✅ | cb7a171 |
| Task 6 我的页 | ✅ | 9584feb |
| Task 7 部署 + 真机验收 | ⏳ 待用户 | — |

**规格执行偏差**：Task 3 / Task 5 的云函数（reportAvailability / adminUpdateLot）在 Task 2 前提前实现，让看板一次铺全；Task 4 实际新增两个云函数（verifyReservation + adminReservations，后者因安全规则缺口走云函数而非前端直读）；Task 2 看板统计走 adminDashboard 云函数（同一原因）。**新云函数共 6 个**：adminGetLot / adminDashboard / reportAvailability / verifyReservation / adminReservations / adminUpdateLot。

---

## 关键口径（先验算过，写代码时照此）

1. **角色命名**：全仓统一 `'lot_admin'`。改三处：`services/storage.ts` 的 `Role` 联合（`'owner'` → `'lot_admin'`）与 `getRole` 校验、`custom-tab-bar/index.ts` 的 `TABS` key、`pages/role-select/role-select.ts` 的 `HOME`。**旧 storage 里已存的 `'owner'` 会被 `getRole` 挡成 null**（白名单外 → null → 回角色选择页），这正是想要的：角色页重新选 `lot_admin`。`login` 云函数出口加**角色白名单**：`u.role` 不是 `'driver' | 'lot_admin' | 'ops_admin'` 时落 `'driver'`（backlog #2），**不许把 DB 值当类型用**。
2. **车场端身份**：`login` 已返回 `role` 与 `userId`（openid）。车场端页面判定 `role !== 'lot_admin'` → 引导切角色（`role-select`），不静默白屏。**`lot_admin` 关联车场**：按 `OPENID` 查 `lots.where({ adminUserId: OPENID })`，本轮**一个管理员一个车场**（`limit(1)`），多个返回第一条 + 提示。没有关联车场 → 看板/预约/车场三页给「尚未绑定车场」空态（`state-view`）。
3. **写操作一律走云函数**：车场端改 `lots`（余位/收费/额度/信息）、核销、上报，全走新云函数。安全规则只管读。车场端直接读自己车场：`lots` 前端直读 `where({ adminUserId: OPENID })`（安全规则 `doc.adminUserId == auth.openid` 需配，或本轮统一走云函数 `adminGetLot` 免配规则——**先走云函数**，安全规则缺口少一个）。`reservations` 车场端读自己车场的单：`where({ lotId })`，`lotId` 来自绑定的车场。
4. **余位上报**：云函数 `reportAvailability`，入参 `{ lotId, freeSpots }`（`0 ≤ freeSpots ≤ totalSpots`，`totalSpots` 缺失时拒绝）。写 `lots.availability = { freeSpots, totalSpots, reportedAt: Date.now(), source: 'reported' }`（保留旧 `totalSpots`），**顺带落一条 `availability_samples`**（`{ lotId, sampledAt, freeSpots, totalSpots, occupancyRate, source: 'reported' }`）——数据模型 §4：上报时顺带落历史。`occupancyRate = totalSpots ? round(freeSpots / totalSpots * 100) : null`。返回 `{ code:0, data: { reportedAt, freeSpots, totalSpots } }`。
5. **核销**：云函数 `verifyReservation`，入参 `{ lotId, plateNo? | verifyCode? , method }`。
   - **输码核销**：`verifyCode` 是 6 位随机数（`createReservation` 用 `Math.random()*1000000`，**不保证全局唯一**）→ 必须带 `lotId` 双条件匹配，防跨场串单：`where({ _id, lotId, verifyCode, status: 'pending_entry' })`。用 `_id` 还是查回？**查回匹配**：先 `where({ lotId, verifyCode, status: 'pending_entry' }).limit(1).get()` 拿单，再 `doc(_id).update({ status: 'entered', enteredAt, entryMethod })`（与 cancelReservation 的「读后等值」同套路，防并发双击重复核销）。0 → `CODE_INVALID` 或 `ALREADY_PROCESSED`（已取消/已完成/已释放都算「不是待入场」）。
   - **手动核销**：`plateNo` 匹配，`where({ _id, plateNo, lotId, status: 'pending_entry' })` 同上。0 → `NO_MATCH`（该车牌无待入场单）。
   - 校验 `OPENID` 是 `lots.adminUserId`（不是管理员 → `NO_AUTH`）。写 `entry_logs`（`{ lotId, reservationId, plateNo, method, confidence: null, imageFileID: null, createdAt }`）。**只做入场，不做出场**（数据模型 §10）。
   - 已过 `enterDeadline` 的预约：数据模型说走 BR-01 释放，**本轮不实现超时释放定时任务**——核销时若 `now > enterDeadline` 仍可核销（人工放行场景），释放逻辑留给定时任务（已知未完成）。**规格里写明这个缺口**。
6. **车场配置**：云函数 `adminUpdateLot`，入参 `{ lotId, patch }`，`patch` 白名单字段：`pricing.firstHour / perHourAfter / stepMinutes / capPerDay / nightRate`、`reservableQuota`、`openHours`、`facilities`、`name`、`address`（信息编辑）。校验角色 + `adminUserId`。
   - **改价落留痕**：patch 含任一 pricing 字段时，写 `lot_price_changes` 一条（`{ lotId, old, new, changedBy: OPENID, changedAt, note }`）——`old` 读当前值，`new` 是新值，逐字段记（只记变更的）。
   - `reservableQuota` 改动**不落** `lot_price_changes`（那是价格留痕，不是额度）。
   - 收费字段来源标注：改价后 `pricing.source` 保持原值（placeholder/ops/public），**界面编辑时展示当前 source**，车场主改的是值不是来源等级。
7. **核销码展示**：车场端核销页只**输入**，不生成。车主端订单详情已展示 6 位 `verifyCode`（Plan 2b Task 4）。
8. **看板数据**：`dashboard` 页读三块：
   - 今日预约：`reservations.where({ lotId, createdAt >= 今日0点 }).count()`
   - 待核销：`reservations.where({ lotId, status: 'pending_entry' }).count()`
   - 今日收入：`orders` 用 `paidAt`（createReservation 写 `paidAt`，**没有 `createdAt`**）。`orders.where({ lotId, paidAt >= 今日0点 }).get()` 取回前端求和（`type: 'prepaid' | 'service'` 相加，`refund` 是负值天然相抵——同集合流水聚合，口径见数据模型 §4）。**先取回前端求和**，云开发 `sum` 聚合 API 形状待官方文档核，不押。
   - 额度条：`lots` 的 `reservableQuota` / `reservedCount`，余 = `reservableQuota - reservedCount`，条上显示。**调整入口** → 弹窗改 `reservableQuota` → `adminUpdateLot`。
   - 余位上报卡：当前 `availability.freeSpots`（无则「待上报」）+ 上报按钮 → 弹窗输入 freeSpots → `reportAvailability`。
   - 三统计块用 `state-view` 骨架屏/空态兜底。
9. **测试**：云函数离线段沿用 `createReservation.test.ts` 的 mockStore 套路；`reportAvailability` 测边界（freeSpots 越界/负/totalSpots 缺失）、`verifyReservation` 测分支（code 命中/未命中/已处理/手动命中）、`adminUpdateLot` 测白名单（非白名单字段被拒/改价留痕）。`tsc` + jest 全绿。
10. **`violated` 不出现**：状态机已去（Plan 2b Task 5）。核销不产生 violated。

---

### Task 0: 角色统一 lot_admin

- `services/storage.ts`：`Role` 联合 `'driver' | 'lot_admin'`；`getRole` 校验同步
- `custom-tab-bar/index.ts`：`TABS` key `'owner'` → `'lot_admin'`
- `pages/role-select/role-select.ts`：`HOME` key 同步；`onEnter` 写 `setRole('lot_admin')`
- `cloudfunctions/login/index.js`：出口 role 白名单（见关键口径 1）
- 测试：`tests/` 里 `Role` / `getRole` 相关用例更新；login 白名单离线测试（云函数无测试宿主，白名单逻辑**抽纯函数**到可测处或注释标明人工验）
- 收工：`tsc` + jest 全绿；`npm run test:live` 或真机确认角色页能选车场端

### Task 1: 车场端登录与身份

- `services/cloud.ts`：`LoginResult.role` 已含 `'lot_admin'`（不需改）；加 `fetchAdminLot()`（`callFunction` 或前端直读）——**本轮走云函数 `adminGetLot`**：按 `OPENID` 查 `lots.where({ adminUserId })`，返回车场或 `null`
- 新云函数 `adminGetLot`：`{ code:0, data: lot | null }`；非 `lot_admin` → `NO_AUTH`
- 各 owner 页 `onShow` 判 `role !== 'lot_admin'` → `wx.reLaunch('/pages/role-select/role-select')`；`adminGetLot` 返回 null → 三页空态「尚未绑定车场」
- 收工：真机从角色页选车场端进看板，空态正确

### Task 2: 看板页

`pages/owner/dashboard/*`（替换占位）：
- 顶部车场名 + 日期
- 三统计块：今日预约 / 待核销 / 今日收入（口径见关键口径 8）
- 额度条：已预约 `reservedCount` / 可预约 `reservableQuota` / 剩余，带「调整」弹窗 → `adminUpdateLot`
- 余位上报卡：当前 `freeSpots`（或「待上报」）+ 上报弹窗 → `reportAvailability`
- 待核销列表：`reservations.where({ lotId, status:'pending_entry' }).orderBy('arriveTime','asc').limit(5)`，点击 → 跳预约页
- 数据加载失败 → `state-view` error + 重试
- 收工：真机看板三统计正确，额度/余位能改

### Task 3: 余位上报

- 新云函数 `reportAvailability`（口径见关键口径 4）
- `services/cloud.ts` 封装
- dashboard 上报弹窗接入
- 测试：mockStore 离线段，边界全覆盖
- 收工：`tsc` + jest；云端测试 `{written:1}`；控制台核对 `availability` + `availability_samples`

### Task 4: 核销（输码+手动）

`pages/owner/reservations/*`（替换占位）：
- 待核销列表：`reservations.where({ lotId, status:'pending_entry' })`，按 `arriveTime` asc，显示车牌/到达/核销码
- 点单 → 操作区：两个入口
  - 输码核销：输入 6 位码 → `verifyReservation({ lotId, verifyCode, method:'code' })`
  - 手动核销：确认车牌 → `verifyReservation({ lotId, plateNo, method:'manual' })`
- 成功后：状态变 `entered`，列表刷新，toast；失败按 code 提示（`CODE_INVALID` / `NO_MATCH` / `ALREADY_PROCESSED`）
- 已入场/已取消/已完成 tab 或筛选（简单版：全部列表 + 状态标签，切 tab 用 `state-view` 空态）
- 新云函数 `verifyReservation`（口径见关键口径 5）
- 测试：mockStore 离线段全分支
- 收工：`tsc` + jest；真机输码核销一张真实单 → 控制台核对 `entered` + `entry_logs`

### Task 5: 车场配置页

`pages/owner/lot/*`（替换占位，配置中心）：
- 车场信息卡：名称 / 地址 / 坐标（只读展示）——编辑入口 → 弹窗改 `name` / `address`
- 收费卡：首小时 / 后续 / 步长 / 单日封顶 / 夜间费率，每项可改 → `adminUpdateLot`（改价落 `lot_price_changes`）；显示当前 `pricing.source` 标注（placeholder 标「示例数据，待核实」）
- 额度卡：`reservableQuota` 调整（与看板额度条共用弹窗）
- 设施卡：`facilities` 编辑（标签数组，充电桩必须逐字 `'充电桩'`——`domain/scoring.ts` 靠它判电动车因子，写错静默丢分）
- 新云函数 `adminUpdateLot`（口径见关键口径 6）
- 测试：mockStore 离线段白名单 + 留痕
- 收工：`tsc` + jest；真机改价 → 控制台核对 `lots.pricing` + `lot_price_changes`

### Task 6: 我的页

`pages/owner/profile/*`（替换占位）：
- 当前身份（车场管理员）+ 车场名
- 「切换身份」→ `wx.reLaunch('/pages/role-select/role-select')`（与车主端「我的」同套路）
- 关于/版本占位
- 收工：真机切回车主端正常

### Task 7: 部署 + 真机验收

- 部署新云函数：`adminGetLot` / `reportAvailability` / `verifyReservation` / `adminUpdateLot`
- 手动标管理员：控制台把测试用户 `role` 改 `'lot_admin'`，`lots` 某家 `adminUserId` 指向其 openid
- 安全规则核对：`lots` 车场端读（本轮走云函数，缺规则不碍事）；`reservations`/`orders` 车场端读若前端直读需配 `lotId` 匹配——**本轮统一走云函数，不配**（记入已知未完成）
- 真机 checklist：选车场端 → 看板数据 → 余位上报 → 待核销列表 → 输码核销一张 → 手动核销一张 → 车场页改价 → 控制台核对 entry_logs / lot_price_changes / availability_samples → 我的切回车主端
- `npx tsc --noEmit && npm test` 全绿

---

## 已知未完成（本轮之后）

- **超时释放定时任务**：`released` + `violations no_show` + `users.credit.violationCount`——核销链路目前人工放行，过 `enterDeadline` 的单没有自动释放
- 车牌识别 OCR（`recognizePlate` 云函数 + 拍照上传压缩）——Plan 4
- 余位采样定时任务（`availability_samples` 目前只在车场端上报时落，无周期采样）
- 每日对账（按 `reservations` 重算 `reservedCount` 修漂移）
- 车场端安全规则：`lots`/`reservations`/`orders` 的车场端读权限未配（本轮走云函数规避）
- Web 后台（组员在做，`docs/web-admin-assignment.md`）：`adminListLots`/`adminUpsertLot`/`adminPriceChange`/`adminVerifyPlate`/`adminStats`——注意 `adminUpsertLot`/`adminPriceChange` 与本轮的 `adminUpdateLot` **职责重叠**，Web 端是平台兜底，权限上 `ops_admin` 可改任何车场，`lot_admin` 只能改自己（合并到一个云函数做角色分流，别建两套）
- `reservedCount` 的「额度来源」标注仍挂（2a 已知未完成）
