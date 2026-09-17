# Direction contract — web-admin 视觉重做（开发用，不随产物发布）

## THESIS
把「Element Plus 套皮的渐变后台」重做为 **城市停车调度中枢（Urban Parking Ops Hub）**：
运营人员在调度室长时间使用，浅色工作区承载数据，深海军蓝导航脊作为「控制室」画框；
视觉权威来自停车导视灯语系统（空闲绿 / 紧张琥珀 / 满位红 / 品牌蓝青信号），拒绝通用蓝紫渐变卡片墙。

## OWN-WORLD
- 深海军蓝侧栏（#0a1530 → #0d1c40，顶部径向青光），浅色冷调画布 #f2f5fa，表面纯白。
- 品牌信号：蓝 #2563ff → 青 #06b6d4（替代蓝→紫）；状态灯：#10b981 / #f59e0b / #f43f5e / #64748b。
- 数字用 Bahnschrift / DIN 风格等宽数字栈，中文 PingFang/雅黑；12–16px 卡片半径，细边 + 柔影二选一。
- 自绘 SVG：P 导视 Logo、环形图、漏斗、余位量规、车牌芯片、票据齿孔。禁止 emoji/渐变文字/CSS 假图。

## STORY
运营登录即见「调度中枢」：登录页用真实智慧车库摄影建立信任；内页 3 秒内识别
车场状态、预约流转、核销与余位；表格里车牌=车牌芯片、余位=灯语进度、来源=如实徽标；
打印凭证是一张可撕票据。所有数字与口径来自现有云函数，不发明趋势/客户/能力数据。

## FIRST VIEWPORT
- 登录：左 46% 品牌图（AI 智慧车库摄影 + 深蓝青渐变压暗，P 标 + 标题 + 三条能力），右白色登录卡。
- 内页：深色侧栏（Logo+分组导航+底部托管状态），顶部面包屑+用户；
  Dashboard 首屏 = 4 枚紧凑 KPI（图标芯片+大数字+灯色）+ 左环形状态分布（中心总数）+ 右余位量规，
  下接预约漏斗；车场页首屏 = 搜索条 + 含余位灯条/车牌式信息的高密度表格。

## FORM
Operate（后台）+ Persuade（登录）。code-led（impeccable 引擎不可下载，concept-seed 无法运行）；
登录 hero 为 AI 生成图，作为该页 north-star。签名交互：侧栏激活滑块、数字 count-up、
图表描边生长、票据弹出。FINISH: unreviewed and undocumented is unfinished; this build ends
with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## 约束
- 只改 web-admin/；不碰 miniprogram/、cloudfunctions/、backend/。
- 字段名、状态机、金额口径、模拟支付/示例数据标注、写操作云函数路径全部不变。
- 不新增运行时依赖；图表/Logo 手写 SVG；构建须过 vue-tsc + vite build。
