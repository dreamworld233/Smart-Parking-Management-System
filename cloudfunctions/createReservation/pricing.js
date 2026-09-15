// 计费/退款公式。本文件是 miniprogram/domain/pricing.ts 的 CommonJS 逐行拷贝，
// 是真值的双胞胎 —— 改这一边必须同步改另一边，否则云端与端上算价会分叉。
// 云端没有 TS 编译环境，只能直接跑 JS；保持两边逐行同口径（含注释）是为了
// 让 diff 一眼能看出两边有没有分叉。

/** 平台服务费（元）。平台唯一收入来源，免费取消窗口之外不退还 */
const PLATFORM_SERVICE_FEE = 2

/** 预约时长上限（小时）。入场时间须落在 (now, now + 2h]，故预约时长恒为 1 或 2 小时 */
const MAX_LEAD_HOURS = 2

/** 下单后免费取消窗口（毫秒）。窗口内取消全额退还，含服务费 */
const FREE_CANCEL_MS = 10 * 60 * 1000

/** 入场缓冲（毫秒）。到达时刻之后仍可核销；缓冲不算进预约时长，也不参与退费计算 */
const ENTRY_GRACE_MS = 15 * 60 * 1000

const HOUR_MS = 60 * 60 * 1000

/**
 * 预留小时数 = 到达时刻 − 当前时刻，向上取整，最小 1。
 * 到达时间早于或等于当前时间时返回 1。
 */
function leadHours(now, arrive) {
  const diffMs = arrive.getTime() - now.getTime()
  // 故意写成 !(diffMs > 0) 而不是 diffMs <= 0：
  // 后者对 NaN 求值为 false，会让 Invalid Date 一路算成 NaN 费用。
  // 取反这一层是承重的，别"简化"掉。
  if (!(diffMs > 0)) return 1
  return Math.ceil(diffMs / HOUR_MS)
}

/**
 * 入场时间是否落在可预约窗口内：`[now, now + MAX_LEAD_HOURS 小时]`。
 *
 * 下界含 `now`（预约页首档就是「现在」）—— 锁位时长为 0，按「不足 1 小时按 1 小时计」
 * 仍收 1 小时，与 `leadHours` 的兜底一致。过去时刻与非法时间一律 false。
 */
function isBookableArrival(now, arrive) {
  const diffMs = arrive.getTime() - now.getTime()
  if (!Number.isFinite(diffMs)) return false
  if (diffMs < 0) return false
  return diffMs <= MAX_LEAD_HOURS * HOUR_MS
}

/**
 * 预支停车费 = 预约时长 × 该车场首小时标准价。
 *
 * 本质是**锁位费**：预约成立那一刻车位即视为被占用，平台按这段时长代收后转付车场。
 * 它与入场后的实际停放费用**是两笔钱** —— 实际停放多久、闸机收多少，由车场按自己的
 * 标准计收，平台不参与、不抵扣、不追缴。
 */
function prepaidParkingFee(now, arrive, firstHourRate) {
  return leadHours(now, arrive) * firstHourRate
}

function quoteTotal(now, arrive, firstHourRate) {
  const prepaid = prepaidParkingFee(now, arrive, firstHourRate)
  return {
    leadHours: leadHours(now, arrive),
    prepaidParkingFee: prepaid,
    serviceFee: PLATFORM_SERVICE_FEE,
    totalAmount: prepaid + PLATFORM_SERVICE_FEE,
  }
}

/**
 * 取消退款。一条公式覆盖全部情形，没有特例分支：
 *
 * ```
 * 已占用时长 = 取消时刻 − 下单时刻        向上取整，不满 1 小时按 1 小时算
 * 退还       = max(0, (预约时长 − 已占用时长)) × 首小时单价
 * ```
 *
 * 下单 10 分钟内取消是**唯一的免费窗口**，全额退还（含服务费）。
 * 逾窗口后服务费不退，预支停车费按上式退。
 *
 * 退款为 0 的两种来源都指向「车位白锁了」这件事：
 *   1. 取消晚于到达时刻（`isBreach`）—— 用户没及时取消，也没到场
 *   2. 已占用时长向上取整后吃满预约时长 —— 例如预约 1 小时、11 分钟后取消
 * 第 2 种**不算违约**（取消时离到达还早），但同样不退。这是「不满 1 小时按 1 小时算」
 * 对用户的代价，是刻意的，不是漏算。
 *
 * 超时未核销（到达 + 缓冲后仍未入场）不走本函数 —— 那条路是 `released` + 记违约，
 * 见数据模型文档的状态机。
 */
function cancelRefund(orderAt, arrive, cancelAt, firstHourRate) {
  const elapsedMs = cancelAt.getTime() - orderAt.getTime()

  // 免费窗口。写成 !(elapsedMs > FREE_CANCEL_MS) 而不是 <=：
  // 后者对 NaN 求值为 false，坏时间戳会掉进下面的扣费分支去吞用户的钱。
  // 时钟回拨（elapsedMs 为负）同样落进免费窗口 —— 宁可多退。
  if (!(elapsedMs > FREE_CANCEL_MS)) {
    return {
      usedHours: 0,
      parkingRefund: prepaidParkingFee(orderAt, arrive, firstHourRate),
      refundServiceFee: true,
      totalRefund: quoteTotal(orderAt, arrive, firstHourRate).totalAmount,
      isBreach: false,
    }
  }

  const usedHours = Math.ceil(elapsedMs / HOUR_MS)
  // 已占用可能超过预约时长（取消得晚），max(0, …) 就是「不追缴」的落点
  const remainingHours = Math.max(0, leadHours(orderAt, arrive) - usedHours)
  const parkingRefund = remainingHours * firstHourRate

  return {
    usedHours,
    parkingRefund,
    refundServiceFee: false,
    totalRefund: parkingRefund,
    isBreach: cancelAt.getTime() >= arrive.getTime(),
  }
}

module.exports = { HOUR_MS, leadHours, isBookableArrival, prepaidParkingFee, quoteTotal, cancelRefund }
