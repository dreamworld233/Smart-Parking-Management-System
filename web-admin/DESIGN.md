---
name: 智慧停车 · 平台运营后台（web-admin）
description: 城市停车调度中枢（浅色版）——浅色导航脊、冷调白工作区、蓝青信号色与停车导视灯语状态体系
colors:
  primary: "#2563ff"
  primary-deep: "#1a52e6"
  signal-cyan: "#06b6d4"
  sky: "#0ea5e9"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#f43f5e"
  info-slate: "#64748b"
  teal: "#0d9488"
  canvas: "#f1f4f9"
  surface: "#ffffff"
  surface-2: "#f8fafd"
  border: "#e6ebf3"
  border-strong: "#d8e0ec"
  ink: "#0f1b33"
  ink-2: "#55617a"
  ink-3: "#93a0b5"
  rail: "#ffffff"
  rail-2: "#f4f7fd"
  rail-text: "#55617a"
  rail-text-strong: "#0f1b33"
typography:
  display:
    fontFamily: "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',system-ui,sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',system-ui,sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',system-ui,sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  numeric:
    fontFamily: "'Bahnschrift','DIN Alternate','Roboto Condensed','Segoe UI',sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.01em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "#111827"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-gradient:
    backgroundColor: "#111827"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px 22px"
  tag-success:
    backgroundColor: "#eafaf3"
    textColor: "{colors.success}"
    rounded: "999px"
    padding: "3px 10px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "36px"
---

# Design System: 智慧停车 · 平台运营后台（web-admin）

> 适用范围：仅 `web-admin/`（Vue 3 + Vite + TS + Element Plus 运营后台）。
> 微信小程序端、云函数、后端不在本设计系统约束范围内，也不得因视觉改动而触碰。
> 本文档从已建成的界面与 `src/styles/theme.css` 反向记录，是后续新增页面/组件的视觉准绳。

## Overview

**Creative North Star：“城市停车调度中枢（Urban Parking Ops Hub）”**

运营人员每天在后台处理签约车场、预约流水、车牌核销与凭证打印，界面应当像明亮的城市停车调度室：浅色（白→冷雾蓝）导航脊是清爽的操作台边界，冷灰蓝工作区承载数据卡片，蓝→青的信号渐变是系统在线的脉搏，绿/琥珀/红/灰四色灯语直接复用停车场诱导灯的语义——空闲、紧张、满位、待上报。状态不需要阅读文字，扫一眼颜色与灯点就知道哪个车场需要介入。全站 chrome 保持浅色；深蓝仅作为品牌色出现在渐变主行动、激活菜单项，以及登录主视觉照片、打印凭证票头这类“品牌信物”上。

内页全部是 **Operate** 模式：可扫描性、一致性、原生控件预期高于表现欲，品牌感藏在精确的数字字体、灯语状态色、导航激活 pill 的青色光点和票据/车牌这些业务专属组件里。登录页是唯一的 **Persuade** 时刻：写实智慧车库主视觉 + 玻璃拟态能力项，向运营方证明这是一个真实、现代、可托管的调度系统。

- **Key Characteristics：**
- 浅色（白→冷雾蓝）固定导航脊 + 冷灰蓝工作区，发丝线分隔即信息分区，全站 chrome 浅色
- 蓝→青信号渐变只用于品牌与主行动（激活菜单、主按钮），不大面积铺色
- 状态色严格对齐停车诱导灯语：空闲绿 / 紧张琥珀 / 满位红 / 待上报灰
- 金额、余位、核销码等所有数字使用 DIN/Bahnschrift 风等宽数字栈
- 车牌芯片、余位灯条、票据凭证、来源药丸为业务专属组件，不拿通用标签顶替
- 深蓝只保留在品牌信物上（登录车库主视觉照片、打印凭证票头），不作为界面底色
- 不使用 emoji，不使用 CSS 渐变假图；Logo 与图表全部手写 SVG，不新增前端依赖
- 所有占位/示例数据必须可见地标注「示例数据，待核实」

## Colors

冷调、克制、带控制室气质的配色：深色区域负责“框住注意力”，浅色区域负责“承载操作”，信号色只在需要行动或状态判断时点亮。

### Primary
- **信号蓝 Signal Blue**（#2563ff）：品牌主色，Element Plus primary 全量映射（含 light-3/5/7/8/9 与 dark-2 浅深阶）；主按钮、激活态、链接、焦点环、选中数字。
- **深信号蓝**（#1a52e6）：主按钮 hover/按下与渐变深端。
- **诱导青 Signal Cyan**（#06b6d4，软底 #cffafe）：渐变收束色、激活 pill 的光点、OCR/核销等“信号识别”语义点缀；与蓝构成品牌渐变 `linear-gradient(132deg,#2563ff,#0ea5e9 56%,#06b6d4)`。
- **天路蓝 Sky**（#0ea5e9）：品牌渐变中间档，不单独作为交互色使用。

### Secondary（语义灯语）
- **空闲绿 Free Green**（#10b981，EP success 全阶）：余位充足、已完成、已核实、OCR 成功。
- **紧张琥珀 Tight Amber**（#f59e0b，EP warning 全阶）：余位紧张、待入场、核销码、需要留意的告警。
- **满位玫红 Full Rose**（#f43f5e，EP danger 全阶）：满位/已释放、停用、退款负数文字、删除类行动。
- **石板灰 Slate**（#64748b，EP info 全阶）：已取消、待上报、夜间费率月亮图标等中性/休眠语义。
- **墨青 Teal**（#0d9488，软底 #e6f6f4）：看板“已完成”环段等需要与绿区分的正向统计色。

### Neutral
- **画布冷灰蓝 Canvas**（#f1f4f9）：工作区底色。
- **表面白 Surface**（#ffffff）/ **次级表面**（#f8fafd）：卡片、表格、弹窗、输入框底。
- **边框 Hairline**（#e6ebf3）/ **强边框**（#d8e0ec）：卡片描边、分隔线、表格底线。
- **墨色文字三级**：#0f1b33（标题/主数据）、#55617a（正文/次要列）、#93a0b5（占位/辅助说明）。
- **导航脊浅色双档**：#ffffff → #f4f7fd 纵向轻渐变；右侧 1px #e6ebf3 发丝分隔；文字 #0f1b33（品牌名）/ #55617a（菜单项）/ #6b789c（分组标签与脚注）；hover 浅蓝底 #edf3ff + 信号蓝字；品牌区仅有极淡蓝色径向光氛（rgba(37,99,255,.08)）。
- **深色品牌信物（不属于 chrome 底色）**：登录主视觉照片上的文字压暗遮罩、打印凭证票头的深蓝青渐变（#0a1530→#123a8f→#0e7490）保留深色，是照片/票据的物理语义。

### Named Rules
**The Signal Scarcity Rule（信号稀缺原则）.** 蓝青渐变全屏幕最多出现在：导航激活项、1 个主行动按钮、品牌标识。渐变不是装饰底纹，禁止用于卡片背景或大面积区块。
**The Lamp Language Rule（灯语不二义）.** 绿/琥珀/红/灰的含义全局唯一：空闲-绿、紧张-琥珀、满位/危险-红、待上报/休眠-灰。任何新状态必须先归入四灯语之一，不得自造第五种状态色。
**The Placeholder Honesty Rule（示例可识别）.** 来源为 `placeholder` 的数据必须同时出现琥珀色「示例·待核实」药丸（`SourceBadge`），不得在视觉上与已核实数据等权。

## Typography

**Display/Body Font：** PingFang SC / Hiragino Sans GB / Microsoft YaHei / Segoe UI 系统中文栈（不引入网络字体，保证内网与托管环境可用）。
**Numeric Font：** Bahnschrift → 'DIN Alternate' → 'Roboto Condensed' → Segoe UI（.num 工具类），所有金额、余位、配额、百分比、核销码使用，呈现调度屏数字质感。

**Character：** 中文用系统无衬线保证清晰与零加载成本；数字用窄身 DIN 风字体让表格列对齐、票据金额像打印出来的计费读数。标题用 800 字重与 -0.01em 收紧字距，形成“调度屏标题”的力度。

### Hierarchy
- **Display**（800，28px，lh 1.25）：页面大标题（.page-head__title）。
- **Title**（700，17px）：卡片标题、弹窗标题、分区标题。
- **Body**（400，14px，lh 1.5）：表格、表单、正文；辅助正文 13px（#55617a）。
- **Label**（600，12–13px）：表头、分组标签、按钮文字、药丸标签；表头为冷灰蓝大写感小字（中文不转大写，靠字重与颜色）。
- **Numeric**（600，14–28px）：KPI 数字 28px 起；表格金额/余位 14px；核销码 16px + 0.22em 字距。

### Named Rules
**The Tabular Number Rule.** 任何会纵向比较的数字（金额、余位、配额、百分比）必须走数字栈并右对齐或等宽排列；退款负数用满位玫红，正数收入用墨色或信号蓝，禁止出现双负号。
**The No-Emoji Rule.** 状态与操作一律用 Element Plus 线性图标 + 灯点，禁止 emoji 字符。

## Layout

- **固定脊 + 流动工作区**：左侧 240px 浅色导航脊固定（白→冷雾蓝渐变、发丝右边框；Logo 区、两组菜单「运营作业 / 数据与系统」、底部托管状态），右侧为顶栏（面包屑 + 角色 chip + 退出）+ 主内容。
- **内容节奏**：主内容内边距 24px；页面顺序固定为 页头（标题 + 副标题 + 右侧行动）→ 工具卡/告警条 → 数据卡。卡片间距 16–20px，卡片内边距 20–22px。
- **表格密度**：Operate 模式优先一屏看全。车场表 8 列、订单表 9 列、打印表 7 列，列宽以 min-width 精确配给（如车场 172/172/138/144/132/82/92/164）；操作列不使用 fixed 钉固（窄屏钉固列会与数据列穿透重叠），超宽时整表横向滚动。
- **弹窗**：表单弹窗宽 560–640px，票据/明细弹窗按内容定宽；分区用标题 + 横向发丝线分隔；≤680px 时弹窗占 92vw。
- **响应式断点**：≤1080px 导航脊收成 72px 图标轨（仅图标 + 激活 pill，悬停出 tooltip）；≤900px 登录页切换为单列移动版（全出血深色品牌头 + 居中表单）；≤720px 顶栏精简、卡片内边距收窄、表格横向滚动。
- **看板栅格**：KPI 四等分、图表 2:1 主从两栏、窄屏自动堆叠。

## Elevation & Depth

混合策略：**深色导航脊本身就是最大的层级锚点**，浅色区靠“表面白 + 1px 发丝边 + 柔阴影”三层表达抬升，阴影统一偏蓝墨色（rgba(16,33,67,*)），不用中性灰投影。

### Shadow Vocabulary
- **sm**（`0 1px 2px rgba(16,33,67,.05)`）：表格内嵌控件、芯片 resting。
- **md**（`0 8px 24px rgba(16,33,67,.08)`）：卡片 resting、下拉。
- **lg**（`0 20px 48px rgba(16,33,62,.16)`）：弹窗、弹层。
- **brand**（`0 8px 20px rgba(37,99,255,.28)`）：主行动按钮（渐变按钮）专属，表达“可执行的信号”。

### Named Rules
**The Hairline-Before-Shadow Rule.** 卡片优先用 1px #e6ebf3 描边 + 极轻 sm/md 阴影；只有浮层（弹窗/下拉）才允许 lg 阴影。禁止给静态卡片重投影。

## Shapes

- 圆角阶梯：控件 8px、卡片/输入区 12px、大卡片与弹窗 16px、品牌容器/票据 20px；药丸（状态标签、来源标签、车牌芯片）999px 全圆。
- 导航激活项为 10px 圆角渐变 pill，右侧带 6px 青色光点（132deg 蓝青渐变 + brand 阴影）。
- 车牌芯片：蓝渐变底、白字、圆角 6px、字距 0.5–1px，小号 `.plate--sm` 用于表格。
- 票据凭证：20px 圆角白卡，顶部深蓝青票头（圆角只保留上两角），中部虚线撕线，底部费用合计区；`@media print` 仅输出 `.print-area`。
- 余位灯条：细高进度条，填充色随灯语（绿/琥珀/红），空数据显示灰底「待上报」而非 0%。

## Components

### Buttons
- **Shape：** 8px 圆角、36px 高、12–18px 横向内边距、14px/600 字重，图标与文字间距 6px。
- **Primary：** **黑白色系**——近黑底 #111827 + 白字 + 黑色系柔影（rgba(17,24,39,.22)），hover 深灰 #374151 并轻微上移、active 纯黑 #000000；全站主按钮（页头行动、弹窗确认、登录）统一，不再使用渐变。
- **Secondary / 文字按钮：** 白底发丝边或纯文字；表格行内动作用文字按钮 + 线性图标（编辑=蓝、改价=琥珀、停用=玫红）。
- **Focus：** 信号蓝焦点环；危险操作按钮走 danger 全阶。
- **Disabled：** 灰底 #e5e7eb + 灰字 #9ca3af。

### Cards / Containers
- 白底、16px 圆角、1px #e6ebf3 描边、md 阴影、20–22px 内边距；卡头为 17px/700 标题 + 右侧口径/操作位。
- 次级容器（查询区、说明区）用 #f8fafd 底 + 发丝边，不与主卡抢层级。

### Inputs / Fields
- 白底、1px #d8e0ec 描边、8px 圆角、36px 高；focus 时描边转信号蓝并带浅蓝光晕。
- 数字步进器（价格、车位数）用 Element 输入框组，−/+ 按钮浅灰底；禁用态降透明度。
- 前缀图标（用户、锁、车牌、订单号）用石板灰线性图标。

### Navigation
- 浅色固定脊：白→#f4f7fd 轻渐变 + 右侧发丝边；分组标签 11px #6b789c；菜单项 14px 默认 #55617a，hover 浅蓝底 #edf3ff + 信号蓝字；激活项为蓝青渐变 pill + 白字 + brand 阴影 + 右侧青色光点（浅色底上唯一的高饱和块，不超过一个）。
- 移动端品牌头（≤900px 登录页）：白→#eef4ff 浅色渐变 + 底部发丝线，深色文字，Logo 保持彩色。
- 顶栏：半透明白（rgba(255,255,255,.92) + 毛玻璃）、面包屑（灰蓝，当前页加粗墨色）、右侧角色药丸（平台运营/车场运营）+ 渐变圆形头像 + 退出图标。
- ≤1080px 收为 72px 图标轨，图标居中，悬停 tooltip 显示名称。

### Tags / Chips
- **状态药丸 `.sp-tag`**：浅底 + 同色灯点 + 同色深字（success/warning/danger/info/primary/teal/outline 七变体），灯点 6px 圆点。
- **来源药丸 `SourceBadge`**：已核实=绿、运营声明=蓝、示例·待核实=琥珀（带警示图标与 title 全称）。
- **车牌芯片 `PlateChip`**：渐变蓝底白字，渲染格式「皖A·12345」。

### Signature Components
- **OccupancyBar 余位灯条**：free/total 计算占用率，≥阈值绿、中段琥珀、满位红；`freeSpots=null` 渲染「待上报」灰态，绝不显示 0。
- **票据凭证（Print）**：票头（LogoMark + 「智慧停车·预约凭证」+ 状态 pill）、车牌、车场、dl 信息行、琥珀核销码框、虚线撕线、费用行 + 玫红合计、脚注「支付为模拟」；打印样式隐藏其余界面。
- **资金流水时间线（Orders 明细）**：预支/服务费/退款三段，图标 + 状态时间戳，金额带符号着色（+蓝、−绿），合计为实际应收。
- **OCR 结果卡（Verify）**：成功=绿底对勾 + 车牌芯片 + 置信度进度条 + 匹配预约单；未匹配=琥珀提示并引导右侧手动核销；上传区支持拖拽、本地图片预览。
- **看板图表（Dashboard）**：手写 SVG 环形图（中心总数）、半圆 gauge（余位及时率）、状态漏斗（小值保留 96px 最小条宽，标注「同一时点快照，非队列转化率」）；KPI 数字 count-up，reduced-motion 下直接显示终值。
- **EmptyArt 空状态**：等距插画 + 标题 + 说明 + 默认插槽行动位（打印未查询、车场无数据等）。

## Motion

- 入场动效：路由切换 `sp-fade-up`（轻微上移 + 淡入），弹窗 `sp-pop`，数字 `sp-grow-x/width`，时长 180–320ms，缓动 cubic-bezier(.22,.61,.36,1)。
- **动效安全闸（必须保留，勿回退）**：`main.ts` 在挂载后双 rAF 为 `<html>` 加 `motion-ready`；`theme.css` 中 `:root:not(.motion-ready) * { animation:none!important }` 保证合成渲染/后台标签下内容永不冻结在首帧；`prefers-reduced-motion: reduce` 下 `animation:none!important; transition:none!important`，count-up 直接给终值。
- 动效只表达“内容就位”和“状态变化”，禁止循环装饰动画、禁止光斑闪烁类营销动效（Operate 模式）。

## Imagery & Assets

- 三张 AI 生成位图（Seedream 4.5），prompt 与来源声明记录在 `src/assets/img/PROVENANCE.md`：登录主视觉 `login-hero.jpg`（写实智慧地下车库，深蓝青灯光）、OCR 等距插画 `ocr-scan.png`、空车位等距插画 `empty-bay.png`。同色系、冷调、无文字水印；替换素材时必须保持蓝青灯语色调并更新 PROVENANCE。
- Logo、图标、图表为手写 SVG / Element Plus 图标，不引入图表库与图片依赖。
- `favicon.svg` 为蓝青渐变圆角 P 标。

## Do's and Don'ts

### Do:
- **Do** 新增页面时复用 `theme.css` 的 token 与共享类（.sp-tag / .plate / .num / .page-head / .toolbar / .hint / .page-alert）与五个共享组件。
- **Do** 让每个状态先匹配四灯语之一再上色；数字一律走数字栈。
- **Do** 对 `placeholder` 来源、模拟支付、mock 数据保留可见的「示例/模拟」标注。
- **Do** 保持 `motion-ready` 安全闸与 reduced-motion 分支；新增动画必须有“无动画也完整可见”的兜底。
- **Do** 新增 Element 图标后在 `node_modules/@element-plus/icons-vue` 类型定义中核实存在再全局注册（如 `Keyboard` 并不存在，已用 `EditPen` 替代）。
- **Do** 改完运行 `npm run build`（vue-tsc strict + noUnusedLocals/Parameters 全开）并用浏览器逐页/逐弹窗复查。

### Don't:
- **Don't** 改动 `miniprogram/`、`cloudfunctions/`、`backend/` 任何文件——视觉改造仅限 `web-admin/`。
- **Don't** 把深海军蓝（#0a1530/#0d1d44）重新用作侧栏、卡片、弹窗或页面底色：浅色模式下深色只允许出现在登录主视觉照片遮罩与打印凭证票头两处品牌信物。
- **Don't** 改动数据口径与字段语义（五状态、金额两位小数、epoch 毫秒时间、freeSpots=null=待上报、退款为负流水等）；视觉只重排呈现，不改业务逻辑。
- **Don't** 使用 emoji、CSS 渐变假装图片、纯装饰性紫蓝色（旧版 #635bff 蓝紫已废弃，月亮等中性图标用石板灰 #64748b）。
- **Don't** 新增 npm 依赖来实现图表/图标/动效；不要把表格操作列设为 fixed 钉固（窄屏会与数据列穿透重叠）。
- **Don't** 让入场动画承担内容可见性：任何 `animation-fill-mode: both` 的元素在动画被冻结时必须仍可见（由安全闸统一保证，勿在单页另写绕过）。
- **Don't** 把示例数据渲染得与已核实数据等权，或在票据/页面上出现真实支付承诺（支付为模拟）。
