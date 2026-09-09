# 微信小程序智能停车（MVP）设计文档

- 日期：2026-09-09
- 项目：Smart Parking Mini Program
- 范围：MVP（到达即停）；未来时段预约列入后续阶段
- 导航：主页 / 订单 / 我的

## 1. 目标与范围

### 1.1 目标
构建微信小程序首版核心能力：
1. 用户首次启动完成静默登录（`wx.login` -> 后端换会话）。
2. 主页默认以“当前位置”为终点，推荐附近可停车停车场。
3. 支持用户搜索指定地点，刷新候选停车场。
4. 展示停车场关键信息：余位、收费、距离。
5. 支持从停车场详情发起“到达即停”下单。

### 1.2 本阶段不做（MVP外）
1. 未来时段预约（本阶段不实现；保留为下一阶段优先候选）。
2. Android 端实现与迁移。
3. 深度运营功能（优惠券、积分、复杂营销规则）。

## 2. 总体方案

采用“前端直连腾讯地图 + 轻后端聚合停车数据”方案。

### 2.1 组成
- 小程序前端
  - 定位、POI 搜索、停车场列表、详情、下单入口、订单展示。
- 轻后端服务（云函数或轻 API）
  - `auth`：微信 code 换会话。
  - `parking`：统一返回停车场及余位/收费。
  - `order`：创建与查询订单。
- 数据策略
  - 先用 Mock 数据开发；接口字段按未来真实 API 形状设计，后续平滑替换。

### 2.2 选择理由
1. 匹配当前优先级（先完成登录与主页）。
2. 保持后续扩展空间（订单、我的页、真数据接入）。
3. 降低返工：前端先对齐契约，Mock->真实 API 迁移成本低。

## 3. 信息架构与页面流

### 3.1 页面结构
- `主页`（核心）
  - 目的地输入（默认当前位置）
  - 筛选（距离/价格/余位）
  - 停车场列表卡片
  - 详情入口与“去停车”按钮
- `订单`
  - 进行中
  - 待支付
  - 历史
- `我的`
  - 用户信息
  - 定位权限引导
  - 基础设置（缓存清理等）

### 3.2 主流程
1. App 启动 -> `wx.login` -> `/auth/login`。
2. 进入主页，检查定位权限。
3. 允许定位：取当前位置作为默认终点并搜索附近停车场。
4. 拒绝定位：进入手动搜索终点模式。
5. 用户选停车场 -> 详情 -> 创建订单（状态 `active`）。

## 4. 前端组件与职责拆分

### 4.1 页面级
- `pages/home/index`
  - 页面容器，负责登录态检查、定位触发、搜索请求、状态聚合。
- `pages/parking-detail/index`
  - 展示收费规则、营业时间、入口信息、下单按钮。
- `pages/orders/index`
  - 展示 `active / pending_payment / completed`。
- `pages/profile/index`
  - 用户信息与权限引导。

### 4.2 组件级
- `components/search-bar`
  - 输入目的地、清空、选择结果并触发 `onDestinationChange`。
- `components/filter-chips`
  - 距离/价格/余位筛选排序，触发 `onFilterChange`。
- `components/parking-card`
  - 停车场摘要展示与点击事件。

### 4.3 状态分层
- 全局状态
  - `session`: `token / userId / expireAt`
  - `locationPermission`: `granted | denied | unknown`
- 主页本地状态
  - `destination`
  - `currentLocation`
  - `filters`
  - `parkingList`
  - `loading / error / empty`

## 5. 数据模型与接口契约

### 5.1 数据模型（Type Shape）
```ts
type LocationPoint = { lat: number; lng: number; name?: string; address?: string };

type ParkingLot = {
  id: string;
  name: string;
  distanceM: number;
  freeSpots: number;
  totalSpots: number;
  price: {
    currency: "CNY";
    unit: "hour";
    basePerHour: number;
    capPerDay?: number;
    ruleText: string;
  };
  openHours?: string;
  tags?: string[];
  location: LocationPoint;
};

type ParkingQuery = {
  destination: LocationPoint;
  radiusM: number;
  sortBy: "distance" | "price" | "freeSpots";
};

type Order = {
  id: string;
  lotId: string;
  lotName: string;
  status: "active" | "pending_payment" | "completed";
  startTime: string;
  endTime?: string;
  estimatedFee?: number;
  finalFee?: number;
};
```

### 5.2 接口契约（MVP）
- `POST /auth/login`
  - in: `wxCode`
  - out: `token`, `user`
- `POST /parking/search`
  - in: `ParkingQuery`
  - out: `ParkingLot[]`
- `GET /parking/:id`
  - out: `ParkingLot` + 详情扩展字段
- `POST /orders/create`
  - in: `lotId`, `startContext`
  - out: `Order`
- `GET /orders`
  - out: 分组后的订单列表

## 6. 异常处理策略

1. 登录失败
   - toast 提示 + 重试。
   - 持续失败时进入游客只读（可浏览，不可下单）。
2. 定位失败或拒绝
   - 不阻塞主页。
   - 提示去设置授权并保留手动目的地搜索。
3. 搜索无结果
   - 空态页 + 放宽条件建议（增大半径、切换排序）。
4. 接口超时
   - 统一 3 秒超时，指数退避重试 1 次。
5. 脏数据兜底
   - 余位/价格异常显示 `--`，同时记录日志上报。

## 7. 测试策略

### 7.1 单元测试
- 数据转换函数（距离、价格文案）。
- 筛选排序函数（distance/price/freeSpots）。
- 页面状态机（loading/error/empty/success）。

### 7.2 集成测试
- 登录成功/失败分支。
- 定位允许/拒绝分支。
- 搜索 -> 详情 -> 下单链路。

### 7.3 Mock 契约测试
- Mock 字段严格对齐目标真实 API。
- 缺字段、异常字段、边界值回归用例固定。

## 8. 实施边界与后续演进

### 8.1 本阶段完成定义（DoD）
1. 首次进入主页可自动尝试定位并返回停车场列表（或进入手动搜索）。
2. 可搜索指定目的地并刷新推荐。
3. 卡片可见余位、收费、距离。
4. 可创建进行中订单并在“订单”页可见。
5. 登录链路可稳定获得会话。

### 8.2 下一阶段候选
1. 未来时段预约。
2. 更精细计费引擎。
3. 支付、发票、消息通知闭环。

## 9. 代码仓库与分支说明

- 当前规划以微信小程序实现为唯一目标。
- 既有 Android 相关内容本阶段不纳入。
- 分支：`QNT`（用户已创建）。
