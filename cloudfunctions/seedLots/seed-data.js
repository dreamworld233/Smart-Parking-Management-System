// 签约车场种子数据。
//
// poiId / name / address / location 四项来自腾讯位置服务 POI 真实检索
// （2026-09-15 以合肥大学南艳湖校区为中心、1 km 半径实测，逐字照抄接口返回）。
// pricing / availability.totalSpots / reservableQuota / facilities **必须线下核实后填**，
// 保持 null 的条目会被 seedLots 跳过不写 —— 宁可少一家签约车场，不录一条编的数据。
//
// 核实要求（每家的 note 里写清来源，答辩讲数据出处时要用）：
//   - pricing.firstHour / perHourAfter / capPerDay：现场公示价牌拍照，或车场运营方公开渠道
//   - pricing.stepMinutes：计费步长，只有确认是 15 / 30 分钟才改，默认 60
//   - pricing.nightRate：夜间按次收费才有，没有就留 null（不是「未核实」的意思）
//   - availability.totalSpots：总车位数
//   - availability.source / pricing.source：有公示价牌照到的填 'public'，运营方口头声明的填 'ops'
//   - reservableQuota：平台可预约额度，由运营方给的数字（平台运营维护，不是车场总车位）
//   - facilities：字符串数组，标签直接用于界面显示，**充电桩必须逐字写成 `'充电桩'`**
//     （`domain/scoring.ts` 靠 `facilities.includes('充电桩')` 判定电动车的充电因子，
//     写成 charging / 充电 会静默拿不到这分，而界面上看不出哪里不对）；
//     确实没有特殊设施填 []（那也是核实过的结论）
//
// availability.freeSpots 不在这里配：余位只由车场端上报（Plan 3），种子给了初始值就是编的。
const SEED_LOTS = [
  {
    poiId: '4911570620256777247',
    name: '合肥学院(南艳湖校区)停车场',
    address: '安徽省合肥市蜀山区开发区锦绣大道99号合肥大学(南艳湖校区)',
    location: { lat: 31.75121, lng: 117.25325 },
    pricing: { firstHour: null, perHourAfter: null, stepMinutes: 60, capPerDay: null, nightRate: null, source: null },
    availability: { totalSpots: null, source: null },
    reservableQuota: null,
    facilities: null,
    note: '',
  },
  {
    poiId: '15029959815682820204',
    name: '金屿海岸地上停车场',
    address: '安徽省合肥市蜀山区锦绣大道海恒金屿海岸',
    location: { lat: 31.75394, lng: 117.25624 },
    pricing: { firstHour: null, perHourAfter: null, stepMinutes: 60, capPerDay: null, nightRate: null, source: null },
    availability: { totalSpots: null, source: null },
    reservableQuota: null,
    facilities: null,
    note: '',
  },
  {
    // 与「合肥学院(南艳湖校区)停车场」同片区、直线相距约 300 m，疑似指同几片车位，
    // 两家都留在这里：核价时二选一，另一家保持 null 自然被跳过
    poiId: '626521831643170859',
    name: '合肥大学(南艳湖校区)停车场',
    address: '安徽省合肥市蜀山区锦绣大道99号合肥大学',
    location: { lat: 31.750924, lng: 117.25706 },
    pricing: { firstHour: null, perHourAfter: null, stepMinutes: 60, capPerDay: null, nightRate: null, source: null },
    availability: { totalSpots: null, source: null },
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
    availability: { totalSpots: null, source: null },
    reservableQuota: null,
    facilities: null,
    note: '',
  },
  {
    poiId: '7030273407318901444',
    name: '中德合作创新园地下停车场',
    address: '安徽省合肥市蜀山区清潭路海恒金屿海岸东南侧约180米',
    location: { lat: 31.752451, lng: 117.260369 },
    pricing: { firstHour: null, perHourAfter: null, stepMinutes: 60, capPerDay: null, nightRate: null, source: null },
    availability: { totalSpots: null, source: null },
    reservableQuota: null,
    facilities: null,
    note: '',
  },
]

module.exports = { SEED_LOTS }
