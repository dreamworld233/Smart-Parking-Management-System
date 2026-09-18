# 体验优化 + 1:N 拓展 + 输入上限 — 设计稿

日期：2026-09-18
状态：已定稿待实现
来源：2026-09-17 与组员探讨反馈（返回键触摸区、地图图钉/气泡点击、多车、多车场、离谱数值、二维码核销去留）

## 背景与范围

组员反馈四类问题，均在本设计覆盖：

1. **操作便利性**（A）：返回键触摸区块过小；地图图钉及其价格气泡点击效果不一致。查验对象为全部二级/三级页面。
2. **1:N 关系**（B/C）：车主 ↔ 车辆 1:N；车场主 ↔ 车场 1:N。
3. **输入上限**（D）：收费价格、计费步长无上限，可输入离谱数值。
4. **二维码核销**（E）：不做，维持 6 位数字核销码。

**用户已拍板的决策：**

- 车辆列表存本地 storage（`qnt.vehicles`），不写云端
- 车场主「当前管理的车场」存本地 storage（`qnt.currentLotId`）
- confirm 页选车交互 = 已存车牌 chips + 保留手输
- 地图气泡点击修复 = 透明 iconPath 放大 marker 命中区（label 视觉不变）
- 输入上限只限价格与步长；名称/地址长度不限
- spike-map 遗留验证页从 app.json 移除、删除目录

## A. 操作便利性

### A1 返回键触摸区 ≥ 88rpx

涉及文件：

- `pages/confirm/confirm.wxml` + `confirm.wxss`（`.bar__back`）
- `pages/search/search.wxml` + `search.wxss`（`.bar__back`）
- `pages/owner/bind-lot/bind-lot.wxml` + `bind-lot.wxss`（`.bar__back`）
- `components/lot-detail/lot-detail.wxml` + `lot-detail.wxss`（`.detail__back`）

做法：`‹` 字符外层 view 加 `padding` 使命中区 ≥ 88rpx×88rpx（`padding: 20rpx`，字符本身 40rpx 字号 → 合计约 80rpx，不足再补）。按钮保留 `bindtap` 原处理器。三页 `.bar__back` 与面板 `.detail__back` 样式同步改，避免一页好一页坏。

真机验证：顶栏布局不因 padding 挤动（`.bar` 是 flex，padding 只加大按钮自身盒子，不改变其他子项位置；`.detail__back` 同理）。

### A2 orders 详情页补返回键

现状：`pages/orders/orders.ts` 已有 `onBack()`（`setData({ detail: null })`），但 `orders.wxml` 顶栏只有标题、无返回按钮。详情视图打开后无法返回列表。

改法：`orders.wxml` 顶栏 `.bar` 内，`wx:if="{{detail}}"` 显示 `‹ 返回` 按钮（复用 `.bar__back` 样式），`bindtap="onBack"`；列表态不显示。标题 `我的订单` 保持。

### A3 地图图钉及价格气泡可点击

现状：`domain/pins.ts` `toMarkers` 里 marker `width: 1, height: 1` 且无 `iconPath`。marker 命中区只有 1px 见方，图钉的气泡（label 价格·距离）点不到，真机表现为「点气泡没反应」。

改法：给每个 marker 加一个透明 `iconPath`（仓库内置 1×1 透明 PNG，放 `miniprogram/assets/transparent.png`），`width`/`height` 放大到约 100px×48px 覆盖气泡区域。`label` 参数保持原样，视觉不变。首页与搜索页共用 `toMarkers`，一处改两页生效。

风险与兜底：Skyline 下 map 只在真机可验。若加 icon 后 label 位置偏移（icon 会改变 label 锚点），需用 `label-anchor-x`/`label-anchor-y` 或 `anchor` 校正。真机验证两点：① label 视觉位置不偏 ② 点气泡触发 `bindmarkertap`。

## B. 车主 1:N 车辆（本地存储）

### B1 storage 层

`services/storage.ts`：

- 新增 key `qnt.vehicles`，值为车牌字符串数组（上限 5，`VEHICLES_MAX = 5`）
- 新增 `getVehicles(): string[]` — 形状校验，非字符串项逐条剔
- 新增 `addVehicle(plate: string): string[]` — 去重置顶、截到上限、写回、返回新列表
- 新增 `removeVehicle(plate: string): string[]` — 删除、写回、返回新列表
- `getDefaultPlate()` 保持：先读 `qnt.defaultPlate` 旧 key，空则读 `vehicles[0]`（向后兼容，confirm 页预填不变）

### B2 profile 页「我的车辆」卡

`pages/profile/profile.wxml` + `ts` + `wxss`：

- 现有「常用车牌」行下方加「我的车辆」卡
- 列表：已存车牌，每条带删除按钮（`bindtap` 确认后 `removeVehicle`）
- 添加：输入框 + 按钮，`isValidPlate` 校验，合法则 `addVehicle`
- 空态文案「还没有车辆，预约时也可直接输入车牌」

### B3 confirm 页已存车牌 chips

`pages/confirm/confirm.wxml` + `ts` + `wxss`：

- 车牌卡内、输入框上方加一行已存车牌 chips（`getVehicles()` 渲染）
- tap chip → 填入输入框并实时校验（复用 `onPlateInput` 逻辑，或直接 setData `plate`/`plateValid`）
- 手输保留：输入框可继续编辑
- 提交成功后：若本次车牌不在 vehicles 且合法，`addVehicle(plate)`（替代现在的 `setDefaultPlate`，但 `setDefaultPlate` 仍调用以兼容）

## C. 车场主 1:N 车场（本地存储）

### C1 云函数

- **`adminGetLot`**：改为返回 `{ role, lots: [...] }`，`lots` 为该 `adminUserId` 名下全部车场（去掉 `limit(1)`，改 `.limit(20)`）。`pickLot` 白名单字段沿用。`lots` 为空时前端按未绑定处理。
- **`adminDashboard`**：入参加 `lotId`。原先内部 `where({adminUserId}).limit(1)` 自动解析改为：校验 `role === 'lot_admin'` → 读 `lots.doc(lotId)` → 校验 `lot.adminUserId === OPENID`（否则 `FORBIDDEN`）。统计逻辑不变。
- **`adminReservations`**：同上，入参加 `lotId` + 归属校验。
- **`adminUpdateLot` / `reportAvailability` / `verifyReservation`**：已接 `lotId`，无需改（归属校验已存在）。

### C2 storage 层

`services/storage.ts`：新增 key `qnt.currentLotId`，`getCurrentLotId(): string` / `setCurrentLotId(id)`，形状校验（非字符串返回空串）。

### C3 owner 各页接当前 lotId

`pages/owner/dashboard` / `owner/reservations` / `owner/lot`：

- `fetchAdminLot()` 返回的 `lots` 列表里解析当前 lotId：先读 `qnt.currentLotId`，若不在列表或为空，取 `lots[0]` 并写回 storage
- `fetchAdminDashboard()` / `fetchAdminReservations()` 改为传 `lotId`（cloud.ts 封装加参数）
- `adminUpdateLot` / `reportAvailability` / `verifyReservation` 已有 lotId，从解析结果传入

### C4 owner profile 页「切换车场」

`pages/owner/profile/profile.wxml` + `ts`：

- 现状显示当前车场名 + 「切换身份」卡 + 绑定入口
- 加「切换车场」卡：`adminGetLot` 返回的 `lots` 列表逐条列出（当前选中高亮），tap 写入 `qnt.currentLotId` 并刷新本页
- 「绑定车场」入口保留（绑定后重新拉列表）
- 仅当 `lots.length > 1` 时显示切换卡（单车场不显示，省界面噪音）

## D. 输入上限

### D1 客户端 `pages/owner/lot.ts`

`onConfirmEdit` 数字字段校验从「非负」扩展为「非负 + 上限」，字段上限：

| 字段 | 允许范围 |
|---|---|
| firstHour / perHourAfter / nightRate | 0 ~ 200（元） |
| capPerDay | 0 ~ 1000（元） |
| stepMinutes | 5 ~ 120（整数） |

超出 `inputInvalid` 提示。名称/地址保持仅非空校验（用户拍板不设长度上限）。

### D2 云端 `adminUpdateLot`

`sanitizePatch` 对 `pricing` 数字字段同步加同一组上限（云端是权威，客户端可被绕过）。校验失败返回 `BAD_REQUEST`（如 `首小时超出上限`）。

## E. 不做 / 附带

- **二维码核销**：不做，维持 6 位数字核销码 + 已上线的 OCR 车牌识别
- **spike-map 遗留页**：从 `app.json` pages 移除 `pages/spike-map/spike-map`，删除 `pages/spike-map/` 目录

## 测试

- storage：`getVehicles`/`addVehicle`/`removeVehicle`/`getDefaultPlate` 兼容、上限截断、脏形状剔除 —— jest
- pins：`toMarkers` 新增 iconPath 与放大尺寸后原有断言更新，label 字段不变 —— jest
- 云函数：`adminDashboard`/`adminReservations` 加 lotId 后，离线 mock 测归属校验（他人车场 FORBIDDEN、lotId 缺失 BAD_REQUEST）；`adminGetLot` 多车场返回 —— 复用现有 mockStore 套路
- `adminUpdateLot` 上限校验：超上限拒绝 —— jest
- 真机：A1 返回键命中区、A2 orders 返回、A3 气泡点击、B confirm chips、C4 车场切换

## 已知未完成 / 后续

- 车辆不存云端：换设备丢失（用户拍板接受，为课程项目合理折衷）
- 车场切换不落库：换设备重置当前选中（同上）
