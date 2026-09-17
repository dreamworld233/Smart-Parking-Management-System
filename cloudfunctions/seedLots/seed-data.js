// 签约车场种子数据。
//
// poiId / name / address / location 四项来自腾讯位置服务 POI 真实检索
// （2026-09-15 以合肥大学南艳湖校区为中心、1 km 半径实测，逐字照抄接口返回）。
//
// 价格类字段（pricing / availability.totalSpots）**目前是演示用的
// 暂定值**：实地未找到公示价牌，用户 2026-09-15 拍板先用一轮暂定值把数据链路跑通。
// 因此这些条目的 `source` 一律标 `'placeholder'`，界面会照实显示「示例数据，待核实」——
// **不许把它们改成 `'public'` / `'ops'`**：那两档的含义是「已核实」，改了就变成编数据，
// 而且库里再也分不出哪条是编的（课程红线：不许模拟数据当作真实数据使用）。
// 等实地核到公示价，把真值填进来、`source` 改成 `'public'` 或 `'ops'` 即可。
//
// 核价后每家的 note 里写清来源，答辩讲数据出处时要用：
//   - pricing.firstHour / perHourAfter / capPerDay：公示价牌照片，或车场运营方公开渠道
//   - pricing.stepMinutes：计费步长，只有确认是 15 / 30 分钟才改，默认 60
//   - pricing.nightRate：夜间按次收费才有，没有就留 null（不是「未核实」的意思）
//   - availability.totalSpots：总车位数
//   - facilities：字符串数组，标签直接用于界面显示，**充电桩必须逐字写成 `'充电桩'`**
//     （`domain/scoring.ts` 靠 `facilities.includes('充电桩')` 判定电动车的充电因子，
//     写成 charging / 充电 会静默拿不到这分，而界面上看不出哪里不对）。
//     暂定值统一给 `[]`：编一个「有充电桩」的标签会作为推荐理由显示给用户，属于凭空断言；
//     给空数组至少不会多说
//
// availability.freeSpots 不在这里配：余位只由车场端上报（Plan 3），种子给了初始值就是编的。
//
// 名单口径：`4911570620256777247`「合肥学院(南艳湖校区)停车场」与
// `626521831643170859`「合肥大学(南艳湖校区)停车场」经确认是同一所学校（原合肥学院，
// 2023 年更名为合肥大学），腾讯地图里是两条重复 POI，只保留名字与校区现名一致的后一条。
const PLACEHOLDER_NOTE = '2026-09-15 课程演示暂定值：价格、车位数均为示例数据，未实地核实'

const SEED_LOTS = [
  {
    poiId: '626521831643170859',
    name: '合肥大学(南艳湖校区)停车场',
    address: '安徽省合肥市蜀山区锦绣大道99号合肥大学',
    location: { lat: 31.750924, lng: 117.25706 },
    pricing: { firstHour: 3, perHourAfter: 2, stepMinutes: 60, capPerDay: 15, nightRate: null, source: 'placeholder' },
    availability: { totalSpots: 200, source: 'placeholder' },
    facilities: [],
    note: PLACEHOLDER_NOTE,
  },
  {
    poiId: '15029959815682820204',
    name: '金屿海岸地上停车场',
    address: '安徽省合肥市蜀山区锦绣大道海恒金屿海岸',
    location: { lat: 31.75394, lng: 117.25624 },
    pricing: { firstHour: 4, perHourAfter: 3, stepMinutes: 60, capPerDay: 20, nightRate: null, source: 'placeholder' },
    availability: { totalSpots: 150, source: 'placeholder' },
    facilities: [],
    note: PLACEHOLDER_NOTE,
  },
  {
    poiId: '9312069001792171784',
    name: '润宜佳购物中心(金屿海岸店)地下停车场',
    address: '安徽省合肥市蜀山区清潭路润宜佳购物中心(金屿海岸店)停车场B1',
    location: { lat: 31.755027, lng: 117.258831 },
    pricing: { firstHour: 5, perHourAfter: 3, stepMinutes: 60, capPerDay: 30, nightRate: null, source: 'placeholder' },
    availability: { totalSpots: 320, source: 'placeholder' },
    facilities: [],
    note: PLACEHOLDER_NOTE,
  },
  {
    poiId: '7030273407318901444',
    name: '中德合作创新园地下停车场',
    address: '安徽省合肥市蜀山区清潭路海恒金屿海岸东南侧约180米',
    location: { lat: 31.752451, lng: 117.260369 },
    pricing: { firstHour: 4, perHourAfter: 2, stepMinutes: 60, capPerDay: 20, nightRate: null, source: 'placeholder' },
    availability: { totalSpots: 220, source: 'placeholder' },
    facilities: [],
    note: PLACEHOLDER_NOTE,
  },
]

module.exports = { SEED_LOTS }
