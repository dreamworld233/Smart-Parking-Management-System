# Plan 2a：数据真实化 + 云开发地基 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 退役哈希派生的假数据，落「签约车场库」（微信云开发），首页/搜索列表改为只显示真实签约车场，每个展示字段都能回答「从哪来」。

**Architecture:** 云开发（云数据库 + 云函数）承载 `lots` / `users` 等集合；小程序端直读 `lots`（安全规则只放读），一切写走云函数；领域层 `ParkingLot` 类型扩成可空的「未上报/暂无评分」三态，评分冷启动按权重重分配。列表口径：**只显示签约车场**（用户 2026-09-14 拍板），POI 检索仅用于「搜目的地」。

**Tech Stack:** 原生小程序（TS + Skyline + glass-easel）、微信云开发（wx-server-sdk，云函数用 CommonJS JS）、Jest（离线单测 stub `wx`）。

**上游依据：**
- `docs/superpowers/specs/2026-09-14-smart-parking-data-model-design.md`（数据模型，本文多处引用其 §号）
- 用户 2026-09-14 本轮拍板：两份计划切分（2a/2b）；列表只显示签约车场；种子车场**实现时再定**；余位冷启动显示「待上报」；费用试算并入预约确认（2b 范围）。

---

## 执行进度（2026-09-15 早，更新至 Task 5 代码部分）

**本文件的 `- [ ]` 是原始步骤清单，不随执行翻勾**；实际进度以本节为准（Task 2 起一直这么做）。

| Task | 状态 | 提交 |
|---|---|---|
| Task 0 云开发开通与地基 | ✅ | `48f2558` |
| Task 1 initDb + 集合与安全规则 | ✅ | `0f6fdad` |
| Task 2 领域层真实化 | ✅ | `51b2b96` |
| Task 3 geo.ts + lot.ts 重写 | ✅ | `4fed08a`、`5ca38eb`（复核后修复） |
| Task 4 login + ensureLogin | ✅ | `7674d36`、`78e00a8`、`3d120f4` |
| Task 5 seedLots 种子 | **代码与数据就绪、未部署** —— 4 家车场（较候选少 1 家，见下）用 `placeholder` 暂定值写入（用户 2026-09-15 早拍板：先跑通链路、界面照实标「示例数据，待核实」）；下一步部署 → 云端测试 → 控制台核对 | 见本节下方 |
| Task 6 页面接入 + 真机验收 | 未开始（需用户在场；接入代码 Task 3 已顺带改完，独立剩两条空态文案） | — |

**云上现状**（这些只存在于云开发控制台，不在 git 里，换环境要重建）：环境 `cloud1-d8gzxlbnq9a5cbf75`；11 个集合已建；**安全规则 11 条已按 Task 1 Step 4 口径配好**；`login` 已部署并端到端验收（`users` 出现一条文档，`_id` 与 `_openid` **都等于用户 openid**、`role: 'driver'`，重编译两次仍只有一条）。

**全量验证**：`npx tsc --noEmit` exit 0；`npx jest` 14 套件 205 用例全绿。已 `git push origin main`（`2f43ffc..3d120f4`）。

### Task 2 的两个坑

- **计划里的两个坑，当场修正而非照抄**（符合「计划规格必须先验算」约定）：
  1. 计划 Step 10 的「余位未上报」测试 `scoreLot(l, { allLots: [l], userNeedsCharging: false })` **漏了 `hasCharging` 形参**，编译不过；且断言 100 分需以 `lot()` 默认 `ratingSummary: null` 为前提，与同批「部分因子缺失」测试显式传 `ratingSummary: null` 矛盾。已定 `lot()` 默认 `ratingSummary: null` 并补 `hasCharging: false`。
  2. 计划 `sourceNotes` 的实现对 `pricing.source === 'public'` 也出「收费来源于车场公示价」标注（三种收费来源各有标签），因此「全真实为空数组」这条**不可达**、与实现矛盾。已把该测试改为「距离估算 + 收费公示价各自独立标注」，断言非空。
- **桥接超出了计划 Task 2 的文件清单**：`LotAvailability.source` 收窄到 `'public' | 'ops'` 后，旧 `services/lot.ts` 的 `source: 'estimated'` 过不了编译。为让 Task 2 独立提交且全绿，桥接把 `services/lot.ts` 的 `availability.source` 改 `'ops'`、`rating→ratingSummary: null`、`tags→facilities`，并同步改了 `tests/services/lot.test.ts` 的 3 处断言（计划把它俩都留给 Task 3）。Task 3 会整个重写 lot.ts。

### Task 3 的两个坑（派活前验算出来的）

1. **`cloudApi` 这个符号早已不存在**：本文件 Task 3 Step 5 写 `import { cloudApi } from './cloud'`、`const db = cloudApi?.database()`，但 `services/cloud.ts` 在 Task 0 里实际落成的是**懒取函数** `getCloudApi()`（注释写明：测试在 `beforeEach` 才 stub 全局 `wx`，模块加载时快照会让 stub 永不生效）。照抄会编译不过，已统一改成 `getCloudApi()?.database()`。
2. **测试桩漏了 `where`**：本文件 Task 3 Step 6 的 `collection()` 只挂了 `limit`，而实现是 `.where({'contract.status':'signed'}).limit(20).get()` —— 照抄则**每个用例都 `TypeError: ...where is not a function`**。已补上 `where`，并**补了一条断言「查询条件确实带 `contract.status`」**（原文从没验证过签约过滤，而那正是本任务的全部意义）。

### Task 3 复核后补的修复（`5ca38eb`）

- **路线覆盖会破坏「按距离升序」**：原实现是「估算排序 → 取 Top N → 原地覆盖 `distanceM` → 直接返回」，覆盖后没有重排。绕街区时真实路线可以比直线远得多，返回值就不再升序。今天两页拿到后会自己 `sortLots` 重排所以看不出来，但任何按返回顺序取「最近」的调用方会取错。已在覆盖后补一次排序（Top N 的选取依据仍是覆盖前的估算距离，所以是**排两次**）。
- **覆盖分支零测试覆盖、且靠巧合通过**：测试环境没有 `wx.request`，`qqmap.matrixChunk` 的 `catch` 会把 TypeError 吞掉返回 `[null]`，于是「路线覆盖」整段没被任何断言保护。已在桩里补 `wx.request`（按 `to` 参数下发，**未登记坐标下发缺项 → null**，让降级分支被刻意走到），补上「Top N 变 `route`、其外用接口耗时、Top N 之外仍是 `estimated`」的用例，并让矩阵数据**故意把顺序翻转**以钉住上式那条重排。复核员用变异测试独立验证：删掉重排那行，用例变红且输出与缺陷场景逐字吻合。

### Task 4 的坑（派活前验算出来的）

- **测试里 `data` 的必填/可选写反了**：本文件 Task 4 Step 1 把 `lastCall` 与 `respond` 的 `data` 写成必填，而 `CloudApi['callFunction']` 的 `data` 是可选的，照抄四处 TS2322。已把两者收成同一个 data 可选的类型。同批把 `NO_CLOUD` 分支也补了用例（那是「基础库过低」的真实降级路径，原计划没测）。

### Task 4 评审揪出的两处必须修

1. **`userId` 返回的是 `users` 文档 `_id`，语义错了。** 设计稿 §4 第 116 行与 Task 1 Step 4 已配好的安全规则都要求 `userId` **存 openid**（`cars`/`reservations`/`orders`/`reviews` 的规则是 `doc.userId == auth.openid`）。2b 照「以 `ensureLogin()` 返回的 `userId` 为身份前提」写预约，安全规则会**永远比不中**，而 CloudBase 规则不能跨集合查 `users`，只能现在统一。已改成两个分支都返回 `OPENID`。
2. **`_openid` 上没有唯一索引，「先查后插」并发下建两条、同一人两个身份。** `onLaunch` 的建档还没返回时角色页再调一次就会撞上（云函数冷启约 1s，这是常态）。身份分叉的后果是预约挂 A 条、`credit` 从 B 条读，**封禁静默失效**。已改成 `add` 时把 `_id` 钉成 `OPENID`，用主键唯一性堵死；冲突走回查，**查不到说明是真失败则原样重抛**（不吞成「已存在」）。`users._id` 从此等于 openid，**2b 不要再用 `doc(_id)` 当身份**。

### Task 4 部署时踩的两个坑

- `cloud.callFunction:fail errCode: -501000 FunctionName parameter could not be found`（`FUNCTION_NOT_FOUND`）= **那个环境里没有这个云函数**，不是环境配错（环境错会报环境找不到）。按序查：工具左侧树有没有该目录（没有 = 工具不认新加的目录，完全退出工具重开项目）→ 控制台云函数列表里有没有 → 是不是部署到了别的环境。
- **部署完云函数后要在工具里点一次「编译」再测**。本次就是漏了这步，看到 `FUNCTION_NOT_FOUND` 误以为部署失败。

### Task 5 的偏差（2026-09-15 早，写代码时逐条改的）

`cloudfunctions/seedLots/{index.js,seed-data.js,package.json}` 已落盘，**未部署**（等填价）。

1. **`availability.freeSpots` 从 `seed-data.js` 里删掉**（原规格每条都写 `freeSpots: null`）。`index.js` 恒写 `null` 入库，种子里配了也不生效 —— 留着只会让人以为改它有用。已在文件头注明「余位只由车场端上报」。
2. **`isComplete` 布尔判定改成 `missingFields(lot)` 返回字段名数组**。云端测试结果里直接能看到「还缺 `pricing.capPerDay`」，不必回头数哪一格还是 null。顺手补上原本没校验的 `name` / `address` / `location`（`index.js` 原先直接读 `lot.pricing.firstHour`，条目少写 `pricing` 会整段 TypeError 崩掉，而不是干净地跳过）。
3. **重跑不再改写 `contract.signedAt`**（原规格每次 `Date.now()`）。幂等的意思就是重跑无害，「什么时候签的」不该被种子的重跑改成今天。首次落库写 `now`，之后保留原值。
4. **5 家的 `address` / `location` 用 2026-09-15 实测补全**：原规格 Step 1 表格只有 poiId + 名称，Step 2 代码块只给了 2 家的完整地址坐标。以合肥大学南艳湖校区为中心、1 km 半径打了一次真接口（1 次搜索配额，临时 live 用例，用完即删），5 家逐字照抄，另看到「云际路道路停车场」「江淮发动机公司内部停车场」两条未入选（后者是内部场地，不适合签约）。
5. **`facilities` 的充电桩标签是中文 `'充电桩'`**，不是 `'charging'`：`domain/scoring.ts:244` 靠 `facilities.includes('充电桩')` 判定电动车的充电因子，写成英文会**静默**拿不到这分。已写进 `seed-data.js` 的填写说明。
6. **当前状态口径**：5 条全 `null`，此时跑 seedLots 的预期结果是 `{ written: [], skipped: [5 条，各带 missing 清单] }` —— 这是**正确**结果，不是失败。已用离线桩（覆盖 `Module._load` 假 `wx-server-sdk`）验证过三条：全 null 一条不写 / 填满一条写入且 `freeSpots` 恒 `null`、`contract.status: 'signed'` / 重跑不新增且 `signedAt` 不变。

**填价时的注意**：`reservableQuota` 是**平台可预约额度**（运营方给的数字），不是车场总车位；`pricing.source` 与 `availability.source` 各填各的，有公示价牌照到的 `'public'`、运营口头声明的 `'ops'`；核实方式记进 `note`（答辩讲数据出处用）。改完 `seed-data.js` 要**重新部署**才生效。

### Task 5 第二轮：把「暂定值」做成一条独立来源档（2026-09-15 早，用户拍板）

**背景**：实地未找到公示价牌，用户决定先用一轮暂定值把数据链路跑通。这与计划 Goal（「每个展示字段都能回答从哪来」）不冲突的前提是**暂定值必须自己说出来是暂定的** —— 否则等于把 Task 3 刚拆掉的哈希派生假字段换个地方装回库里，且库里的假数据与真数据长得一样，等真实公示价进来时分不出哪条是编的。用户在两案（沿用 `'ops'` + note 备注 / 新开一档来源）中选了**新开一档**。

1. **`LotPricing.source` 与 `LotAvailability.source` 各加一档 `'placeholder'`**（`domain/types.ts`）。`sourceNotes()` 对它出「收费为示例数据，待核实」「车位数为示例数据，待核实」，卡片与详情面板经 `sourceNotes` 原样显示（`lot-card.wxml` / `lot-detail.wxml` 的 `.card__tags`）。
2. **总车位数只在是示例值时才标注**：真实来源（`public` / `ops`）不标，标出来只是噪音；编的值不标就是骗人。
3. **`services/lot.ts` 的 `toParkingLot` 与 `seedLots` 的 `isSource` 同步放行 `'placeholder'`**，但**都不改写它** —— 有人把它规整成 `'ops'` 时，`tests/services/lot.test.ts` 的新用例会红。
4. **名单从 5 家减到 4 家**：`4911570620256777247`「合肥学院(南艳湖校区)停车场」与 `626521831643170859`「合肥大学(南艳湖校区)停车场」经用户确认是同一所学校（原合肥学院，2023 年更名合肥大学），腾讯地图里是两条重复 POI，保留名字与校区现名一致的后一条。
5. **暂定值一轮**（全部 `source: 'placeholder'`，`note` 写明「课程演示暂定值，未实地核实」）：合肥大学 3/2/15（总 200、额度 10）、金屿海岸地上 4/3/20（150、8）、润宜佳地下 5/3/30（320、15）、中德合作创新园地下 4/2/20（220、12），计费步长一律 60 分钟、无夜间费率。
6. **`facilities` 一律给 `[]` 而不是编一个 `['充电桩']`**：标签会作为推荐理由显示给用户（`scoring.ts` 的「有充电桩」），编它属于凭空向用户断言；给空数组至少不会多说。
7. **`reservableQuota` 目前没有 `source` 字段**，这一轮它同样是暂定值，只能在 `note` 里统一交代。**留作 2b 的待办**：额度也需要来源字段，否则真实额度与暂定额度在库里分不开。
8. **验证**：`tsc --noEmit` exit 0；`jest` 14 套件 **208 用例全绿**（新增 3 条：两档 placeholder 标注、总车位真实来源时不标注、placeholder 文档照常入库且 `source` 不被改写）；离线桩重跑确认 4 家全写入、`freeSpots` 恒 `null`、重跑幂等且 `signedAt` 不变、挖掉一个必填字段即被跳过。

**核到真实价格后要做的**：改 `seed-data.js` 的真值与 `source`（`'public'` / `'ops'`）、清掉 `note` 里的暂定说明、重新部署重跑。届时界面上的「示例数据」标注会自动消失 —— 这也是选这一档的理由：**假数据自己会喊自己是假的，不用靠人记得回来清理。**

---

## 与数据模型设计稿的偏差（记录在案，答辩口径）

| 设计稿原文 | 2a 实际做法 | 理由 |
|---|---|---|
| `lots.location` 存 GeoPoint + 2dsphere 索引 + geoNear（§5.3） | location 存**普通 `{lat,lng}` 对象**，暂不建地理索引、不用 geoNear：客户端直查全量签约车场（个位数），本地直线距离 × 绕行系数 | 客户端聚合对 geoNear 的支持在设计稿 §9 里本就标注「实现前必须复核」，未复核前不押；签约库个位数全拉无压力。扩容路径：签约车场多了再迁 GeoPoint + 控制台建 2dsphere + 云函数 geoNear |
| 把 `violated` 从 `ReservationStatus` 去掉（§5.2） | **推迟到 2b**（预约功能落地时随状态机一起改） | 现在没有任何代码产生该状态，先改只会空转 |
| 未签约 POI 车场进列表 | **退出列表**（用户拍板）：哈希退役后未签约车场没有收费/余位来源，展示全是「--」且不可预约 | `services/qqmap.ts` 的 `searchNearby` 仅剩搜索页「找目的地」一个用途 |
| 冷启动余位 | `freeSpots: null` → 界面显示「待上报」，评分的可用性因子权重重分配 | 用户拍板；车场端余位上报（Plan 3 第一个页面）上线后自动变真 |
| 收费/总车位来源只有 `public` / `ops` / `estimated`（§3） | 加第四档 **`placeholder`＝演示用暂定值**，界面标注「示例数据，待核实」 | 实地无公示价牌，用户 2026-09-15 拍板先用一轮暂定值跑通链路。单开一档是为了让「编的数据」在库里始终带着标记，能与真数据区分；塞进 `ops` 则两者再也分不开 |
| 种子车场「只录已核实条目」（Task 5 门槛） | 门槛保留，但白名单放行 `placeholder`；本轮 4 家全为暂定值 | 同上；未核实的字段（如 `null`）仍一律拒写 |

**种子车场名单**：用户拍板「实现时再定」。Task 5 里给出候选 POI（2026-09-14 真接口查的，字段真实）与核实清单，`seedLots` 云函数**拒绝写入未核实的条目**（关键字段为 null 不入库）——不编一条数据。

**云开发开通**：用户已去查免费额度；若最终不用云开发，本计划的 Task 0–1、Task 4–5 的载体要重议（自建库撞 ICP 备案墙，见数据模型稿 §1），**重议前不要开工 Task 3 以后**。

---

## 文件结构总览

| 文件 | 动作 | 职责 |
|---|---|---|
| `project.config.json` | 改 | 加 `cloudfunctionRoot` |
| `miniprogram/config.ts` / `config.local.example.ts` | 改 | 加 `CLOUD_ENV`（真值进 gitignore 的 `config.local.ts`） |
| `miniprogram/app.ts` | 改 | `wx.cloud.init` + 触发 `ensureLogin` 建档 |
| `miniprogram/domain/types.ts` | 改 | 类型真实化（ratingSummary 可空、facilities、freeSpots 可空） |
| `miniprogram/domain/format.ts` | 改 | `sourceNote` → `sourceNotes`（数组）、`formatSpots` 待上报、`formatRatingSummary` |
| `miniprogram/domain/scoring.ts` | 改 | 口碑/可用性冷启动权重重分配；`availabilityLevel` 加 `unknown` 档 |
| `miniprogram/domain/sort.ts` | 改 | 余位排序 null 落最后 |
| `miniprogram/domain/geo.ts` | 建 | `haversineM` |
| `miniprogram/domain/detail.ts` | 改 | `ratingText`、`sourceNotes` |
| `miniprogram/services/cloud.ts` | 建 | 云函数调用封装 + `wx.cloud` 最小类型 |
| `miniprogram/services/lot.ts` | 重写 | `fetchSignedLots`（查 `lots` 集合），哈希派生整段退役 |
| `miniprogram/pages/home/home.ts`、`pages/search/search.ts` | 改 | 换数据源、空态文案、`toVM` 适配 |
| `miniprogram/components/lot-card/*`、`lot-detail/*` | 改 | 来源标注数组化、待上报灰档、暂无评分 |
| `cloudfunctions/initDb/`、`cloudfunctions/login/`、`cloudfunctions/seedLots/` | 建 | 建集合 / 微信身份建档 / 种子写入（幂等） |
| `tests/domain/*`、`tests/services/*` | 改 | 对齐新类型与新契约 |
| `tests/live/lot.live.ts` | 删 | 它测的是 POI→哈希派生，宿主已退役；qqmap 的 live 测试保留 |

---

### Task 0: 云开发开通与地基（用户手动步骤 + 本地配置）

**Files:**
- Modify: `project.config.json`
- Modify: `miniprogram/config.ts`
- Modify: `miniprogram/config.local.example.ts`
- Modify: `miniprogram/config.local.ts`（不入库）
- Modify: `miniprogram/app.ts`

- [ ] **Step 1（用户操作）：开通云开发**

  微信开发者工具 → 工具栏「云开发」→ 开通 → 创建环境（记下环境 ID，形如 `qnt-xxxx`）。若控制台显示免费额度活动（官方称小程序未上线期间可免费体验，活动至 2026-12-31），按购买页当前规则为准。

- [ ] **Step 2：`project.config.json` 顶层加一行**

  ```json
  "cloudfunctionRoot": "cloudfunctions/",
  ```

  放在 `"miniprogramRoot"` 同级。加完后工具会识别云函数目录（左侧树出现 `cloudfunctions`）。

- [ ] **Step 3：`miniprogram/config.local.ts` 加环境 ID**

  ```ts
  export const QQMAP_KEY = '<现有值不动>'
  /** 云开发环境 ID。从开发者工具「云开发」控制台复制 */
  export const CLOUD_ENV = '<Step 1 拿到的环境 ID>'
  ```

  `config.local.example.ts` 同步加 `export const CLOUD_ENV = ''` 与注释（模板不入真值）。

- [ ] **Step 4：`miniprogram/config.ts` 读取环境 ID**

  在文件头部 `let localKey = ''` 的 try 块处改为：

  ```ts
  let localKey = ''
  let localEnv = ''
  try {
    const local = require('./config.local')
    localKey = local.QQMAP_KEY || ''
    localEnv = local.CLOUD_ENV || ''
  } catch {
    // config.local.ts 不存在：保持占位符
  }

  export const QQMAP_KEY = localKey || 'REPLACE_WITH_YOUR_KEY'

  /**
   * 云开发环境 ID。未配置（新克隆）时为空串，服务层据此给出明确报错，
   * 不做静默兜底 —— 环境配错的表现应该是「一句话说清」，而不是 undefined 行为
   */
  export const CLOUD_ENV = localEnv
  ```

- [ ] **Step 5：`miniprogram/services/cloud.ts`（本任务先建，Task 4 复用）**

  `wx.cloud` 的类型不在当前 typings 覆盖内，**不走全局 d.ts 扩张**，在服务层收一个最小接口，全项目只此一处碰 `wx.cloud` 的形状：

  ```ts
  /**
   * 全项目触碰 wx.cloud 形状的唯一入口。
   * 不扩全局 typings：云开发 API 面很大，d.ts 里抄官方签名迟早失配，
   * 这里只声明本项目实际用到的那一小块，多出来的能力一概不认
   */
  export interface CloudDb {
    collection(name: string): {
      where(cond: Record<string, unknown>): {
        limit(n: number): {
          get(): Promise<{ data: Record<string, unknown>[] }>
        }
      }
    }
  }

  export interface CloudApi {
    init(opt: { env?: string; traceUser?: boolean }): void
    callFunction(opt: { name: string; data?: Record<string, unknown> }): Promise<{ result: unknown }>
    database(): CloudDb
  }

  export const cloudApi: CloudApi | null = (wx as unknown as { cloud?: CloudApi }).cloud ?? null
  ```

- [ ] **Step 6：`miniprogram/app.ts` 初始化**

  ```ts
  // app.ts
  import { CLOUD_ENV } from './config'
  import { cloudApi } from './services/cloud'

  App<IAppOption>({
    globalData: {},
    onLaunch() {
      // 基础库过低等极端环境没有 wx.cloud：不崩，后续服务层调用会给出各自明确报错
      cloudApi?.init({ env: CLOUD_ENV || undefined, traceUser: true })
      // 会话与用户建档在 services/cloud 的 ensureLogin（Task 4）里做，这里只负责 init
    },
  })
  ```

- [ ] **Step 7：验证**

  Run: `npx tsc --noEmit` → exit 0。工具内编译，控制台无新报错。云函数目录此时还不存在，属正常。

- [ ] **Step 8：Commit**

  ```bash
  git add project.config.json miniprogram/config.ts miniprogram/config.local.example.ts miniprogram/app.ts miniprogram/services/cloud.ts
  git commit -m "chore(cloud): init cloud foundation and minimal wx.cloud typing"
  ```

---

### Task 1: initDb 云函数 + 集合与安全规则

**Files:**
- Create: `cloudfunctions/initDb/index.js`
- Create: `cloudfunctions/initDb/package.json`

- [ ] **Step 1：`cloudfunctions/initDb/package.json`**

  ```json
  {
    "name": "initdb",
    "version": "1.0.0",
    "main": "index.js",
    "dependencies": {
      "wx-server-sdk": "~2.6.3"
    }
  }
  ```

- [ ] **Step 2：`cloudfunctions/initDb/index.js`**

  ```js
  // 一次性初始化：建齐数据模型设计稿 §4 的全部集合。幂等，重复部署重跑无害。
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

  const COLLECTIONS = [
    'users',
    'cars',
    'lots',
    'availability_samples',
    'reservations',
    'orders',
    'payments',
    'reviews',
    'lot_price_changes',
    'entry_logs',
    'violations',
  ]

  exports.main = async () => {
    const db = cloud.database()
    const created = []
    const existed = []
    for (const name of COLLECTIONS) {
      try {
        await db.createCollection(name)
        created.push(name)
      } catch (e) {
        // 已存在会抛错：幂等语义靠它实现，其他错误照样抛出，别吞
        existed.push(name)
      }
    }
    return { code: 0, data: { created, existed } }
  }
  ```

- [ ] **Step 3：部署并执行**

  工具里 `cloudfunctions/initDb` 右键「上传并部署：云端安装依赖」→ 右键「云端测试」运行。预期返回：

  ```json
  { "code": 0, "data": { "created": ["users", "..."], "existed": [] } }
  ```

- [ ] **Step 4（用户操作）：控制台配置安全规则**

  云开发控制台 → 数据库 → 逐集合「权限设置」→ 自定义安全规则：

  ```json
  // lots、availability_samples：所有用户可读，写一律走云函数
  { "read": true, "write": false }

  // users：只读自己的（users 用 _openid 字段，不是 userId）
  { "read": "doc._openid == auth.openid", "write": false }

  // cars、reservations、orders、reviews：只读自己的
  { "read": "doc.userId == auth.openid", "write": false }

  // payments、lot_price_changes、entry_logs、violations：前端不直读
  { "read": false, "write": false }
  ```

  **注意**：默认的「仅创建者可读写」规则下，云函数写入的文档没有 `_openid`，小程序端**读不到** `lots` —— 这就是必须显式配规则的原因。

- [ ] **Step 5：Commit**

  ```bash
  git add cloudfunctions/initDb
  git commit -m "feat(cloud): initdb function creating all collections"
  ```

---

### Task 2: 领域层真实化（types / format / scoring / sort / detail / 组件）

> 编译耦合迫使它是一个大任务：类型一改，format/scoring/sort/pins/detail/两页 `toVM`/两个组件必须同批到位，`tsc` 才能重新变绿。步骤内部按依赖排序。

**Files:**
- Modify: `miniprogram/domain/types.ts`（重写）
- Modify: `miniprogram/domain/format.ts`
- Modify: `miniprogram/domain/scoring.ts`
- Modify: `miniprogram/domain/sort.ts`
- Modify: `miniprogram/domain/detail.ts`
- Modify: `miniprogram/components/lot-card/lot-card.wxml`、`lot-card.wxss`
- Modify: `miniprogram/components/lot-detail/lot-detail.wxml`
- Modify: `miniprogram/pages/home/home.ts`、`pages/search/search.ts`（仅 `toVM`/`CardVM`）
- Test: `tests/domain/{format,scoring,sort,pins,detail}.test.ts`（fixture 对齐）

- [ ] **Step 1：重写 `miniprogram/domain/types.ts`**

  ```ts
  export interface GeoPoint {
    lat: number
    lng: number
  }

  export interface LotPricing {
    /** 首小时标准价，单位元。预支停车费的单价基准 */
    firstHour: number
    /** 首小时之后的每小时单价，单位元 */
    perHourAfter: number
    /** 计费步长（分钟） */
    stepMinutes: 15 | 30 | 60
    /** 单日封顶，单位元 */
    capPerDay: number
    /** 夜间费率（22:00–次日 08:00），单位元，可缺省 */
    nightRate?: number
    /**
     * 收费数据来源。数据模型设计稿 §3：
     * - `public`：公示价（人工核实，存证在 lot_price_changes）
     * - `ops`：平台运营声明（不谎称实测）
     * - `estimated`：真估算（2a 之后理论上不该再出现，保留用于降级路径）
     */
    source: 'public' | 'ops' | 'estimated'
  }

  export interface LotAvailability {
    /**
     * 实时余位。**null = 车场端尚未上报**（数据模型 §4）：
     * 界面显示「待上报」，绝不显示 0，更不编数。
     * 注意 `null / totalSpots` 在 JS 里是 0，任何算空闲率的地方必须先判 null
     */
    freeSpots: number | null
    /** 总车位（公示或运营声明） */
    totalSpots: number
    source: 'public' | 'ops'
  }

  /**
   * 距离与步行时长的来源。
   * - `route`：路径矩阵查到的真实步行路线
   * - `estimated`：直线距离 × 绕行系数估算
   */
  export type DistanceSource = 'route' | 'estimated'

  /** 平台自有评价的聚合（数据模型 §5.4）。无评价时整体为 null，不编数 */
  export interface LotRatingSummary {
    /** 1–5，一位小数 */
    score: number
    /** 参与聚合的评价条数 */
    count: number
  }

  export interface ParkingLot {
    id: string
    name: string
    address: string
    location: GeoPoint
    distanceM: number
    walkMinutes: number
    /** 上面两个数的来源，页面据此决定是否标「估算」 */
    distanceSource: DistanceSource
    pricing: LotPricing
    availability: LotAvailability
    /** 车场开放的可预约车位数（运营配置；实时剩余随预约扣减，云函数维护） */
    reservableQuota: number
    /** 平台评价聚合。null = 暂无评价，界面显示「暂无评分」 */
    ratingSummary: LotRatingSummary | null
    /** 设施标签，签约时由运营录入（来源 ops），如 `['充电桩']` */
    facilities: string[]
  }

  /** 各维度得分均为归一化后的 0–1 数值；null = 该因子无数据，未参与本次加权 */
  export interface ScoreFactors {
    fee: number
    distance: number
    availability: number | null
    infra: number
    reputation: number | null
  }

  /** 推荐理由的整体基调，由领域层判定，页面据此选标签配色 */
  export type ReasonTone = 'good' | 'bad' | 'plain'

  export interface Recommendation {
    lot: ParkingLot
    /** 综合得分，四舍五入后的 0–100 整数（有效因子权重重分配后仍落在此区间） */
    score: number
    factors: ScoreFactors
    /** 可解释推荐理由的展示文案 */
    reasons: string[]
    /** 理由基调，页面不再自行推断 */
    tone: ReasonTone
  }

  export type SortKey = 'composite' | 'distance' | 'fee' | 'availability'

  // 注：'violated' 从状态机移除一事推迟到 2b（见计划头部偏差表）
  export type ReservationStatus =
    | 'pending_entry'
    | 'entered'
    | 'completed'
    | 'cancelled'
    | 'violated'
    | 'released'

  export interface Reservation {
    id: string
    orderNo: string
    lotId: string
    lotName: string
    plateNo: string
    /** ISO 字符串 */
    arriveTime: string
    /** 到达时间 + ENTRY_GRACE_MINUTES，ISO 字符串 */
    enterDeadline: string
    prepaidParkingFee: number
    serviceFee: number
    totalAmount: number
    status: ReservationStatus
    qrPayload: string
  }
  ```

  变化点：`DataSource` 全局枚举删除（`'rule'` 一并退役，无使用点）；`rating: number` → `ratingSummary: LotRatingSummary | null`；`tags` → `facilities`；`availability.freeSpots` 可空。

- [ ] **Step 2：`miniprogram/domain/format.ts` 三处改动**

  ① `sourceNote` 改为 `sourceNotes`（返回数组，卡片/详情逐条渲染成标签）：

  ```ts
  /**
   * 数据来源标注（数据模型设计稿 §3：每个字段必须能回答「从哪来」）。
   *
   * 返回数组而不是拼好的整句：不同来源对应不同语义（实测/公示/声明/待上报），
   * 混成一句「部分数据为估算」会把公示价也说成估算。
   * 空数组 = 没有要标的，调用方不渲染标签区
   */
  export function sourceNotes(lot: ParkingLot): string[] {
    const notes: string[] = []
    if (lot.distanceSource === 'estimated') notes.push('距离为估算')
    if (lot.pricing.source === 'public') notes.push('收费来源于车场公示价')
    else if (lot.pricing.source === 'ops') notes.push('收费为运营声明')
    else if (lot.pricing.source === 'estimated') notes.push('收费为估算')
    if (lot.availability.freeSpots === null) notes.push('余位待车场上报')
    return notes
  }
  ```

  ② `formatSpots` 待上报口径：

  ```ts
  /**
   * 余位展示。有上报时形如 `46/500`；**未上报（free 为 null）显示「待上报」**，
   * 不是 `--/500` 也不是 0 —— 「没数据」和「满了」是两句话（用户 2026-09-14 拍板）
   */
  export function formatSpots(free: number | null, total: number | null): string {
    if (free === null) return '待上报'
    return `${formatSpotCount(free)}/${formatSpotCount(total)}`
  }
  ```

  ③ 文件末尾新增评分聚合展示：

  ```ts
  /**
   * 评分聚合展示。无评价（null / 条数为 0 / 分数无效）显示「暂无评分」，
   * **不显示 0 分** —— 冷启动没有评价与「被评了 0 分」对车场是两种命运
   */
  export function formatRatingSummary(summary: { score: number; count: number } | null): string {
    if (!summary || !(summary.count > 0) || !Number.isFinite(summary.score)) return '暂无评分'
    return `★ ${summary.score.toFixed(1)}（${summary.count} 条）`
  }
  ```

- [ ] **Step 3：`miniprogram/domain/scoring.ts` 冷启动改造**

  ① `freeRate` 显式判 null（**这是本任务最容易埋的 bug：`null / totalSpots` 在 JS 里是 0**，不判 null 会把「未上报」算成「满员」）：

  ```ts
  export function freeRate(availability: LotAvailability): number {
    if (availability.freeSpots === null) return NaN
    const raw = availability.totalSpots === 0
      ? 0
      : availability.freeSpots / availability.totalSpots
    return Number.isFinite(raw) ? raw : 0
  }
  ```

  ② `availabilityLevel` 加 `unknown` 档（NaN 现在意味着「无数据」而非「紧张」）：

  ```ts
  export type AvailabilityLevel = 'ok' | 'warn' | 'bad' | 'unknown'

  /**
   * 空位展示档位。NaN（未上报 / totalSpots 缺失之外的无效值）归 unknown 灰档：
   * 缺数据的失败方向是「如实说没数据」，不是「宁可显示紧张」 ——
   * 余位从未上报时显示红色「紧张」是造谣，显示灰色「待上报」才是诚实
   */
  export function availabilityLevel(freeRate: number): AvailabilityLevel {
    if (!Number.isFinite(freeRate)) return 'unknown'
    if (isSaturated(freeRate)) return 'bad'
    if (freeRate <= FREE_FLOOR * AVAILABILITY_WARN_RATIO) return 'warn'
    return 'ok'
  }
  ```

  ③ `scoreLot` 改冷启动加权（口碑、可用性两因子可缺，**权重按有效因子重分配**，综合分保持 0–100）：

  ```ts
  export function scoreLot(lot: ParkingLot, ctx: ScoreContext): Recommendation {
    const weights = ctx.weights ?? DEFAULT_WEIGHTS

    const fees = ctx.allLots.map(l => l.pricing.firstHour)
    const minFee = Math.min(...fees)
    const maxFee = Math.max(...fees)

    const feeFactor = lowerIsBetter(lot.pricing.firstHour, fees)
    const distanceFactor = lowerIsBetter(lot.distanceM, ctx.allLots.map(l => l.distanceM))

    const rate = freeRate(lot.availability)
    const saturated = isSaturated(rate)
    // 余位未上报（NaN）时可用性因子整体缺席，而不是记 0 分 ——
    // 记 0 分是对「没数据」的系统性惩罚，与口碑同理（数据模型 §5.4）
    const availabilityFactor = saturated || Number.isNaN(rate)
      ? (Number.isNaN(rate) ? null : 0)
      : clamp01((rate - FREE_FLOOR) / (1 - FREE_FLOOR))

    const infraFactor = ctx.userNeedsCharging ? (ctx.hasCharging ? 1 : 0) : 1

    // 口碑冷启动：无评价为 null，不惩罚新车场（数据模型 §5.4）
    const summary = lot.ratingSummary
    const reputationFactor = summary && summary.count > 0 && Number.isFinite(summary.score)
      ? clamp01((summary.score - 4.0) / 1.0)
      : null

    const factors: ScoreFactors = {
      fee: feeFactor,
      distance: distanceFactor,
      availability: availabilityFactor,
      infra: infraFactor,
      reputation: reputationFactor,
    }

    // 有效因子权重重分配：缺一个因子就把它那份权重按比例分给剩下的，
    // 而不是当成 0 分。fee 与 distance 恒有值（权重合计至少 0.45），除零不可达
    let weightSum = 0
    let raw = 0
    const pairs: Array<[number, number]> = [
      [weights.fee, feeFactor],
      [weights.distance, distanceFactor],
      [weights.availability, availabilityFactor],
      [weights.infra, infraFactor],
      [weights.reputation, reputationFactor],
    ]
    for (const [w, f] of pairs) {
      if (f === null) continue
      weightSum += w
      raw += w * f
    }

    return {
      lot,
      score: Math.round((raw / weightSum) * 100),
      factors,
      reasons: buildReasons(lot, ctx, factors, saturated, minFee, maxFee),
      tone: toneFor(saturated, factors),
    }
  }
  ```

  ④ `toneFor` 与 `buildReasons` 里两处消费 `factors.availability` 的地方补 null 守卫：

  ```ts
  function toneFor(saturated: boolean, factors: ScoreFactors): ReasonTone {
    if (saturated) return 'bad'
    const availabilityGood = factors.availability !== null && factors.availability >= 0.6
    return availabilityGood || factors.fee >= 0.8 || factors.distance >= 0.8 ? 'good' : 'plain'
  }
  ```

  `buildReasons` 里第一段改为：

  ```ts
    if (saturated) {
      reasons.push('高峰紧张')
    } else if (factors.availability !== null && factors.availability >= 0.6) {
      reasons.push('空位充足')
    }
  ```

  ⑤ `topRecommendations` 里 `l.tags.includes('充电桩')` 改 `l.facilities.includes('充电桩')`。

  ⑥ 顶部 `import type` 里 `LotAvailability` 已有，无需新增导入。

- [ ] **Step 4：`miniprogram/domain/sort.ts` 余位排序 null 落最后**

  ```ts
  import type { Recommendation, SortKey } from './types'

  /**
   * 余位排序的比较值。未上报（null）取 -1：落在所有有数据的车场之后，
   * 但不删除 —— 「没数据」不该把车场从列表里挤出去
   */
  function spotsOf(r: Recommendation): number {
    const f = r.lot.availability.freeSpots
    return typeof f === 'number' && Number.isFinite(f) ? f : -1
  }

  const COMPARATORS: Record<SortKey, (a: Recommendation, b: Recommendation) => number> = {
    composite: (a, b) => b.score - a.score,
    distance: (a, b) => a.lot.distanceM - b.lot.distanceM,
    fee: (a, b) => a.lot.pricing.firstHour - b.lot.pricing.firstHour,
    availability: (a, b) => spotsOf(b) - spotsOf(a),
  }

  export function sortLots(recs: Recommendation[], key: SortKey): Recommendation[] {
    const compare = COMPARATORS[key] ?? COMPARATORS.composite
    return recs.slice().sort(compare)
  }
  ```

- [ ] **Step 5：`miniprogram/domain/detail.ts`**

  `LotDetailVM` 两处：`estimateText: string` → `sourceNotes: string[]`；新增 `ratingText: string`。`toDetailVM` 对应：

  ```ts
  import { formatAmount, formatDistance, formatRatingSummary, formatSpots, sourceNotes } from './format'
  // ……接口中：
  //   ratingText: string
  //   sourceNotes: string[]

  export function toDetailVM(rec: Recommendation): LotDetailVM {
    const { lot } = rec
    const nightRate = lot.pricing.nightRate
    return {
      lot,
      score: rec.score,
      reasons: rec.reasons,
      tone: rec.tone,
      distanceText: formatDistance(lot.distanceM),
      walkText: `${lot.walkMinutes} 分钟`,
      spotsText: formatSpots(lot.availability.freeSpots, lot.availability.totalSpots),
      freeClass: availabilityLevel(freeRate(lot.availability)),
      firstHourText: formatAmount(lot.pricing.firstHour),
      nextHourText: formatAmount(lot.pricing.perHourAfter),
      stepText: `${lot.pricing.stepMinutes} 分钟`,
      capText: formatAmount(lot.pricing.capPerDay),
      nightText: typeof nightRate === 'number' ? `¥${formatAmount(nightRate)}/时` : UNKNOWN,
      quotaText: Number.isFinite(lot.reservableQuota) ? String(Math.max(0, lot.reservableQuota)) : UNKNOWN,
      ratingText: formatRatingSummary(lot.ratingSummary),
      sourceNotes: sourceNotes(lot),
    }
  }
  ```

- [ ] **Step 6：两页 `CardVM` / `toVM` 同步**（`pages/home/home.ts` 与 `pages/search/search.ts` 同一改法）

  `CardVM` 里 `estimateText: string` → `sourceNotes: string[]`；`toVM` 里：

  ```ts
    spotsText: formatSpots(free, total),
    freeClass: availabilityLevel(rate),
    sourceNotes: sourceNotes(lot),
  ```

  import 行 `sourceNote` 改 `sourceNotes`。**注意 rate 现在可能是 NaN**：`freeRate` 对 null 返回 NaN，`availabilityLevel(NaN)` 已归 `unknown`，页面不需要新增分支。

- [ ] **Step 7：`miniprogram/components/lot-card/lot-card.wxml`**

  来源标注区改为数组循环（保留循环变量改名注释——那是踩过的坑）：

  ```xml
    <view class="card__tags" wx:if="{{item.sourceNotes.length || item.reasons.length}}">
      <!-- 数据来源标注：逐条来自 sourceNotes（公示价/运营声明/待上报/估算） -->
      <view
        wx:for="{{item.sourceNotes}}"
        wx:for-item="note"
        wx:key="*this"
        class="tag source"
      >{{note}}</view>

      <view
        wx:for="{{item.reasons}}"
        wx:for-item="reason"
        wx:key="*this"
        class="tag {{item.tone}}"
      >{{reason}}</view>
    </view>
  ```

  同时 `lot-card.ts` 的 `LotCardItem` 注释与字段：`estimateText` → `sourceNotes: string[]`。

- [ ] **Step 8：`miniprogram/components/lot-detail/lot-detail.wxml`**

  ① 头部评分行（原来是 `★ {{vm.lot.rating}}`）：

  ```xml
        <view class="card__rating">{{vm.ratingText}}</view>
  ```

  ② 标注区同 Step 7 改为 `vm.sourceNotes` 循环。

  ③ 「可预约额度」卡补一行运营声明（`quota__note` 下面）：

  ```xml
        <view class="quota__note">可预约额度与设施由平台运营维护</view>
  ```

- [ ] **Step 9：两个 wxss 加 unknown 灰档**

  `lot-card.wxss` 与 `lot-detail.wxss` 各追加（颜色取 tokens 文字弱色 `#94A3B8`）：

  ```css
  /* 余位未上报：灰档。缺数据不是紧张，不能落到 red/bad 色 */
  .card__free.unknown,
  .stat__v.unknown {
    color: #94a3b8;
  }
  ```

  （`lot-detail.wxss` 若选择器前缀不同，以其现有 `.stat__v` 规则为准补 `.unknown` 一档，颜色一致。）

- [ ] **Step 10：测试 fixture 对齐 + 新用例**

  各测试文件把 `rating: 4.5` 形态改为 `ratingSummary: { score: 4.5, count: 12 }`、`tags` 改 `facilities`（`tests/domain/{detail,pins,scoring,sort,format}.test.ts` 全部 fixture）。`lot()` helper 只改一处即可，逐个文件过。

  新增用例（`tests/domain/scoring.test.ts`）：

  ```ts
  it('余位未上报时不惩罚可用性，权重重分配', () => {
    const l = lot({ availability: { freeSpots: null, totalSpots: 500, source: 'ops' } })
    const r = scoreLot(l, { allLots: [l], userNeedsCharging: false })
    expect(r.factors.availability).toBeNull()
    // 只剩 fee/distance/infra 三因子：全部同批同值 → 各得 1 → 100 分
    expect(r.score).toBe(100)
  })

  it('无评价时不惩罚口碑，权重重分配', () => {
    const l = lot({ ratingSummary: null })
    const r = scoreLot(l, { allLots: [l], userNeedsCharging: false })
    expect(r.factors.reputation).toBeNull()
  })

  it('部分因子缺失时权重重分配保持 0–100', () => {
    const a = lot({ id: 'A', ratingSummary: { score: 5, count: 3 } })
    const b = lot({ id: 'B', ratingSummary: null })
    const ra = scoreLot(a, { allLots: [a, b], userNeedsCharging: false })
    const rb = scoreLot(b, { allLots: [a, b], userNeedsCharging: false })
    for (const r of [ra, rb]) {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(100)
    }
  })
  ```

  `tests/domain/format.test.ts` 新增：

  ```ts
  it('formatSpots 未上报显示待上报', () => {
    expect(formatSpots(null, 500)).toBe('待上报')
  })

  it('formatRatingSummary 无评价显示暂无评分，不显示 0 分', () => {
    expect(formatRatingSummary(null)).toBe('暂无评分')
    expect(formatRatingSummary({ score: 4.75, count: 4 })).toBe('★ 4.8（4 条）')
  })
  ```

  `tests/domain/format.test.ts` 里原 `sourceNote` 用例改为 `sourceNotes` 数组断言：

  ```ts
  it('sourceNotes 按来源逐条标注', () => {
    const l = lot({ distanceSource: 'estimated', pricingSource: 'public', freeSpots: null })
    expect(sourceNotes(l)).toEqual(['距离为估算', '收费来源于车场公示价', '余位待车场上报'])
  })

  it('sourceNotes 全真实时为空数组', () => {
    const l = lot({ distanceSource: 'route', pricingSource: 'public', freeSpots: 12 })
    expect(sourceNotes(l)).toEqual([])
  })
  ```

  （fixture 的 `pricingSource`/`freeSpots` 以该文件现有 `lot()` helper 的实参透传方式为准，缺什么补什么。）

- [ ] **Step 11：全量验证**

  Run: `npx tsc --noEmit && npm test`
  Expected: tsc exit 0；单测全绿。**此步不过不进 Task 3** —— `services/lot.ts` 旧代码此时还能编译（`toParkingLot` 构造新形状的适配包含在 Step 10 的收尾里：`rating` → `ratingSummary: null`、`tags` → `facilities`、`freeSpots` 保持数字），Task 3 再整体退役它。

- [ ] **Step 12：Commit**

  ```bash
  git add miniprogram/domain miniprogram/components miniprogram/pages tests
  git commit -m "feat(domain): real-data types, cold-start scoring, per-source notes"
  ```

---

### Task 3: domain/geo.ts + services/lot.ts 重写（签约车场库直查）

**Files:**
- Create: `miniprogram/domain/geo.ts`
- Test: `tests/domain/geo.test.ts`
- Rewrite: `miniprogram/services/lot.ts`
- Rewrite: `tests/services/lot.test.ts`
- Delete: `tests/live/lot.live.ts`

- [ ] **Step 1：写失败测试 `tests/domain/geo.test.ts`**

  ```ts
  import { haversineM } from '../../miniprogram/domain/geo'

  describe('haversineM', () => {
    it('同点为 0', () => {
      const p = { lat: 31.752727, lng: 117.254098 }
      expect(haversineM(p, p)).toBe(0)
    })

    it('南北向 1 纬度约 111.2km', () => {
      const m = haversineM({ lat: 31, lng: 117 }, { lat: 32, lng: 117 })
      expect(m).toBeGreaterThan(110000)
      expect(m).toBeLessThan(112500)
    })

    it('东西向距离随纬度收缩（纬度 31° 处 1 经度约 95km）', () => {
      const m = haversineM({ lat: 31, lng: 117 }, { lat: 31, lng: 118 })
      expect(m).toBeGreaterThan(93000)
      expect(m).toBeLessThan(97000)
    })

    it('对径点不超过半周长', () => {
      const m = haversineM({ lat: 31, lng: 117 }, { lat: -31, lng: -63 })
      expect(m).toBeLessThanOrEqual(Math.PI * 6371000)
    })
  })
  ```

- [ ] **Step 2：跑失败**

  Run: `npx jest tests/domain/geo.test.ts`
  Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `miniprogram/domain/geo.ts`**

  ```ts
  import type { GeoPoint } from './types'

  const EARTH_RADIUS_M = 6371000

  /**
   * 两坐标的球面距离（米）。
   *
   * 签约车场库个位数，不需要 geoNear/地理索引（见计划头部偏差表）：
   * 全量拉回后用本函数本地算直线距离，页面展示的步行距离 = 直线 × 绕行系数，
   * 与退役前 POI 路径的兜底口径一致
   */
  export function haversineM(a: GeoPoint, b: GeoPoint): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const dLat = toRad(b.lat - a.lat)
    const dLng = toRad(b.lng - a.lng)
    const s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)))
  }
  ```

- [ ] **Step 4：跑过**

  Run: `npx jest tests/domain/geo.test.ts` → PASS。

- [ ] **Step 5：重写 `miniprogram/services/lot.ts`（整文件替换）**

  ```ts
  import {
    DEFAULT_RADIUS_M,
    WALK_DETOUR_FACTOR,
    WALK_LOOKUP_TOP_N,
    WALK_METERS_PER_MINUTE,
  } from '../config'
  import { haversineM } from '../domain/geo'
  import type { GeoPoint, ParkingLot } from '../domain/types'
  import { cloudApi } from './cloud'
  import { walkingDistances } from './qqmap'

  /**
   * lots 集合文档 → ParkingLot。
   *
   * **逐条校验、坏一条丢一条**，与 format/cache 各处对存储污染的口径一致：
   * 手工在控制台改文档是常态，一条脏数据不该让整个面板白屏。
   * 字段缺失返回 null，调用方过滤 —— 宁可少显示一家，不显示半个「--」怪胎
   */
  function toParkingLot(id: string, doc: Record<string, unknown>): ParkingLot | null {
    const loc = doc.location as { lat?: unknown; lng?: unknown } | undefined
    const pricing = doc.pricing as Record<string, unknown> | undefined
    const availability = doc.availability as Record<string, unknown> | undefined
    const summary = doc.ratingSummary as Record<string, unknown> | null | undefined
    if (typeof doc.name !== 'string' || typeof doc.address !== 'string') return null
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null
    if (!pricing || typeof pricing.firstHour !== 'number') return null
    if (!availability || typeof availability.totalSpots !== 'number') return null
    const freeSpots = availability.freeSpots
    if (freeSpots !== null && typeof freeSpots !== 'number') return null
    if (typeof doc.reservableQuota !== 'number') return null
    const pricingSource = pricing.source
    if (pricingSource !== 'public' && pricingSource !== 'ops' && pricingSource !== 'estimated') return null
    const spotsSource = availability.source
    if (spotsSource !== 'public' && spotsSource !== 'ops') return null

    return {
      id,
      name: doc.name,
      address: doc.address,
      location: { lat: loc.lat, lng: loc.lng },
      // 距离先按 0 占位，distanceM 在 fetchSignedLots 里统一计算
      distanceM: 0,
      walkMinutes: 0,
      distanceSource: 'estimated',
      pricing: {
        firstHour: pricing.firstHour,
        perHourAfter: typeof pricing.perHourAfter === 'number' ? pricing.perHourAfter : pricing.firstHour,
        stepMinutes: pricing.stepMinutes === 15 || pricing.stepMinutes === 30 ? pricing.stepMinutes : 60,
        capPerDay: typeof pricing.capPerDay === 'number' ? pricing.capPerDay : 0,
        nightRate: typeof pricing.nightRate === 'number' ? pricing.nightRate : undefined,
        source: pricingSource,
      },
      availability: {
        freeSpots,
        totalSpots: availability.totalSpots,
        source: spotsSource,
      },
      reservableQuota: doc.reservableQuota,
      ratingSummary:
        summary && typeof summary.score === 'number' && typeof summary.count === 'number'
          ? { score: summary.score, count: summary.count }
          : null,
      facilities: Array.isArray(doc.facilities)
        ? (doc.facilities as unknown[]).filter((f): f is string => typeof f === 'string')
        : [],
    }
  }

  function withDistance(lot: ParkingLot, center: GeoPoint): ParkingLot {
    // 直线 × 绕行系数，与退役前 POI 兜底同口径；Top N 车场随后被真实路线覆盖
    const straight = haversineM(center, lot.location)
    const estimatedM = Math.max(0, Math.round(straight * WALK_DETOUR_FACTOR))
    return {
      ...lot,
      distanceM: estimatedM,
      walkMinutes: Math.max(1, Math.round(estimatedM / WALK_METERS_PER_MINUTE)),
      distanceSource: 'estimated',
    }
  }

  /**
   * 拉取周边**签约**车场（数据模型 §4：库里只存已签约、可预约的车场）。
   *
   * 普通查询全量拉（签约车场个位数，limit 20 是自保护的帽），本地算直线距离、
   * 按半径过滤、距离升序；**距离最近的 Top N 再查真实步行路线覆盖**
   * （路径矩阵按目的地计费的约束没有变）。查不到路线保留估算值并如实标注。
   *
   * 库为空 / 环境未配置时返回空数组，不抛错 —— 面板的空态文案负责解释
   */
  export async function fetchSignedLots(
    center: GeoPoint,
    radiusM: number = DEFAULT_RADIUS_M,
  ): Promise<ParkingLot[]> {
    const db = cloudApi?.database()
    if (!db) throw new Error('云开发未初始化：请检查 config.local.ts 的 CLOUD_ENV')

    const res = await db.collection('lots').where({ 'contract.status': 'signed' }).limit(20).get()
    const lots = res.data
      .map(doc => toParkingLot(String(doc._id ?? ''), doc))
      .filter((l): l is ParkingLot => l !== null)
      .filter(l => haversineM(center, l.location) <= radiusM)
      .map(l => withDistance(l, center))
      .sort((a, b) => a.distanceM - b.distanceM)

    const top = lots.slice(0, WALK_LOOKUP_TOP_N)
    if (top.length === 0) return lots
    const walked = await walkingDistances(center, top.map(l => l.location))
    walked.forEach((w, i) => {
      const lot = top[i]
      // 查不到就保留估算值，不把 null 写进去（与退役前同一口径）
      if (!lot || !w) return
      lot.distanceM = w.distanceM
      lot.walkMinutes = w.durationMin
      lot.distanceSource = 'route'
    })
    return lots
  }
  ```

  **删掉的内容**：`seedOf` / `pick` / `NAME_HINTS` / `pricingHint` / 哈希版 `toParkingLot` / POI 缓存（`CACHE_KEY`、`readCache`、`writeCache`、`searchNearbyCached`）/ `fetchNearbyLots` / `NearbyResult`。**POI 缓存机制整体退役**：云数据库读不按次计费，无需缓存保护配额。

- [ ] **Step 6：重写 `tests/services/lot.test.ts`（stub `wx.cloud`）**

  ```ts
  import { WALK_DETOUR_FACTOR } from '../../miniprogram/config'
  import { haversineM } from '../../miniprogram/domain/geo'
  import { fetchSignedLots } from '../../miniprogram/services/lot'

  interface WhereChain {
    limit: (n: number) => { get: () => Promise<{ data: Record<string, unknown>[] }> }
  }

  let docs: Record<string, unknown>[] = []

  function stubCloud(): void {
    const g = globalThis as unknown as {
      wx: {
        cloud: {
          init: () => void
          callFunction: () => Promise<{ result: unknown }>
          database: () => {
            collection: (name: string) => WhereChain
          }
        }
      }
    }
    g.wx = {
      cloud: {
        init: () => undefined,
        callFunction: () => Promise.resolve({ result: {} }),
        database: () => ({
          collection: (name: string) => {
            if (name !== 'lots') throw new Error(`unexpected collection ${name}`)
            return {
              limit: () => ({
                get: () => Promise.resolve({ data: docs }),
              }),
            } as WhereChain
          },
        }),
      },
    }
  }

  function doc(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      _id: 'lot1',
      name: '测试车场',
      address: '测试地址',
      location: { lat: 31.7527, lng: 117.2541 },
      pricing: { firstHour: 5, perHourAfter: 4, stepMinutes: 60, capPerDay: 40, source: 'public' },
      availability: { freeSpots: null, totalSpots: 300, source: 'ops' },
      reservableQuota: 20,
      ratingSummary: null,
      facilities: ['充电桩'],
      contract: { status: 'signed' },
      ...overrides,
    }
  }

  describe('fetchSignedLots', () => {
    const CENTER = { lat: 31.752727, lng: 117.254098 }

    beforeEach(() => {
      stubCloud()
      docs = []
    })

    it('返回文档映射出的车场并带上估算距离', async () => {
      docs = [doc({})]
      const lots = await fetchSignedLots(CENTER)
      expect(lots).toHaveLength(1)
      expect(lots[0].id).toBe('lot1')
      expect(lots[0].distanceSource).toBe('estimated')
      expect(lots[0].distanceM).toBeGreaterThan(0)
      expect(lots[0].walkMinutes).toBeGreaterThan(0)
    })

    it('按距离升序、半径外的丢弃', async () => {
      docs = [
        doc({ _id: 'far', location: { lat: 31.78, lng: 117.28 } }),
        doc({ _id: 'near', location: { lat: 31.753, lng: 117.2545 } }),
      ]
      const lots = await fetchSignedLots(CENTER, 1000)
      expect(lots.map(l => l.id)).toEqual(['near'])
    })

    it('perHourAfter 缺省回落到 firstHour', async () => {
      docs = [doc({ pricing: { firstHour: 5, stepMinutes: 60, capPerDay: 40, source: 'ops' } })]
      const lots = await fetchSignedLots(CENTER)
      expect(lots[0].pricing.perHourAfter).toBe(5)
    })

    it('形状坏的文档整条丢弃，不炸整批', async () => {
      docs = [doc({}), doc({ _id: 'bad', name: 123 }), doc({})]
      const lots = await fetchSignedLots(CENTER)
      expect(lots).toHaveLength(2)
    })

    it('估算距离是直线距离乘绕行系数的向上取整', async () => {
      docs = [doc({ location: { lat: 31.75121, lng: 117.25325 } })]
      const lots = await fetchSignedLots(CENTER)
      const straight = haversineM(CENTER, { lat: 31.75121, lng: 117.25325 })
      expect(lots[0].distanceM).toBe(Math.round(straight * WALK_DETOUR_FACTOR))
    })

    it('环境未配置时抛出明确错误', async () => {
      const g = globalThis as unknown as { wx?: unknown }
      const saved = g.wx
      g.wx = {}
      await expect(fetchSignedLots(CENTER)).rejects.toThrow('云开发未初始化')
      g.wx = saved
    })
  })

  ```

  > 实现注记：步行矩阵分支（真实路线覆盖 Top N）不在本文件测——`walkingDistances` 服务本身有既有测试与 live 覆盖，`fetchSignedLots` 只测它自己的映射、过滤、排序与容错。

- [ ] **Step 7：删除 `tests/live/lot.live.ts`**

  ```bash
  git rm tests/live/lot.live.ts
  ```

  它测的是哈希派生的稳定值与 `reservableQuota` 40–160 区间——宿主已删。`tests/live/wx-node-shim.ts` 若只被它引用，一并删；被 qqmap.live 引用则保留（先 grep）。

- [ ] **Step 8：全量验证**

  Run: `npx tsc --noEmit && npm test`
  Expected: 全绿。若 `pages/home|search` 引用 `fetchNearbyLots` 报编译错——把两页 import 临时改 `fetchSignedLots`（真正的页面接入在 Task 5，这里只求编译通过，调用形态 Step 先不管：本轮签名兼容 `{ lots }` 解构需同步改掉，直接改 `const lots = await fetchSignedLots(point, DEFAULT_RADIUS_M)` 与 `fetchSignedLots(target, DEFAULT_RADIUS_M)`）。

- [ ] **Step 9：Commit**

  ```bash
  git add miniprogram/domain/geo.ts miniprogram/services/lot.ts tests
  git commit -m "feat(services): fetch signed lots from cloud db, retire hash-derived lots"
  ```

---

### Task 4: login 云函数 + ensureLogin

**Files:**
- Create: `cloudfunctions/login/index.js`、`cloudfunctions/login/package.json`
- Modify: `miniprogram/services/cloud.ts`
- Modify: `miniprogram/app.ts`
- Test: `tests/services/cloud.test.ts`

- [ ] **Step 1：写失败测试 `tests/services/cloud.test.ts`**

  ```ts
  import { callFunction, ensureLogin, type CloudApi } from '../../miniprogram/services/cloud'

  let lastCall: { name: string; data: Record<string, unknown> } | null = null
  let respond: (opt: { name: string; data: Record<string, unknown> }) => Promise<{ result: unknown }> | { result: unknown }

  function stubCloud(): void {
    const g = globalThis as unknown as { wx: { cloud: CloudApi } }
    g.wx = {
      cloud: {
        init: () => undefined,
        database: (() => ({})) as unknown as CloudApi['database'],
        callFunction: opt => {
          lastCall = opt
          return Promise.resolve(respond(opt))
        },
      },
    }
  }

  describe('callFunction', () => {
    beforeEach(() => {
      stubCloud()
      lastCall = null
    })

    it('code 0 时返回 data', async () => {
      respond = () => ({ result: { code: 0, data: { a: 1 } } })
      await expect(callFunction<{ a: number }>('x')).resolves.toEqual({ ok: true, data: { a: 1 } })
    })

    it('非 0 code 原样透出 code 与 message', async () => {
      respond = () => ({ result: { code: 'NO_AUTH', message: '缺少微信身份' } })
      const r = await callFunction('x')
      expect(r).toEqual({ ok: false, code: 'NO_AUTH', message: '缺少微信身份' })
    })

    it('调用抛错时归一为 NETWORK', async () => {
      respond = () => {
        throw new Error('timeout')
      }
      const r = await callFunction('x')
      expect(r).toEqual({ ok: false, code: 'NETWORK', message: 'timeout' })
    })
  })

  describe('ensureLogin', () => {
    beforeEach(() => {
      stubCloud()
    })

    it('调用 login 云函数', async () => {
      respond = () => ({ result: { code: 0, data: { userId: 'u1', role: 'driver', violationCount: 0, banned: false } } })
      const r = await ensureLogin()
      expect(r.ok).toBe(true)
      expect(lastCall?.name).toBe('login')
    })
  })
  ```

- [ ] **Step 2：跑失败** → Run: `npx jest tests/services/cloud.test.ts`，FAIL（ensureLogin 不存在）。

- [ ] **Step 3：`miniprogram/services/cloud.ts` 追加**

  ```ts
  export interface CloudOk<T> { ok: true; data: T }
  export interface CloudErr { ok: false; code: string; message: string }
  export type CloudResult<T> = CloudOk<T> | CloudErr

  /**
   * 云函数统一返回 `{ code, message, data }`（数据模型 §6 口径）。
   * 网络层异常归一成 `NETWORK`，调用方只看 ok 分支，不用各写一遍 try/catch
   */
  export async function callFunction<T>(
    name: string,
    data?: Record<string, unknown>,
  ): Promise<CloudResult<T>> {
    if (!cloudApi) return { ok: false, code: 'NO_CLOUD', message: '基础库不支持云开发' }
    try {
      const res = await cloudApi.callFunction({ name, data: data ?? {} })
      const body = res.result as { code?: unknown; message?: unknown; data?: unknown }
      if (body && body.code === 0) return { ok: true, data: body.data as T }
      return {
        ok: false,
        code: String(body?.code ?? 'UNKNOWN'),
        message: String(body?.message ?? '云函数返回异常'),
      }
    } catch (e) {
      return { ok: false, code: 'NETWORK', message: (e as Error)?.message || '云函数调用失败' }
    }
  }

  export interface LoginResult {
    userId: string
    role: 'driver' | 'lot_admin' | 'ops_admin'
    violationCount: number
    banned: boolean
  }

  /** 微信身份建档（users 无则建）。2b 起的写操作云函数都以此为身份前提 */
  export function ensureLogin(): Promise<CloudResult<LoginResult>> {
    return callFunction<LoginResult>('login')
  }
  ```

- [ ] **Step 4：`cloudfunctions/login/package.json`** —— 同 initDb 模板，`"name": "login"`。

- [ ] **Step 5：`cloudfunctions/login/index.js`**

  ```js
  // 微信身份建档与查询。设计稿 §4：身份走 _openid，不自建密码。
  // 云函数写入**不会**自动带 _openid（那是小程序端写入的行为），必须显式写
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

  exports.main = async () => {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return { code: 'NO_AUTH', message: '缺少微信身份' }
    const db = cloud.database()
    const got = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
    if (got.data.length > 0) {
      const u = got.data[0]
      const credit = u.credit || { violationCount: 0, bannedUntil: null }
      const banned = typeof credit.bannedUntil === 'number' && credit.bannedUntil > Date.now()
      return {
        code: 0,
        data: {
          userId: u._id,
          role: u.role || 'driver',
          violationCount: credit.violationCount || 0,
          banned,
        },
      }
    }
    const added = await db.collection('users').add({
      data: {
        _openid: OPENID,
        role: 'driver',
        nickname: '',
        avatar: '',
        phone: '',
        credit: { violationCount: 0, bannedUntil: null },
        createdAt: Date.now(),
      },
    })
    return {
      code: 0,
      data: { userId: added._id, role: 'driver', violationCount: 0, banned: false },
    }
  }
  ```

- [ ] **Step 6：`miniprogram/app.ts` 接入建档**

  ```ts
  // app.ts
  import { CLOUD_ENV } from './config'
  import { cloudApi, ensureLogin } from './services/cloud'

  App<IAppOption>({
    globalData: {},
    onLaunch() {
      cloudApi?.init({ env: CLOUD_ENV || undefined, traceUser: true })
      // 建档 fire-and-forget：失败只告警不阻塞启动，角色页与后续写操作自会重试
      if (cloudApi) {
        void ensureLogin().then(r => {
          if (!r.ok) console.warn('ensureLogin failed:', r.code, r.message)
        })
      }
    },
  })
  ```

- [ ] **Step 7：部署 + 验证**

  `cloudfunctions/login` 上传部署（云端安装依赖）→ 工具里重新编译小程序 → 云开发控制台「数据库 → users」应出现一条 `_openid` 为你微信号的 `role: 'driver'` 文档。

- [ ] **Step 8：验证 + Commit**

  Run: `npx tsc --noEmit && npm test` → 全绿。

  ```bash
  git add cloudfunctions/login miniprogram/services/cloud.ts miniprogram/app.ts tests/services/cloud.test.ts
  git commit -m "feat(cloud): login function and ensureLogin, wechat-identity user records"
  ```

---

### Task 5: seedLots 云函数 + 种子数据（实现当晚与用户一起核价）

**Files:**
- Create: `cloudfunctions/seedLots/index.js`、`package.json`、`seed-data.js`

- [ ] **Step 1：与用户定名单、核价**

  候选（2026-09-14 真接口查得，poiId/坐标真实）：

  | poiId | 名称 | 距学校 | 类型 |
  |---|---|---|---|
  | `4911570620256777247` | 合肥学院(南艳湖校区)停车场 | 187m | 校园 |
  | `15029959815682820204` | 金屿海岸地上停车场 | 244m | 小区 |
  | `626521831643170859` | 合肥大学(南艳湖校区)停车场 | 345m | 校园（与上一条疑似同片区，二选一） |
  | `9312069001792171784` | 润宜佳购物中心(金屿海岸店)地下停车场 | 516m | 商场 |
  | `7030273407318901444` | 中德合作创新园地下停车场 | 594m | 园区 |

  每家要核实的字段（实地拍公示价牌 / 公开渠道）：**首小时价、后续每小时、日封顶、总车位**。核实方式记进 seed 条目的 `note`（答辩讲来源时用）。核实不到的字段保持 `null` —— **seedLots 会拒绝写入不完整的条目**。

- [ ] **Step 2：`cloudfunctions/seedLots/seed-data.js`（结构完整、数值待核）**

  ```js
  // 签约车场种子。poiId/name/address/location 来自 2026-09-14 腾讯 POI 真实检索；
  // pricing/availability.totalSpots/reservableQuota/facilities 必须现场核实后填，
  // 保持 null 的条目 seedLots 会跳过不写 —— 宁可少一家，不录一条编的数据。
  // source: 有公示价牌照到的用 'public'，运营方口头声明的用 'ops'
  const SEED_LOTS = [
    {
      poiId: '4911570620256777247',
      name: '合肥学院(南艳湖校区)停车场',
      address: '安徽省合肥市蜀山区开发区锦绣大道99号合肥大学(南艳湖校区)',
      location: { lat: 31.75121, lng: 117.25325 },
      pricing: { firstHour: null, perHourAfter: null, stepMinutes: 60, capPerDay: null, nightRate: null, source: null },
      availability: { freeSpots: null, totalSpots: null, source: null },
      reservableQuota: null,
      facilities: null,
      note: '',
    },
    {
      poiId: '9312069001792171784',
      name: '润宜佳购物中心(金屿海岸店)地下停车场',
      address: '安徽省合肥市蜀山区清潭路润宜佳购物中心(金屿海岸店)停车场B1',
      location: { lat: 31.755027, lng: 117.258831 },
      pricing: { firstHour: null, perHourAfter: null, stepMinutes: 60, capPerDay: null, nightRate: null, source: null },
      availability: { freeSpots: null, totalSpots: null, source: null },
      reservableQuota: null,
      facilities: null,
      note: '',
    },
    // 其余候选照此结构补（见 Step 1 表格）
  ]

  module.exports = { SEED_LOTS }
  ```

- [ ] **Step 3：`cloudfunctions/seedLots/index.js`**

  ```js
  // 幂等 upsert（按 poiId 定位）。未核实（null）的条目拒绝入库。
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  const { SEED_LOTS } = require('./seed-data')

  function isFiniteNum(v) {
    return typeof v === 'number' && Number.isFinite(v)
  }

  function isComplete(lot) {
    return (
      isFiniteNum(lot.pricing.firstHour) &&
      isFiniteNum(lot.pricing.perHourAfter) &&
      isFiniteNum(lot.pricing.capPerDay) &&
      (lot.pricing.source === 'public' || lot.pricing.source === 'ops') &&
      isFiniteNum(lot.availability.totalSpots) &&
      (lot.availability.source === 'public' || lot.availability.source === 'ops') &&
      isFiniteNum(lot.reservableQuota) &&
      Array.isArray(lot.facilities)
    )
  }

  exports.main = async () => {
    const db = cloud.database()
    const lots = db.collection('lots')
    const written = []
    const skipped = []
    for (const lot of SEED_LOTS) {
      if (!isComplete(lot)) {
        skipped.push(lot.poiId)
        continue
      }
      const doc = {
        poiId: lot.poiId,
        name: lot.name,
        address: lot.address,
        location: lot.location,
        pricing: lot.pricing,
        availability: { freeSpots: null, totalSpots: lot.availability.totalSpots, source: lot.availability.source },
        reservableQuota: lot.reservableQuota,
        facilities: lot.facilities,
        ratingSummary: null,
        contract: { status: 'signed', signedAt: Date.now() },
        note: lot.note || '',
        updatedAt: Date.now(),
      }
      const got = await lots.where({ poiId: lot.poiId }).limit(1).get()
      if (got.data.length > 0) await lots.doc(got.data[0]._id).update({ data: doc })
      else await lots.add({ data: doc })
      written.push(lot.name)
    }
    return { code: 0, data: { written, skipped } }
  }
  ```

  注意 `availability.freeSpots` 恒写 `null` 入库：余位只由车场端上报（Plan 3），种子不给初始值（用户拍板）。

- [ ] **Step 4：部署、核价、执行**

  `cloudfunctions/seedLots` 上传部署 → 与用户逐家核实 → 编辑 `seed-data.js` 填真值 → 重新部署 → 云端测试执行。预期 `{ code: 0, data: { written: [车场名...], skipped: [] } }`。控制台 `lots` 集合逐条核对。

- [ ] **Step 5：Commit**

  ```bash
  git add cloudfunctions/seedLots
  git commit -m "feat(cloud): seedLots with verified-data-only guard"
  ```

---

### Task 6: 页面接入 + 真机验收（用户在场）

**Files:**
- Modify: `miniprogram/pages/home/home.ts`、`home.wxml`
- Modify: `miniprogram/pages/search/search.ts`、`search.wxml`

- [ ] **Step 1：`home.ts` 的 `load()` 换数据源**

  ```ts
    try {
      const lots = await fetchSignedLots(point, DEFAULT_RADIUS_M)
      if (lots.length === 0) {
        this.setData({ state: 'empty', fallbackText })
        return
      }
      this.recommendations = topRecommendations(lots, { userNeedsCharging: false }, lots.length)
      this.setData({ centerLat: point.lat, centerLng: point.lng, state: 'ready', fallbackText })
      this.applySort(this.data.sortKey)
    } catch {
      this.setData({ state: 'error', fallbackText })
    }
  ```

  import 行 `fetchNearbyLots` → `fetchSignedLots`。

- [ ] **Step 2：`home.wxml` 空态文案**

  `text="附近 3 公里内未找到停车场"` → `text="附近暂无签约车场，签约车场将陆续上线"`（action 仍是「去搜索」）。

- [ ] **Step 3：`search.ts` 的 `search()` 同步**

  `const { lots } = await fetchNearbyLots(target, DEFAULT_RADIUS_M)` → `const lots = await fetchSignedLots(target, DEFAULT_RADIUS_M)`；import 同步。检索结果空文案 `没有找到相关车场` → `目的地周边暂无签约车场`。

- [ ] **Step 4：静态验证**

  Run: `npx tsc --noEmit && npm test` → 全绿。

- [ ] **Step 5：真机验收 checklist（用户操作，逐项过）**

  1. 首页：列表只出现种子签约车场；卡片价格 `¥N/时`；余位显示**灰色「待上报」**；标注含「收费来源于车场公示价」「余位待车场上报」（视 seed 的 source）
  2. 点卡片：地图居中 + 详情面板；评分位显示「暂无评分」；额度卡含「由平台运营维护」行
  3. 排序 chips 四档：综合/距离/价格/空位 —— 「空位」档未上报车场沉底但仍在列
  4. 搜索页：搜「明珠广场」等真实目的地 → 显示目的地周边签约车场；搜无签约车场的远地 → 空态「目的地周边暂无签约车场」
  5. 图钉标签 `¥N · Xm`、选中蓝底放大、上限 8 个 —— 与退役前一致
  6. 云开发控制台 `users` 有一条你的记录（Task 4 已验，复核）
  7. 断网/杀云函数权限：首页进 error 态 + 重试可用（云开发未初始化的报错文案在控制台可见）

- [ ] **Step 6：收尾**

  ```bash
  git add miniprogram/pages
  git commit -m "feat(pages): switch home/search to signed-lot listing"
  ```

  然后把本轮偏差与新坑记回计划文件顶部「偏差表」（若有新发现的）。

---

## 已知未完成（留给 2b / Plan 3）

- 预约闭环（额度 CAS、订单、模拟支付）、9 个付费层页面 —— Plan 2b
- 余位上报、核销（车场端）—— Plan 3 第一个页面
- 「实时余位 + 历史同期」基线预测与详情页预测柱 —— 有 `availability_samples` 后
- 评价与口碑因子真数据接入 —— `ratingSummary` 由 reviews 云函数维护（2b）
- 车牌识别、Web 运营后台 —— 闭环之后，可砍
- **把 4 家车场的 `placeholder` 换成已核实的真价**（公示价牌或运营方渠道），改 `seed-data.js` 后重新部署重跑 —— 界面上的「示例数据，待核实」会自动消失
- **`reservableQuota` 缺来源字段**：暂定额度与真实额度目前在库里分不开，2b 做额度扣减前要补（同一轮把 `facilities` 的来源一起想清楚，它现在也没有来源字段）
