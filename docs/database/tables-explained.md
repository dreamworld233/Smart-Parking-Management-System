# 数据库表结构说明

> 对应建库脚本：`schema-mysql.sql`（本机 MySQL 库名 `smart_parking`）
> 运行时实际存储是微信云开发云数据库（文档型），本库是同一数据模型的关系型翻译，字段一一对应。
> 设计依据：`docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`

## 全景：一张图看懂 11 张表

```
users（用户）────┬──< cars（车辆）
                 ├──< reservations（预约单）──< orders（资金流水）──< payments（支付单）
                 │        │                        └──< reviews（评价，一单一评）
                 │        ├──< entry_logs（核销留痕）
                 │        └──< violations（违约记录）
                 └──< lots（签约车场）──< availability_samples（余位历史）
                          └──< lot_price_changes（收费变更留痕）
```

## 逐表说明

### users — 用户
三种角色一张表：`driver`（车主）/ `lot_admin`（车场端）/ `ops_admin`（平台运营）。
车主身份就是微信 openid，不建密码列；只有车场管理员和平台运营才有 Web 后台登录名密码（`web_username` / `web_password`）。
`violation_count` + `banned_until` 落实业务规则 BR-02：累计违约 3 次停用 30 天。

### cars — 车辆
用户绑定的车牌。`(user_id, plate_no)` 组合唯一 —— 同一辆车可能被家人各建一条，所以车牌不全局唯一。

### lots — 签约车场（核心表）
库里只存**已签约、可预约**的车场，不存市面全量 POI（拿不到真实价格，编数据违反课程红线）。
字段按**数据来源**分组：

| 字段组 | 关键列 | 来源 |
|---|---|---|
| 身份 | `poi_id`、`name`、`lat`/`lng` | 腾讯地图 POI（客观真实） |
| 收费 | `first_hour_price`、`per_hour_after`、`cap_per_day` 等 | 车场公示价人工录入，留截图存证 |
| 运营 | `facilities`、`open_hours`、`reservable_total`/`reserved_count` | 平台运营配置 |
| 实时余位 | `free_spots`、`total_spots`、`reported_at` | 车场端上报 |
| 口碑 | `rating_score`、`rating_count` | 平台自有评价聚合 |

两个刻意设计：
- `free_spots` 允许 NULL = **未上报**，界面显示「待上报」，绝不显示 0 或编造数
- `rating_score` 允许 NULL = 无评价，界面显示「暂无评分」，不编一个数

`reserved_count` 的扣减在云端用数据库层原子自增 + 条件更新（CAS）实现，防超卖。

### availability_samples — 余位历史采样
预测的燃料。定时器每 15 分钟把各车场当前余位落一条，车场端每次上报也顺带落一条。
预测算法 = 同一星期几、同一时段的历史中位数；样本不足就降级显示实时值并标注，**不做任何补数**。

### reservations — 预约单（闭环主干）
用户 → 车场 → 时段 → 车牌 的预约记录。状态机：

```
pending_entry ──核销──▶ entered ──▶ completed
      ├──用户取消──▶ cancelled
      └──超15分钟未核销──▶ released
```

注意 `violated` **不是状态**：「车位被释放」（released）和「用户记违约」（violations 表）是两件事，超时同时发生。
金额三列：`prepaid_parking_fee`（锁位费，代收转付车场）+ `service_fee`（平台服务费 ¥2，唯一收入），预约时一次收清。
退款公式：`max(0, (预约时长 − 已占用时长)) × 首小时单价`；下单 10 分钟内取消全额退（含服务费），之后服务费不退。

### orders — 资金流水
预约成立时落两笔（`prepaid` / `service`），退款落一笔**负数** `refund`。
不分退款表：车场结算和平台收入按同一张流水聚合，正负相抵天然正确。

### payments — 支付单
**全程模拟**：学生主体拿不到微信支付商户号，支付/退款回调由云函数模拟。界面与文档必须写明「支付为模拟」。

### reviews — 评价
一单一评（`reservation_id` 唯一）。写入时同步更新 `lots.rating_score` / `rating_count` —— 评分是聚合出来的，不是人工填的。

### lot_price_changes — 收费变更留痕
每次收费改动存改前/改后值 + **公示价照片**。答辩被问「收费数据从哪来」，直接翻这条链。

### entry_logs — 核销留痕
核销走三级降级链：车牌 OCR 自动 → 扫/输核销码 → 车场端手动确认。一次核销可能先识别失败再输码成功，独立成表才能看见**整条尝试链**。

### violations — 违约记录
两种类型：`no_show`（到达 +15 分钟未核销）/ `late_cancel`（晚于到达时刻才取消）。
独立成表而非只累加计数 —— 可审计、能算梯度。

## 不建的表（与云端一致，答辩主动讲）

| 表 | 不建的原因 |
|---|---|
| 逐车位表 | 拿不到车场内部车位级数据，做了就是编 |
| 钱包 / 免密代扣 | 平台不做二次扣款，无商户号时也无意义 |
| 月卡年卡 | 不在核心闭环内 |
| 车场管理员表 | `users.role` + `lots.admin_user_id` 足够 |
