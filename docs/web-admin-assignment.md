# Web 平台运营后台 —— 开发任务书

> 给负责 Web 端的组员。这是独立客户端，与本仓库的小程序**共用同一套云函数与数据库**。
> 开发前先读：`docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`（数据模型 §4 / §5.6 / §10 / §11）、`README.md`。
> 有任何字段名或口径对不上的，以数据模型文档和云函数实际写入为准，不要自己发明。

---

## 1. 背景与目标

本项目已有微信小程序（车主端 + 车场端），跑在微信云开发上。预约、订单、支付（模拟）、取消退款已闭环。

**这个 Web 端是「平台运营后台」**：给平台运营方用，管理签约车场、公示价、订单流水、车牌识别复核。它补上的缺口是：签约车场库与公示价总得有地方录，在云开发控制台手敲不可持续。

**课程题目里的网页端要求**（来源：《智慧停车场管理系统的设计与实现》课题）：
1. 登录页面：管理员登录
2. 车场信息管理：添加、管理、查询车场信息
3. 车辆信息管理：查询车主的停车信息
4. 车牌识别：识别车牌（腾讯云 OCR）
5. 打印管理：打印车主相关信息（固定车主 / 临时车主）

本任务书把课程要求的 5 项落到本项目的真实数据模型上。

## 2. 技术栈（已定，不要换）

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | Vue 3 + Vite + TypeScript | 表格、表单、批量编辑是主场景 |
| UI 组件 | Element Plus | 后台表格表单的标准选择 |
| 数据访问 | `@cloudbase/js-sdk` | 复用云函数与云数据库，免服务器 |
| 部署 | 云开发**静态网站托管** | 免服务器；默认域名免备案（腾讯自有域名），挂自己域名才需备案 |
| 登录 | 云开发自定义登录（见 §4） | 小程序身份是 `_openid`，Web 端没有微信身份 |

仓库根目录建 `web-admin/` 目录，独立 package。

## 3. 数据库集合（Web 端会读写的）

云环境里已有 11 个集合，Web 端主要碰这几个：

- **`users`**：用户。`_id` == `_openid`（车主）。运营/车场管理员**额外带** `webAccount: { username, passwordHash, salt }` 与 `role: 'ops_admin' | 'lot_admin'`。
- **`lots`**（签约车场库，看 `cloudfunctions/seedLots/seed-data.js` 的真实形状）：`name` / `address` / `location {lat, lng}` / `pricing { firstHour, perHourAfter, stepMinutes, capPerDay, nightRate, source }` / `availability { totalSpots, source }`（**`freeSpots` 不在库里种**，只由车场端上报）/ `reservableQuota` / `facilities[]` / `reservedCount` / `note`。`openHours` 尚未实现，界面别用。
  - **来源字段**：`pricing.source` 与 `availability.source` 只能取 `'public'` / `'ops'` / `'placeholder'`。`placeholder` = 演示暂定值（合肥 4 家现状全是它），界面必须标「示例数据，待核实」；**谁都不许把 placeholder 改写或显示成已核实**（课程红线：不许把模拟数据当真实数据）。核到真公示价后把真值填进、`source` 改 `'public'` / `'ops'`，`note` 写清来源。
- **`reservations`**（预约单）：`userId`（车主 openid）/ `lotId` / `lotName` / `plateNo` / `arriveTime`（epoch 毫秒）/ `enterDeadline` / `status`（`pending_entry` | `entered` | `completed` | `cancelled` | `released`）/ `verifyCode`（6 位数字）/ `prepaidParkingFee` / `serviceFee` / `totalAmount` / `createdAt` / `cancelledAt` / `refundTotal` 等。
- **`orders`**（流水）：预约时写两条（`type: 'prepaid'` / `type: 'service'`），退款写一条（`type: 'refund'`、`amount` 为负）。`orderNo` / `reservationId` / `amount` / `status` / `createdAt`。
- **`payments`**（模拟支付）：`channel: 'mock'`、`status: 'paid'`。界面必须标「模拟支付」。
- **`entry_logs`**（核销留痕）：`lotId` / `reservationId` / `plateNo` / `method`（`ocr` | `code` | `manual`）/ `confidence` / `imageFileID` / `createdAt`。一次核销可能先识别失败再输码成功，留痕要能看见整条尝试链。
- **`lot_price_changes`**（收费变更留痕）：改价时写一条，含公示价照片存证。
- **`availability_samples`**（余位历史）：`lotId` / `sampledAt` / `freeSpots` / `totalSpots` / `occupancyRate` / `source`。

时间戳一律 **epoch 毫秒**，不要写 ISO 字符串（与云函数写入对齐）。

## 4. 登录（Web 端最容易做错的地方）

**不能复用小程序那套**。现有云函数 `login` 走微信 `_openid`，Web 端没有微信身份。

方案（数据模型 §11 已定）：
- 运营/车场管理员的 `users` 文档带 `webAccount { username, passwordHash, salt }`。**同一人在小程序与 Web 是同一个文档**（`_id` == `_openid` 那条），不是两套账号。
- 口令**绝不明文**：`passwordHash` + 每用户独立 `salt`，用 Node 内置 `crypto.scrypt`（云函数跑在 Node，不引第三方依赖）。
- 登录形态：**以腾讯云官方文档为准**，两种候选——云开发内置「用户名密码」账号体系，或自签票据的自定义登录。实现时先查官方文档定一种。**登录后拿到的登录态 / 身份标识，要在云函数里能对应回 `users._id`**。
- 需要新增一个 Web 登录相关云函数（建议 `webLogin`），**不要改现有的 `login`**（小程序在用）。
- 角色判定（`ops_admin` / `lot_admin`）：**写操作一律走云函数，角色在云函数入口判，不押在安全规则上**（安全规则的 Web 身份变量名官方文档可读性差，已核实不了）。安全规则只管「读」。

## 5. 云函数（现状 + 要新增）

**现有（别动，小程序在用）**：`login`、`seedLots`、`initDb`、`createReservation`、`cancelReservation`。

**Web 端要新增**（每个都是独立云函数目录，`index.js` + `package.json`）：

| 云函数 | 职责 | 关键点 |
|---|---|---|
| `webLogin` | Web 登录，验证 `webAccount`，发登录态 | scrypt 比对；角色从 `users.role` 读；不认识的角色当 `driver` 拒绝 |
| `adminCreateUser` | 创建运营/车场管理员账号 | 生成 salt + scrypt 哈希；钉 `webAccount` 与 `role` |
| `adminListLots` / `adminUpsertLot` / `adminDeleteLot` | 车场信息管理 | 坐标从腾讯 POI 带出，不手敲；`reservedCount` 不准手改 |
| `adminPriceChange` | 收费录入 + 改价 | 写 `lot_price_changes` 留痕（含公示价照片 fileID） |
| `adminLookup` | 车辆信息 / 订单流水查询 | 按 `plateNo` / `orderNo` / `status` 过滤；组合 `reservations` + `orders` |
| `adminVerifyPlate` | 车牌识别复核 | 接腾讯云 OCR `LicensePlateOCR`；**密钥放云函数环境变量，绝不放前端**；命中 → 改 `entered` + 写 `entry_logs`（含 confidence + 原图 fileID） |
| `adminStats` | 运营看板 | 签约数 / 预约数 / 核销数 / 余位上报及时率 |

通用约束（与小程序同一原则）：
- 云函数不能 `require('../shared/...')` 跨目录 —— 每目录自带所需代码，或复制一份。
- 写操作入口先判角色，`OPENID` 取不到或角色不对直接拒绝。
- 字段名、状态机、时间戳口径与数据模型文档一字不差。

## 6. 前端页面清单

按课程 5 项需求映射到 5 个页面：

| 页面 | 课程对应 | 内容 |
|---|---|---|
| 登录 | 1. 登录 | 用户名 + 密码；登录态持久化（本地存储）；角色不对提示无权限 |
| 车场管理 | 2. 车场信息管理 | 车场列表（搜索/分页）→ 新增 / 编辑 / 停用。含名称、地址、坐标（POI 带出）、收费规则、营业时间、额度、来源标注 |
| 订单流水 | 3. 车辆信息管理 | 按车牌 / 单号 / 状态查预约单与流水；看金额三笔（预支/服务费/退款）与状态标签 |
| 车牌识别 | 4. 车牌识别 | 上传停车照片 → 调 `adminVerifyPlate` → 识别结果 + 匹配到的预约单；识别失败可转手动输码核销 |
| 打印 | 5. 打印管理 | 预约凭证 / 订单流水 打印（浏览器 print 或导出可打印页）。固定车主 = 有绑定车牌的用户，临时车主 = 单次预约 |

加分（有时间再做）：运营看板页（`adminStats`）、公示价照片展示。

## 7. 实施步骤（建议顺序）

> 每步完成的标准：**页面能真实跑通**（不造数），不只是编译过。写操作必须走云函数。

1. **脚手架 + 部署链路**：`web-admin/` 下搭 Vue3 + Vite + Element Plus；开通云开发静态网站托管；`@cloudbase/js-sdk` 初始化（环境 ID 问组长要，在 `config` 里）。
2. **登录**：建 `webLogin` + `adminCreateUser` 云函数；本地验证 scrypt 哈希与登录态；登录页 + 路由守卫。**先确认官方文档里登录形态哪种可行**，再动手。
3. **车场管理**：`adminListLots` / `adminUpsertLot` / `adminDeleteLot`；列表页 + 表单页。来源字段（`public` / `ops` / `placeholder`）在表单里必须可见可编辑，且展示时如实标注。
4. **订单流水**：`adminLookup`；按车牌/单号/状态查询页。
5. **车牌识别**：`adminVerifyPlate` 云函数接 OCR（密钥入环境变量）；上传 → 识别 → 匹配 → 核销；失败降级手动输码。
6. **打印**：凭证/流水打印页。
7. **收尾**：`tsc`/构建过、走查页面、README 补 Web 端使用说明。

## 8. 验收标准

- 登录：运营账号能登录，错误口令被拒，角色不对无权限。
- 车场管理：能新增一家真实签约车场（数据进 `lots`，来源标注正确），能改价且 `lot_price_changes` 有留痕。
- 订单流水：能按车牌查到真实预约单，金额与状态正确。
- 车牌识别：上传带车牌照片能识别，命中预约单能核销并留痕 `entry_logs`；密钥不出现前端。
- 打印：能打印一张真实凭证。
- 所有写操作经云函数，前端不含任何 DB 直写。

## 9. 边界（本轮不做）

- **车场端（余位上报 / 核销 / 看板）在小程序做，不在 Web**。Web 只做平台侧配置与查询。
- 不做：真实支付（保持「模拟支付」标注）、道闸硬件、自动扣费。
- 车牌识别 OCR 若时间紧，**保住「手动输码核销」这一级**，OCR 是增强不是单点依赖。

---

（本任务书由组长 2026-09-16 编写，依据数据模型文档 §11 与课程课题网页端要求。）
