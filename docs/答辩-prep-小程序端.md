# 小程序端开发流程与核心代码梳理（答辩用）

> 覆盖「需求 → 架构 → 数据 → 开发 → 测试 → 部署」全流程。配套演示路径在文末。
> 所有路径相对仓库根。核心代码标注 `文件:行号`，答辩时可点开讲。

---

## 0. 项目一句话

微信小程序「公共停车场预约系统」：车主端找车位、预约锁位、模拟支付；车场端管理余位、核销入场、识别车牌；Web 端平台运营后台管签约车场与订单。前后端共用一套微信云开发（云函数 + 云数据库 + 云存储），Web 端独立 Vue 工程共用同一套云函数与库。

## 1. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 小程序端 | 微信小程序原生 + **TypeScript** | 非第三方框架，纯原生 |
| 渲染 | **Skyline 渲染引擎** + glass-easel 组件框架 | 真机性能；`app.json` 配置 `"renderer": "skyline"` |
| 后端 | 微信云开发（**云函数 / 云数据库 / 云存储**） | 免运维服务器 |
| Web 后台 | Vue 3 + Vite + Element Plus + `@cloudbase/js-sdk` | 共用云函数与库 |
| 地图/定位 | 腾讯位置服务（微信内置定位 + 腾讯 POI/逆地址） | `services/qqmap.ts` 封装 |
| 车牌识别 | 腾讯云 OCR `LicensePlateOCR` | 云函数内调用，密钥走环境变量 |
| 测试 | Jest + ts-jest | 云函数离线 mock，434 用例 |

## 2. 总体架构（分层）

```
┌─ 车主端（小程序）───────────────┐  ┌─ 车场端（小程序）────────┐  ┌─ Web 运营后台 ─┐
│ role-select 首页 搜索 预约 订单  │  │ 看板 核销预约 车场配置    │  │ 登录 车场管理   │
│ 我的 地图                       │  │ 车场我的 绑定车场          │  │ 订单 车牌识别   │
└──────┬─────────────────────────┘  └──────┬──────────────────┘  │ 打印 看板 账号  │
       │ services/cloud.ts（云函数封装）      │                     └──────┬───────┘
       └────────────────────────┬───────────┴───────────────────────────┘
                          ┌─────▼───── 微信云开发 ─────┐
                          │  云函数（26 个，业务逻辑）   │
                          │  云数据库（11 集合，数据）   │
                          │  云存储（照片/凭证文件）      │
                          │  定时触发器（余位采样/对账）  │
                          └────────────────────────────┘
```

- **小程序端三层**：`pages/`（页面视图）→ `services/`（云函数/本地能力封装）→ `domain/`（纯逻辑，可单测）
- **业务逻辑全在云函数**：前端不直写数据库，角色校验在云函数入口（安全规则只管读）
- **Domain 层无平台依赖**：不 import `wx`，纯函数可离线单测，是测试主力

## 3. 开发流程（实际迭代，非教科书）

课程排期六阶段（9/7–10/7）：需求分析 → 概要设计 → 详细设计 → 编码实现 → 测试 → 部署答辩。实际按「计划驱动」推进，每个功能先写**设计稿 + 实现计划**（`docs/superpowers/`）再动手：

| 迭代 | 内容 | 交付 |
|---|---|---|
| 地基 | 脚手架、免费层、角色选择、首页/搜索 | Plan 1（`2026-09-11-free-tier-and-foundation`） |
| Plan 2a | **数据真实化** + 云地基：建 11 集合、initDb、签约车场库、退役假字段 | `2026-09-14-plan2a-data-realism-cloud-foundation` |
| Plan 2b | 预约主流程：预约锁位、模拟支付、订单、取消退款 | `2026-09-15-plan2b-reservation-flow` |
| Plan 3 | 车场端：看板、核销、余位上报、车牌识别、对账定时 | `2026-09-16-plan3-lot-side` |
| 拓展 | 体验优化 + 1:N 多车场 + 输入上限 + 地图图钉 | `2026-09-18-ux-and-1n-extension` |
| Web 端 | 运营后台（组员承担，组长复核合并） | `docs/web-admin-assignment.md` |

**工作方法要点（答辩可讲）**：
- 计划先行、规格先验算（计划里的代码块反复含真 bug，派活前逐条核对）
- 测试驱动云函数：每个云函数先写离线 mock 测试（`tests/cloudfunctions/*.test.ts`）
- 每轮真机验收，从正常入口点通才算收工（真机首轮几乎必有返工）

## 4. 数据模型（11 集合，核心 8 个）

设计文档：`docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`

| 集合 | 作用 | 关键字段 / 口径 |
|---|---|---|
| `users` | 用户与角色 | `role`: `driver`（车主）/ `lot_admin`（车场主）/ `ops_admin`（运营）；`webAccount` 存 Web 登录口令（scrypt 哈希+盐） |
| `lots` | 签约车场库 | `pricing`（首小时/续费/封顶/步长）、`availability`（余位）、**`source`**：`public`/`ops`/`placeholder`（示例数据必须如实标注，红线） |
| `reservations` | 预约单 | 状态机 `pending_entry → entered → completed`，及 `cancelled` / `released`；`verifyCode` 6 位核销码；预支停车费+服务费+退款 |
| `orders` | 资金流水 | `prepaid`（预支）/ `service`（服务费）/ `refund`（退款，负数） |
| `payments` | 模拟支付 | `channel: 'mock'`，界面必须标「模拟支付」 |
| `entry_logs` | 核销留痕 | `method`: `code`/`manual`/`plate`（车牌识别）+ 置信度 + 原图 fileID |
| `lot_price_changes` | 改价留痕 | 含公示价照片存证 |
| `availability_samples` | 余位历史 | 定时采样，算占用率/及时率 |

口径统一：时间戳 **epoch 毫秒**；`reservedCount` 由云函数 CAS 维护，不许手改；余位只由车场端上报，运营不录入初值。

## 5. 代码架构分层（核心文件 → 职责）

### 5.1 页面层 `miniprogram/pages/`（11 页，角色分流）

车主端：
- `home` 首页：定位 + 附近推荐（占用率/距离/价格排序）→ 进 `lot-detail` 详情 →「预约」
- `search` 搜索：名称/地址关键词 + 排序 chips
- `confirm` 预约确认：选车牌（已存车辆点选/手输）→ 报价（计费明细 + 服务费）→ 模拟支付 → 下单
- `orders` 我的订单：列表/详情/取消退款/待入场详情内核销码
- `profile` 我的：角色/车辆管理（增删车牌，本地存储）

车场端（`pages/owner/`）：
- `dashboard` 看板：余位/今日预约/核销统计（`adminDashboard` 云函数）
- `reservations` 核销预约：待入场列表 → 输码 / 手动 / **拍照识别** 三种核销
- `lot` 车场配置：信息/收费/额度/设施（`adminUpdateLot`，上限云端校验）
- `profile` 车场我的：角色切换、名下多车场切换（1:N）
- `bind-lot` 绑定车场

### 5.2 Domain 纯逻辑层 `miniprogram/domain/`（无 wx 依赖，可单测）

| 文件 | 职责 | 关键点 |
|---|---|---|
| `types.ts` | 全项目数据模型类型 | 前端与云端字段口径一致 |
| `pricing.ts` | 计费 | 服务费 **¥2**（平台唯一收入）；首小时/续费/封顶 |
| `time.ts` | 预约窗口 | `MAX_LEAD_HOURS=2`，超出不给约；免费取消窗口 |
| `scoring.ts` | 推荐排序 | 占用率警戒线，饱和降权/剔除 |
| `sort.ts` | 排序 | 距离/价格/评分 |
| `geo.ts` | 距离 | Haversine 球面距离 |
| `format.ts` | 格式化 | 金额/车牌/时间 |
| `detail.ts` | 详情汇总 | 车场详情聚合字段 |
| `pins.ts` | 地图图钉 | 选中放大 P 角标、命中区 |

### 5.3 服务层 `miniprogram/services/`

- `cloud.ts`：**云函数统一封装**（`callFunction` + 错误归一），核心函数见 §6 各链路
- `storage.ts`：本地缓存（车辆列表、当前车场、脏标志）
- `qqmap.ts` / `location.ts`：腾讯位置服务 + 定位
- `lot.ts` / `reservation.ts`：领域数据拉取

### 5.4 云函数 `cloudfunctions/`（26 个，业务核心全在这）

用户端 / 基础：`login`、`switchRole`、`initDb`、`seedLots`、`bindLot`
预约链路：`createReservation`（下单）、`cancelReservation`（取消退款）
车场端：`adminGetLot` / `adminListLots`（1:N 多车场）、`adminDashboard`（看板）、`adminReservations`（预约列表）、`adminUpdateLot`（改配）、`reportAvailability`（余位上报）、`verifyReservation`（核销）、`recognizePlate`（OCR 识别）
定时：`sampleAvailability`（15 分钟余位采样）、`dailyReconcile`（每日对账）、`releaseExpiredReservations`（超时释放）
Web 端：`webLogin` / `webCreateUser` / `webListLots` / `webUpsertLot` / `webDeleteLot` / `webPriceChange` / `webLookup` / `webStats` / `webVerifyPlate`

### 5.5 测试 `tests/`（434 用例）

- `domain/`：纯逻辑全测（计费/排序/时间/图钉…）
- `services/`：云函数封装 + 存储 mock
- `cloudfunctions/`：**云函数离线测试**——`jest.mock('wx-server-sdk')` 建内存库，测 CAS 并发、权限、状态机、留痕
- `live/`：真 Key 联调（腾讯位置服务）

## 6. 核心业务链路（答辩主线，逐条讲代码）

### 链路 1：角色选择与身份
`role-select` → `login` 云函数（微信 `_openid` 取身份）→ `switchRole` 写角色 → 自定义 tabBar 按角色切换。
- 核心：`services/cloud.ts:78 ensureLogin`、`cloudfunctions/login`、`cloudfunctions/switchRole`

### 链路 2：找车场与推荐
首页定位 → 拉 `lots` 库 → `scoring.ts` 按「占用率饱和 → 距离 → 价格」排序 → 地图图钉展示（`pins.ts` 选中放大 P 角标）。
- 核心：`domain/scoring.ts`、`domain/geo.ts`、`pages/home/home.ts`

### 链路 3：预约锁位 + 模拟支付（最关键链路）
`confirm` 页选车牌 → 前端 `pricing.ts` 报价（预支停车费 + 服务费 ¥2）→ 下单。
- 核心云函数 `createReservation`：
  - **CAS 扣余位**：`availability.freeSpots` 等值递减，并发下单只成功一个（防超卖）
  - 生成 6 位 `verifyCode` 核销码
  - 写 `reservations` 单 + 两条 `orders`（prepaid + service）+ 一条 `payments`（mock）
- 代码：`cloudfunctions/createReservation/index.js`、`tests/cloudfunctions/createReservation.test.ts`

### 链路 4：取消与退款
`orders` 页取消 → `cancelReservation` 云函数：CAS 改状态 + 按**退款公式**算 refund + 回补余位 + 写 `orders`（refund）。
- 退款公式口径见 `docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`

### 链路 5：余位流转（闭环）
- 车场端上报：`reportAvailability`（余位只由车场端写）
- 预约时 CAS 扣减、取消时回补
- 定时采样：`sampleAvailability`（15 分钟）写 `availability_samples` → 看板算占用率/及时率
- 每日对账：`dailyReconcile`；超时释放：`releaseExpiredReservations`

### 链路 6：核销（三级降级链）
车场端 `reservations` 页三种核销：
1. **车牌识别**：拍照 → 压缩 → 上传云存储 → `recognizePlate` 云函数调腾讯云 OCR → 返回车牌+置信度 → 前端核对（低置信度提示不硬拒）→ `verifyReservation(method:'plate')`
2. **输码**：`verifyCode` 6 位码（带 lotId 防跨场串单）
3. **手动**：按车牌/预约单确认
- 云函数 `verifyReservation`：**CAS 改 entered**（并发双击只成功一次）+ `entry_logs` 留痕
- 核心：`cloudfunctions/recognizePlate/index.js`、`cloudfunctions/verifyReservation/index.js`、`miniprogram/pages/owner/reservations/reservations.ts`

### 链路 7：Web 后台与小程序识别一致性（2026-09-20 对齐）
`webVerifyPlate` 按小程序线路：官方 SDK + `LicensePlateInfos` + `TENCENT_SECRET_ID/KEY`；识别与核销分离（`mode=ocr` 识别不核销 → `mode=plate` 核对后核销 + 车牌一致校验）。

## 7. 关键难点与解决方案（答辩加分点）

1. **并发安全（CAS 等值更新）**：预约扣余位、取消回补、核销改状态全部用「读后等值 CAS」——`where({_id, status})` 只对特定状态 update，`updated===1` 才成功。双击/并发只过一次。（`createReservation` / `verifyReservation`）
2. **数据真实性红线**：课程要求不许模拟数据当真实。`pricing.source`/`availability.source` 区分 `public`/`ops`/`placeholder`，示例数据界面强制标注「待核实」，禁止改写。
3. **三级降级链**：车牌识别 OCR 是增强不是单点依赖——OCR 失败 → 输码 → 手动，任何环节断了核销仍可用。
4. **云端与前端密钥隔离**：腾讯云 OCR 密钥、Web 会话密钥只放**云函数环境变量**，绝不进小程序包/前端仓库。
5. **腾讯位置服务实测坑**：POI 返回信封不一致、`orderby` 不支持部分字段、步行耗时非 0、免费配额当天不可恢复——全部真 Key 实测后按实际行为开发。
6. **Skyline 渲染兼容**：`target: ES2017`（`??`/`?.` 降级），避免真机 SyntaxError；图钉用透明图放大命中区；角标抗锯齿。
7. **云函数离线可测**：`jest.mock('wx-server-sdk')` 建内存库，不依赖真实环境跑完整业务测试。

## 8. 质量保障

- **434 个 Jest 用例**，覆盖 domain 纯逻辑 + services + 26 个云函数
- 每轮功能真机验收，从正常入口点通（登录 → 找场 → 预约 → 核销）
- 验收返工四连（P 角标交互/车场入口/返回键/预约详情）均已修复，HEAD 已推
- 遗留问题清单（bannedUntil 形状 / role 白名单 / session 死代码）在 `docs/superpowers/` 评审记录可查

## 9. 演示路径（答辩现场 3 分钟点通）

1. 车场端登录 → 看板看余位
2. 车主端登录 → 首页推荐 → 进车场详情 → 预约 → 模拟支付 → 订单出现核销码
3. 车场端「核销预约」→ 输码核销 → 预约状态变已入场 → `entry_logs` 有留痕
4. 车场端拍车牌照 → OCR 识别 → 核对后核销（展示低置信度提示）
5. 取消预约 → 退款 + 余位回补
6. （可选）Web 后台：运营登录 → 车场管理 / 订单流水 / 车牌识别复核

---

*数据来源：仓库当前代码（main 分支）、`docs/superpowers/specs|plans`、`docs/web-admin-assignment.md`、`web-admin/README.md`。*
