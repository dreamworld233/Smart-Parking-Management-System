# 数据模型设计（2026-09-14）

> 依据 2026-09-14 与用户的讨论定稿。**这份文档是 Plan 2 的依据**，也是《项目需求分析与设计方案》里
> 数据层那部分的落地口径。上游：`2026-09-10-smart-parking-architecture-diagram-design.md`（架构图，
> §2.4 数据层、§3 技术栈降级决策）、PM 需求基线（BR-01～05、FR-U01）。
> 现状代码：`miniprogram/domain/types.ts`、`miniprogram/services/lot.ts`、`backend/src/main/resources/schema.sql`。

## 1. 本轮定下的四件事

| 决定 | 内容 | 理由 |
|---|---|---|
| 存储形态 | **微信云开发**（云数据库 + 云函数 + 云存储 + 定时触发器） | 要发体验版：`wx.request` 的合法域名在体验版/正式版**没有豁免**，自建后端必须先备案域名（1–3 周，赶不上答辩）；纯云开发走 `wx.cloud`，不经域名白名单、不用 ICP 备案，且**只发体验版不发布线上版本时小程序专项备案也可不做** |
| 车场数据 | **签约车场库**：库里只存「已签约、可预约」的车场 | 市面可预约车场是少数，全量入库就得给每家编价格与额度（撞「不许随意模拟数据」红线）。签约是**平台侧运营声明**，不是对客观事实的断言 |
| 实时余位 | **车场端上报**，超期未报则降级并标注 | 余位是唯一必须时变的字段。哈希常量无法支撑任何预测；上报让它变成真数据，同时给车场端「车位额度」模块一个存在的理由 |
| 预测 | **「实时余位 + 历史同期」基线预测列入 Plan 2** | 架构图 §3 已把预测降级为「基线模型 · 可降级」，BR-06 允许；有真实历史样本后预测才是真技术 |

另有三项已拍：**身份走微信 `_openid`**（不自建密码体系）、**核销走扫码/输码**（无闸机与车牌识别）、
**预约与订单分表**（车场端对账要按订单聚合）。

## 2. 现状问题：比标注出来的多得多

`miniprogram/services/lot.ts` 的 `toParkingLot()` 用 **POI id 的哈希**派生字段。逐字段盘点：

| 字段 | 现在的来源 | 现有标注 |
|---|---|---|
| 名称 / 地址 / 坐标 | 腾讯 POI，真实 | — |
| 距离 / 步行时长 | 前 N 名走真实路线矩阵，其余直线 × 绕行系数 | ✅ `route` / `estimated` |
| 收费（首小时 / 后续 / 封顶 / 夜间） | **按名字猜**（医院 4 元、商城 5、万象 6、默认 5） | 标「估算」，但它是猜的不是估的 |
| 总车位数 | 同上猜（医院 800、商城 300…） | 同上 |
| 实时余位 | **哈希随机，且不随时间变** | 标「估算」 |
| 可预约额度 | 哈希随机 40–160 | ❌ 无标注 |
| 车场评分 | 哈希随机 4.0–4.8 | ❌ 无标注（且只在详情页 `★` 处露出） |
| 充电桩标签 | 哈希（`seed % 3`） | ❌ 无标注 |

两条后果，本轮必须解决：

1. **预测在现状下不成立** —— 余位是常量，采样一万次都是同一个数。
2. **五因子评分里，口碑因子正在给一个编的数打分** —— 且是未标注字段之一，答辩会被戳。

## 3. 数据来源分级与界面标注

每个字段必须能回答「它从哪来」。五类，界面按类标注：

| 来源 | 含义 | 字段举例 | 界面标注 |
|---|---|---|---|
| `poi` | 腾讯地图 POI，客观真实 | 名称、地址、坐标 | 无需标注 |
| `route` | 路径矩阵实测 | 距离、步行时长 | 无需标注 |
| `public` | 公开渠道人工录入（车场公示价、点评页），**留截图存证** | 首小时/后续/封顶/步长 | 「收费来源于车场公示价」 |
| `ops` | 平台运营配置（签约时录入） | 可预约额度、营业时间、充电桩等设施 | 「车场信息由平台运营维护」 |
| `reviews` | 平台自有评价聚合 | 车场评分 | 「基于 N 条平台评价」 |
| `reported` | 车场端上报 | 实时余位 | 「车场实时上报」 |
| `estimated` | 估算/降级 | 上报超期时的余位、未走矩阵的距离 | 「…为估算」 |

规则：**能查到的一律 `public`，查不到的降为 `ops` 声明（不谎称是实测），只有真估算才标 `estimated`。**
「非必要不模拟」就落在这张表上。

配套改动：`domain/format.ts` 的 `sourceNote()` 现在只认「距离/收费/余位」三项，要扩到上表；
`domain/types.ts` 的 `DataSource` 枚举要扩（现有 `'poi' | 'rule' | 'estimated'`）。

## 4. 集合清单

> 旧 `backend/schema.sql` 的十张表按此重做。`t_space`（逐车位）**整张删除** —— 拿不到车场内部
> 车位级数据，做了就是编。这条要在答辩主动讲（「为什么不做逐车位」）。

### `users`
| 字段 | 说明 |
|---|---|
| `_id` / `_openid` | 云开发写入，微信身份即唯一凭证。**不建密码字段** |
| `role` | `'driver'`（车主）/ `'lot_admin'`（车场端） |
| `nickname` / `avatar` | 微信授权取 |
| `phone` | 可选，仅作联系方式，**不作为登录凭证** |
| `credit` | `{ violationCount, bannedUntil }` —— BR-02 三次停用 30 天 |
| `createdAt` | |

> 与 PM 的冲突：FR-U01 写「手机号验证码登录」、架构图外部服务里有「短信服务」。本轮定的是微信身份为主，
> **PM 与架构图要同步改口**（改成「微信一键登录」，手机号退为可选绑定）。

### `cars`
`user_id`、`plate_no`、`isDefault`、`createdAt`。
索引：**组合唯一索引 `(user_id, plate_no)`** —— 不是全局唯一：同一辆车可能被家人各建一条。
（旧表 `t_car.car_no` 是全局 `UNIQUE`，那条约束过严。）

### `lots`（签约车场库，替换旧 `t_parking_area`）
| 字段组 | 字段 | 来源 |
|---|---|---|
| 身份 | `poiId`（腾讯 POI id，回溯用）、`name`、`address`、`location`(GeoPoint) | `poi` |
| 收费 | `pricing{ firstHour, perHourAfter, stepMinutes, capPerDay, nightRate? }` | `public` |
| 运营 | `facilities[]`（含充电桩）、`openHours`、`quota{ reservableTotal, reservedCount }`、`adminUserId` | `ops` |
| 履约 | `contract{ status, signedAt }` | `ops` |
| 实时 | `availability{ freeSpots, totalSpots, reportedAt }` | `reported` / 降级 `estimated` |
| 口碑 | `ratingSummary{ score, count }` | `reviews`（无评价时为 `null`，**不编**） |

索引：`location` 建 **2dsphere 地理索引**（控制台手工建，见 §5.3）；`poiId` 普通索引。
读权限：所有用户可读（小程序端直接读，走安全规则）；写一律走云函数。

### `availability_samples`（余位历史，预测的燃料）
`lotId`、`sampledAt`、`freeSpots`、`totalSpots`、`occupancyRate`、`source`。
索引：组合索引 `(lotId, sampledAt)`。
写入：定时触发器周期采样 `lots.availability` + 车场端每次上报时顺带落一条。

### `reservations`
`orderNo`、`userId`、`lotId`、`lotName`（快照，车场改名不影响历史单）、`plateNo`、
`arriveTime`、`enterDeadline`（= 到达 + 15 分钟）、`status`、`verifyCode`（核销用）、
`prepaidParkingFee`、`serviceFee`、`totalAmount`、改签字段（`rescheduledAt`、`rescheduleCount`，BR-03）、
时间戳组（`createdAt` / `paidAt` / `enteredAt` / `releasedAt`）。
索引：`(userId, createdAt)`、`orderNo` 唯一、`(lotId, status)`（车场端看板用）。
安全规则：前端只读自己的 —— `doc.userId == auth.openid`（`userId` 存 openid）。

### `orders`
`reservationId`、`userId`、`lotId`、`amount`、`type`（`'prepaid'` 预支停车费 / `'service'` 平台服务费）、
`status`、`paidAt`。索引：`(lotId, paidAt)`（对账结算按车场聚合）、`reservationId`。

### `payments`
`orderId`、`channel`、`amount`、`status`、`tradeNo`。
**唯一必要模拟点**：没有微信支付商户号（学生主体拿不到），支付回调由云函数模拟。
必须在界面与文档里说清「支付为模拟」，不可含糊成「已支付」。

### `reviews`
`reservationId`（唯一，一单一评）、`userId`、`lotId`、`score`(1–5)、`tags[]`、`content`、`createdAt`。
写入时云函数同步更新 `lots.ratingSummary`（见 §5.4）。

### `violations`
`userId`、`reservationId`、`type`（`'no_show'`）、`occurredAt`、`penalty`。
独立成表而非只累加计数，是为了可审计、能算梯度。

### 不建的表
- `lot_admins`：`users.role` + `lots.adminUserId` 足够
- `t_wallet` / `t_bind_pay`（旧表的余额与模拟免密签约）：**删**。凭空给余额是编数据，且无商户号时免密签约无意义
- `t_member`（月卡/年卡）：本轮不做，PM 里也不是核心闭环

## 5. 关键机制（受云开发的实际限制驱动）

> 本节结论来自 2026-09-14 对官方文档的核查。**核查方式为搜索引擎对官方页面的摘要，未能直读原文**
> （本机网络策略拦截了 `developers.weixin.qq.com` 与 `docs.cloudbase.net`），因此标注了「未查到官方说明」
> 的地方，实现前必须在控制台或官方页面复核。

### 5.1 可预约额度的并发扣减

官方明确：`stats.updated` 可判断「想要更新的记录是否真的被更新」，且 `_.inc()` 是数据库层的原子自增。
于是**不需要事务也能做正确的 CAS**：

```
where({ _id: lotId, reservedCount: _.lt(reservableTotal) })
  .update({ data: { reservedCount: _.inc(1) } })
→ stats.updated === 1 表示抢到额度，0 表示已满
```

注意官方同时说明：`updated === 0` **无法区分**「没匹配到」与「匹配到了但值没变」——本场景里后者不可能
（`_.inc(1)` 必然改变值），所以这个歧义不影响判定，但要在代码注释里写明这条前提。

**额度扣减与建单要在一起**：CAS 成功后再写 `reservations` + `orders`。这两笔写失败就要回补（`_.inc(-1)`）。
事务（`runTransaction`）也能做，但它**只在云函数可用**、且**事务内不能用 `where`，只能 `doc(id)` 定位**：
所以「CAS 抢额度」这一步用不上事务，只能在事务内 `doc(lotId).get()` 读当前值再判断。两种写法都正确，
**推荐前者**（CAS 一条语句、失败即返回，不必进事务），理由写进代码注释。

另：漏额度（CAS 成功但后续写单失败、回补又失败）要有兜底 —— 每日对账云函数按 `reservations` 重算
`reservedCount`（见 §5.5）。

### 5.2 状态机

沿用小程序 `domain/types.ts` 已有的六态，但**把 `violated` 从状态里去掉**：

```
pending_entry ──核销──▶ entered ──出场结算──▶ completed
      │
      ├──用户取消──▶ cancelled
      └──超时未入场──▶ released ──▶ 写 violations + users.credit.violationCount++
```

理由：「车位被释放」与「用户记违约」是两件事，一次超时同时发生。状态只表达车位侧的结果（`released`），
用户侧后果进 `violations`（可审计、能算梯度）。
代价：改 `domain/types.ts` 与相关测试 —— 列入 Plan 2 第 0 项一起做。

### 5.3 附近查询

`lots.location` 建 **2dsphere 地理索引**（必须手工在云开发控制台建，未查到云函数内建索引的官方 API；
CloudBase CLI 的 `tcb database index create` 可作替代，但属腾讯云文档，与微信环境不完全等同）。

索引建好后可用 `geoNear`（按距离排序）取附近签约车场 —— **这比现在每次都打腾讯 POI 更省配额**：
POI 只用于「搜任意目的地」，首页「我附近的签约车场」直接走库。
`geoNear` 的 `maxDistance` 单位是**米**；`geoWithin` 用 `centerSphere` 时半径单位是**弧度**（10km = 10/6378.1），
两者不同，容易写错。

### 5.4 评分与口碑因子

- `lots.ratingSummary` = 平台自有评价聚合，冷启动无评价时为 `null`，界面显示「暂无评分」，**不编一个数**
- `domain/scoring.ts` 的 `scoreLot()` 现在对 `!Number.isFinite(rating)` 直接给口碑因子 0 分 —— 这在有真实
  评分体系后是**系统性惩罚新车场**。Plan 2 要改：无评价时该因子的权重按比例重分配，或给中性值。
  （这是算法改动，要连测试一起改。）
- 是否把腾讯 POI 的评分作为冷启动兜底，**待定** —— 若用，必须标 `poi` 来源且与平台评价分开显示

### 5.5 定时触发器

- 配置在云函数目录的 `config.json` 的 `triggers` 数组里，`type: 'timer'`，`config` 是 **7 位 cron**
  （秒 分 时 日 月 星期 年），最小粒度到秒
- **cron 按 UTC+8 解读，但云函数运行时是 UTC+0** —— 不设环境变量 `TZ=Asia/Shanghai`，「每天 0 点」会跑成早上 8 点
- 官方提示网络不稳时可能**重复推送**同一条消息，任务要按消息 id 去重（幂等）
- 数量上限官方口径不一致（腾讯云文档写 10 个，旧教程写 1 个），**建的时候在控制台确认**

要写的三个任务：
1. **余位采样**（每 15 分钟）：把 `lots.availability` 落一条 `availability_samples`
2. **超时释放**（每 5 分钟）：把过 `enterDeadline` 且仍 `pending_entry` 的预约置 `released`、回补额度、写 `violations`、必要时更新 `users.credit.bannedUntil`（BR-01/02）
3. **每日对账**（每日一次）：按 `reservations` 重算每个车场的 `reservedCount`，修漂移

### 5.6 权限与安全规则

- **云函数以管理端身份运行，不受安全规则约束**；安全规则只约束小程序端的直连读写
- 安全规则可引用 `auth.openid`（典型写法 `doc.userId == auth.openid`）
- **前端查询条件必须是安全规则的子集**，否则直接拒绝（是拒绝，不是过滤）
- 分工：**前端只读自己的数据**（`users` / `cars` / `reservations` / `orders` / `reviews`），
  **一切写操作走云函数**。`lots` 与 `availability_samples` 前端可读、不可写
- 云函数内取用户身份用 `cloud.getWXContext().OPENID` —— `{openid}` 变量在云函数里失效

### 5.7 预测：实时余位 + 历史同期

```
预测(车场, 未来时刻 t) = 该车场过去 N 周中「同一星期几、同一时段」样本的中位数
无足量样本 → 降级为「当前实时余位」并在界面显著标注（BR-05）
完全无样本 → 显示「预测数据积累中」，不出柱状图
```

中位数而非均值：余位样本里偶发的 0（车场停业、上报缺失）会把均值拽下去。
冷启动期**不做任何补数**，如实显示积累中 —— 这条正是 BR-05「预测降级需界面显著标注」的落地，
答辩时是加分项而不是缺陷。

## 6. 与已交文档的差异（必须同步改口）

| 已交架构图 §2.4 / 外部服务 | 本方案 | 处理 |
|---|---|---|
| MySQL 8（业务主数据） | 云开发云数据库（文档型） | §3 降级决策表加一行 |
| Redis（会话 · 额度锁 · 余位缓存） | 云开发无 Redis；额度锁改 CAS 条件更新（§5.1），余位缓存由云数据库查询替代 | §3 加一行 |
| 对象存储 COS | 云存储（云开发自带） | 能力不变，改名字 |
| 定时任务（超时释放 · 违约结算） | 云函数定时触发器 | 原样成立 |
| 腾讯云托管 | 不需要（云函数即承载） | §3 加一行 |
| 短信服务（FR-U01 手机号验证码） | 微信身份为主，手机号退为可选 | PM 的 FR-U01 与架构图外部服务都要改 |
| 微信支付（订金与停车费） | 无商户号 → 模拟支付 | 文档与界面都必须写明「模拟」 |

按架构图 §3 自己的体例（「以上降级不改变业务能力覆盖，只改变实现形态」）补写即可。
**注意那份文档 §3 的原话：「无对应实现则答辩易被追问」** —— 改口要写实，不能只删不补。

## 7. 工作量与顺序（Plan 2 的建议切法）

1. **第 0 项：数据真实化**（先做，越晚改越贵）—— 退役 `toParkingLot()` 的哈希派生、
   落 `lots` 集合骨架、扩 `DataSource` 与 `sourceNote()`、卡片与详情逐处标清来源
2. 云函数地基：`getWXContext` 取身份、登录/role、统一错误与返回
3. 预约闭环：额度 CAS → 建单 → 支付（模拟）→ 核销（扫码/输码）→ 完成
4. 定时触发器三个任务
5. 历史同期基线预测 + 详情页预测柱（冷启动降级）
6. 评价 → 口碑因子接入（含评分算法的冷启动改动）

Plan 3（车场端）依赖本方案的 `lot_admin` 角色、余位上报与看板 —— **余位上报是车场端的第一个页面**。

## 8. 未定 / 待办

- **支付模拟的边界**：订单状态机里「已支付」是模拟的，界面文案怎么表述才不算谎报（待定）
- **腾讯 POI 评分是否作冷启动兜底**（§5.4）
- **车场端页面清单**（Plan 3，未写）
- **`backend/` 那 50 个 Java 文件的去向**：留作参考（JWT 思路、实体设计），代码不迁移
- **云开发环境与套餐**：基础套餐约 ¥19.9/月，免费额度口径不一（官方称小程序未上线期间可免费体验，
  活动截止 2026-12-31），**以购买页当前规则为准**

## 9. 实现前必须复核的官方细节

无法直读官方原文（见 §5 开头说明），以下条目**在写代码前要在控制台或官方页面确认**：

1. 事务单次操作数/时长上限 —— 未查到官方说明
2. 「更新并返回新值」（findAndModify 类）—— 未查到，故 §5.1 的设计不依赖它
3. 官方是否推荐某种乐观锁写法 —— 未查到；§5.1 的 CAS 只用 `stats.updated` 这条官方明确定义的行为
4. 「每集合只能建一个地理索引」—— 未查到官方说明（该说法源自 MongoDB 文档）
5. 定时触发器数量上限与最小间隔 —— 上限说法冲突，最小间隔无条款
6. 唯一索引下**两个 `null` 也不允许**（官方明示）—— 任何可能为空又要唯一索引的字段都要当心
   （如 `cars.plate_no` 选了组合唯一索引 `(user_id, plate_no)`，两者都必填，不受影响）
7. 索引字段大小上限 1024 字节、正则查询走不了索引
