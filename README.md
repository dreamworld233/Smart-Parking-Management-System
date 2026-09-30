# Smart Parking Management System

智慧停车管理系统 —— 微信小程序（车主端 + 车场端）+ Web 平台运营后台。

## 简介

解决「找车位难、车位利用率低」的问题。车主在小程序里查附近的签约车场、预约锁位；
车场主在小程序里上报余位、核销入场；平台运营方在 Web 后台管理车场与订单。

**平台只赚服务费。** 预约时收两笔 —— 锁位费（预支停车费，代收后转付车场）+
平台服务费 ¥2。入场后实际停放多久、闸机收多少，由车场自行计收，平台不参与。

## 功能模块

- **车主端（小程序）**：附近车场检索与智能推荐、车场详情、预约锁位与支付、预约凭证、
  订单中心、车牌管理、地图导航。
- **车场端（小程序）**：余位上报、预约核销（车牌识别 / 扫码 / 输码 / 手动）、车场与收费配置、
  代收结算看板。
- **平台运营后台（Web）**：车场审核与管理、订单与订单流水、车牌识别复核、打印。

> 不做：自动扣费 / 免密代扣、钱包余额、会员卡、道闸硬件。

## 技术栈

| 层 | 选型 |
|---|---|
| 车主端 / 车场端 | 原生微信小程序（TypeScript + Skyline 渲染器） |
| 后端 | 微信云开发 —— 云函数 + 云数据库 + 云存储 + 定时触发器 |
| 车牌识别 | 腾讯云 OCR `LicensePlateOCR`，由云函数调用（密钥托管在云函数环境变量） |
| 地图与 POI | 腾讯位置服务（小程序 SDK + WebService） |
| 平台运营后台 | Vue 3 + Element Plus，托管于云开发静态网站 |
| 测试 | Jest（domain 层纯函数） |

## 目录结构

```
├── miniprogram/        微信小程序源码（TypeScript + Skyline）
├── cloudfunctions/     微信云函数 27 个 —— 全部后端业务逻辑
├── tests/              Jest 测试（458 个用例）
├── web-admin/          组员 Web 运营后台（Vue 3 独立工程，组长复核）
├── backend/            Spring Boot 3 + MySQL 展示后端
├── docs/               设计稿、实现计划、测试指南
├── 工单素材/           每日工作记录（本地，不入库）
└── 答辩素材/           答辩讲稿 / 技术梳理 / 速记卡（本地，不入库）
```

### miniprogram/ —— 小程序端

| 路径 | 作用 |
|---|---|
| `app.json` | 页面注册 + tabBar + 全局配置（11 页，Skyline 渲染器） |
| `app.ts` / `app.wxss` | 启动逻辑 / 全局样式 |
| `config.ts` | 全局常量：腾讯地图 Key、云环境 ID、搜索半径、兜底定位点 |
| `config.local.ts` | 真实 Key / 环境 ID（已 gitignore，**不得提交**） |
| `pages/` | 11 个页面，每个 4 文件（ts + wxml + wxss + json） |
| `components/` | 复用组件：车场卡片、详情弹层、导航栏、排序标签、空态视图 |
| `domain/` | **纯逻辑层**：推荐评分、计费、格式化、地理、图钉筛选、排序、时间。与 UI 无关，全部单测覆盖 |
| `services/` | 数据服务层：封装云函数调用（cloud.ts 为核心）、车场、预约、定位、腾讯地图、本地缓存 |
| `custom-tab-bar/` | 自定义 tabBar |
| `styles/` | 设计令牌 tokens.wxss + 标签样式 tags.wxss |
| `utils/` | 杂项工具 |
| `assets/` | 图片（地图图钉等） |

页面一览：

- 车主端：`role-select`（选身份）、`home`（周边推荐）、`search`（搜索）、`confirm`（预约确认）、`orders`（订单）、`profile`（我的）
- 车场端：`owner/dashboard`（看板）、`owner/reservations`（核销）、`owner/lot`（车场维护）、`owner/profile`、`owner/bind-lot`（绑定车场）

### cloudfunctions/ —— 27 个云函数

> **架构口径：业务逻辑必须在云函数，前端不直写数据库。** 每个函数 = 一个目录（index.js + package.json，定时/超时函数带 config.json，口令函数带 auth.js）。

- **用户 / 车场端**：`login`（微信身份）、`switchRole`（角色切换）、`bindLot`（绑定车场）、`createReservation` / `cancelReservation` / `verifyReservation`（预约闭环 + 核销）、`reportAvailability`（余位上报）、`recognizePlate`（OCR 车牌识别）
- **定时任务**：`dailyReconcile`（每日对账）、`sampleAvailability`（余位采样）、`releaseExpiredReservations`（清理过期预约）
- **初始化**：`initDb`、`seedLots`（种签约车场，**不种余位**）
- **车场端管理**：`adminDashboard`、`adminGetLot`、`adminListLots`、`adminReservations`、`adminUpdateLot`
- **Web 后台（组员）**：`webLogin`、`webCreateUser`、`webListLots`、`webUpsertLot`、`webDeleteLot`、`webPriceChange`、`webLookup`、`webStats`、`webVerifyPlate`

### 其他目录

- `tests/` —— Jest 单测，镜像被测模块：`domain/`、`services/`、`cloudfunctions/`、`live/`（真 Key 联调）
- `web-admin/` —— 组员 Web 运营后台（Vue 3 + Vite），职责见 `docs/web-admin-assignment.md`
- `backend/` —— Spring Boot 3 + MyBatis-Plus 展示后端（JWT + BCrypt），**演示 MySQL 数据库时用**，与小程序两条线
- `docs/` —— 设计与规格：`superpowers/specs/`（设计稿与数据模型）、`superpowers/plans/`（实现计划）、`ui-mockups/`（视觉稿）、`setup/`（配置说明）、`答辩-prep-小程序端-STAR.md`（答辩讲稿）、`答辩-prep-小程序端.md`（技术梳理全文）
- `工单素材/` —— 每日工作记录

### 架构要点（答辩口径）

1. **前端不直写 DB**：业务全在 27 个云函数。安全规则只配「车主读自己的单」，车场端按 lotId 读没有规则，走云函数规避（数据模型 §5.6）
2. **domain/ 纯逻辑层** + 434 个 Jest 用例，逻辑可测、可复用
3. **不许模拟数据红线**：`seedLots` 不种余位，余位只由车场端上报；兜底定位坐标留来源注释
4. **Skyline 渲染** + 自定义导航栏 + 自定义 tabBar，界面均为手写
5. **车牌识别三级降级链**：OCR 自动核销 → 扫 / 输核销码 → 车场端手动确认；识别与核销拆两个函数，防「识别即核销」误放行（2026-09-20 口径，web 端同此流程）

## 本地运行

1. 微信开发者工具导入本仓库根目录（`project.config.json` 已配置）
2. 复制 `miniprogram/config.local.example.ts` 为 `miniprogram/config.local.ts`，
   填入腾讯位置服务 Key（**该文件已 gitignore，Key 不得提交**）
3. 跑测试：`npx jest`

## 协作流程

1. `git clone` 本仓库
2. **直接在 `main` 上开发提交**（不再开功能分支）
3. 提交后 `git push origin main`

## 文档入口

- 界面与流程规格：`docs/superpowers/specs/2026-09-11-smart-parking-miniprogram-ui-design.md`
- 数据模型与关键机制：`docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-11-free-tier-and-foundation.md`

> 课程 PM 文档自 2026-09-14 起**降为参考**，与上述 spec 冲突时以 spec 为准。
> Android 时代的 `docs/开发计划.md`、`docs/移动端需求.md` 与更早一版需求草稿
> 已于同日删除（内容仍在 git 历史里）。
