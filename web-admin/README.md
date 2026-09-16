# Web 平台运营后台

平台运营方使用的管理端，与本仓库的小程序**共用同一套云函数与云数据库**（数据模型 `docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md` §11）。技术栈：Vue 3 + Vite + TypeScript + Element Plus + `@cloudbase/js-sdk`。

## 页面（对应课程 5 项 + 加分项）

| 路由 | 页面 | 课程要求 | 说明 |
|---|---|---|---|
| `/login` | 登录 | 1. 登录 | 用户名 + 密码，登录态存 localStorage，角色不对提示无权限 |
| `/lots` | 车场管理 | 2. 车场信息管理 | 列表/搜索/分页 → 新增/编辑/停用，改价走独立留痕 |
| `/orders` | 订单流水 | 3. 车辆信息管理 | 按车牌/单号/状态查预约单与流水，看三笔金额与状态 |
| `/verify` | 车牌识别 | 4. 车牌识别 | 上传照片 → OCR → 匹配预约 → 核销；失败转手动输码 |
| `/print` | 打印管理 | 5. 打印管理 | 预约凭证打印（浏览器 print） |
| `/dashboard` | 运营看板 | 加分 | 签约数/预约数/核销数/余位上报及时率 |
| `/users` | 账号管理 | 加分 | 创建运营/车场管理员账号 |

## 新增云函数（`cloudfunctions/` 下，均已实现）

`webLogin`（登录）、`webCreateUser`（建号）、`webListLots` / `webUpsertLot` / `webDeleteLot`（车场管理）、`webPriceChange`（改价留痕）、`webLookup`（流水查询）、`webVerifyPlate`（OCR 复核 + 手动核销）、`webStats`（看板）。

> 命名统一用 `web*` 前缀，是为了和小程序车场端那批 `admin*` 函数（`adminGetLot` / `adminUpdateLot` / `adminListLots` …）**区分开、避免撞名**——两边的职责与鉴权模型不同（Web 走自签票据，小程序走微信 `OPENID`）。

**不要动**现有 `login` / `seedLots` / `initDb` / `createReservation` / `cancelReservation`（小程序在用）。

## 两个关键设计决定（任务书 §4 让我「先查官方文档定一种」）

1. **登录形态 = 自签票据**（不是云开发内置用户名密码账号体系）。`webLogin` 用 `crypto.scrypt` 验证 `users.webAccount`，再签一个 HMAC-SHA256 票据（密钥在云函数环境变量 `WEB_ADMIN_SESSION_SECRET`），票据 payload 里就是 `userId`（= `users._id`）。每个 `admin*` 云函数在入口校验票据 + 判角色。理由：不依赖「安全规则里 Web 身份变量名」这个核实不了的口径，且能精确对应回 `users._id`。
2. **`entry_logs.method` 用 `ocr` / `code` / `manual`**。数据模型 §4 表格里车牌识别那档写成 `'plate'`，与 §10 / 任务书 §3 冲突，以任务书 §3 为准。

## 部署步骤（按顺序，已实测跑通）

### 0. 环境 ID
问组长要云开发环境 ID（形如 `cloud1-xxxx`），填到 `web-admin/.env.local` 的 `VITE_CLOUD_ENV`。

### 1. 部署云函数
把 `cloudfunctions/` 下 `webLogin`、`webCreateUser`、`webListLots`、`webUpsertLot`、`webDeleteLot`、`webPriceChange`、`webLookup`、`webVerifyPlate`、`webStats` 九个目录逐个上传部署（微信开发者工具「云开发 → 云函数 → 上传并部署」）。

### 2. 控制台开两个开关（踩过的坑，必开）
1. **开匿名登录**：云开发控制台 → 身份认证 / 登录方式 → 开启「匿名登录」。`@cloudbase/js-sdk` 调云函数前必须先建立登录态。
2. **改云函数安全规则**：云开发控制台 → 云函数 → 权限/安全规则 → invoke 填 **`true`**（注意是纯表达式，**不是** `{"*":{...}}` 那种 JSON，否则报 `PERMISSION_DENIED`）。放行到函数这一步是安全的——每个 `web*` 函数内部还会校验自签票据 + 角色。

### 3. 云函数环境变量（在「微信开发者工具」里配，网页控制台常为只读）
- `WEB_ADMIN_SESSION_SECRET`：**必填，9 个函数配同一个值**，任意长随机串（如 `openssl rand -hex 32`）。登录票据的签名密钥；值不一致会「登录态无效」。
- `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`：**可选**，腾讯云 OCR 密钥。不配则车牌识别页走手动核销（任务书 §9：OCR 是增强，不是单点依赖）。

> 密钥只放云函数环境变量，绝不进前端仓库。

### 4. 建第一个运营账号（引导模式）
- 云函数 `webCreateUser` 云端测试，库中尚无 `ops_admin` 时引导模式自动放行，传：
  `{ "username": "admin", "password": "123456", "role": "ops_admin", "nickname": "运营" }`
- 创建后引导自动关闭，之后建号需登录 ops_admin。

### 5. 本地跑 / 部署静态网站
```bash
cd web-admin
cp .env.example .env.local   # 填入 VITE_CLOUD_ENV=你的环境ID
npm install
npm run dev                  # 本地预览 http://localhost:5173
npm run build                # 产出 dist/，用于静态网站托管
```
把 `dist/` 上传到云开发「静态网站托管」（控制台开通后，或用 CloudBase CLI `tcb hosting deploy dist/`）。

## 字段口径（别自己发明，以数据模型文档与云函数写入口径为准）

- 时间戳一律 **epoch 毫秒**（不是 ISO 字符串）。
- `pricing.source` / `availability.source` 只能取 `public` / `ops` / `placeholder`。`placeholder` = 演示暂定值，界面必须标「示例数据，待核实」，**不许把它改写成已核实**（课程红线）。
- `reservedCount` 不准手改（由预约云函数 CAS 维护）。
- 余位 `freeSpots` 只由车场端上报，运营录入不给初始值（给了就是编数据）。
- 支付为模拟，界面标注「模拟支付」。
- 车场坐标从腾讯 POI 检索带出（本 Web 端表单里留坐标输入框 + 提示，不接腾讯地图 JS SDK）。

## 已知未做 / 待真机验证

- OCR 签名算法照官方文档实现，但**未经真实密钥联调**（本机网络拦截腾讯云文档，无法逐字核对 LicensePlateOCR 响应字段）。部署后需用一张真车牌图联调一次，确认 `Number` / `Confidence` 字段与文档一致。识别失败不影响手动核销主链路。
- 车场端（余位上报 / 核销 / 看板）在小程序，不在 Web（任务书 §9 边界）。
