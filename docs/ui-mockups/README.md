# UI 稿 v1 · 公共停车场预约系统小程序

依据 2026-09-10 定稿的 PM 文档（`02-需求分析与设计方案-23软工2班第4组.docx`）需求分析章节绘制。

## 文件

| 文件 | 说明 |
|---|---|
| `screens.html` | 12 屏总览画廊。直接双击用浏览器打开。加 `#only-6` 只显示第 6 屏（逐屏导图用的模式） |
| `all-screens.png` | 12 屏总览图 |
| `screens/01..12-*.png` | 单屏图，2 倍分辨率（750px 宽） |

## 已确定的决策

- **视觉方向**：秩序科技蓝（主色 `#2563EB`，深 `#1E3A8A`）
- **角色**：单小程序，首次进入全屏选身份 → 写入 storage → `custom-tab-bar` 按角色重建；切换入口在「我的」
- **车主端 tab**：3 个（首页 / 订单 / 我的），遵循 PM FR-U11 把「待入场 / 进行中 / 已完成 / 违约」归为单一「订单中心」模块
- **首页**：地图铺满 + 底部可上拖面板 + 悬浮搜索框 + 排序 chips（综合 / 距离 / 价格 / 空位）
  - ⚠️ 技术风险：`map` 是原生组件，当前骨架用 Skyline 渲染，浮层压地图可能踩坑。实现第一步先做最小验证页；撑不住退回「固定上下分栏」（上地图 37% / 下列表）
- **免费 / 付费分层**：免费 = 搜索、智能推荐、导航前往；付费 = 预约锁位
- **页面动作**：车场卡片与详情页都有两个动作 —— 「导航前往」（免费）与「预约车位」（付费）
- **搜索页**：地图搜索（上地图 + 结果 pin）+ 智能推荐（推荐 pin 高亮 + 推荐理由标签）+ 排序 chips（综合推荐 / 距离最近 / 费用最低 / 空位最多）
- **预约路径**：两屏（车场详情 → 预约确认）
- **预约规则**：只选**到达时刻**，窗口 `[现在, 现在+2h]`，超出不给约；入场截止 = 到达时间 + 15 分钟
- **计费**
  - `预支停车费` = **预留小时数（向上取整，不足 1 小时按 1 小时）× 该车场首小时标准价**
  - 例（万象城首小时 ¥6）：10:00 约 11:00 到 → `1 × 6 = ¥6`；约 12:00 到 → `2 × 6 = ¥12`；约 10:40 到 → `¥6`
  - 平台代收后转付车场；出场时车场闸机按**实际停放时长**计费，预支款抵扣
  - `平台服务费` = **¥2**，平台收入，改签时不退还
- **车场端**：4 tab（看板 / 预约 / 车场 / 我的）；「收费配置」「对账结算」保留入口但标「即将开放」（搁置）

## 重新生成

```bash
# 单屏（第 N 屏，2x）
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --virtual-time-budget=2500 --window-size=375,842 \
  --screenshot="screens/0N-name.png" "file:///.../screens.html#only-N"

# 总览
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --virtual-time-budget=3000 --window-size=1700,2950 \
  --screenshot="all-screens.png" "file:///.../screens.html"
```

手机画布固定 375×812（iPhone X 逻辑分辨率），对应小程序 `750rpx = 375px`，即 `1rpx = 0.5px`。
