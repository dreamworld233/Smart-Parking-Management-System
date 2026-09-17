import { fetchAdminLot, updateLot } from '../../../services/cloud'
import type { AdminLot } from '../../../services/cloud'
import { clearRole } from '../../../services/storage'

type ViewState = 'loading' | 'ready' | 'error' | 'no_role' | 'no_lot'

interface PricingVM {
  firstHour: string
  perHourAfter: string
  stepMinutes: string
  capPerDay: string
  nightRate: string
  /** 来源标注：placeholder 标「示例数据，待核实」 */
  sourceLabel: string
}

interface LotVM {
  lotName: string
  lotAddress: string
  pricing: PricingVM
  facilitiesText: string
}

type Field = 'firstHour' | 'perHourAfter' | 'stepMinutes' | 'capPerDay' | 'nightRate' | 'name' | 'address'

interface EditVM {
  field: Field
  label: string
  value: string
  /** 数字字段 */
  numeric: boolean
}

/**
 * 车场配置渲染快照缓存（内存，data 外的实例字段）。
 * 车场信息/收费是低频数据（不会每次切 tab 都变），TTL 放长到 10 分钟；
 * 编辑保存后强制刷新。不落 wx.setStorageSync —— 身份与绑定状态要新鲜
 */
interface LotCache {
  lot: AdminLot
  vm: LotVM
}

/** 车场配置低频变：10 分钟内切 tab 直接用旧渲染，超过才重拉 */
const CACHE_TTL_MS = 10 * 60 * 1000

Page({
  data: {
    state: 'loading' as ViewState,
    navTop: 100,
    lotName: '',
    lotAddress: '',
    pricing: null as PricingVM | null,
    facilitiesText: '',
    // 编辑弹窗
    editDialog: false,
    edit: null as EditVM | null,
    editInput: '',
    submitting: false,
    inputInvalid: false,
  },

  /** 当前车场数据（data 外实例字段） */
  lot: null as AdminLot | null,
  /** 上次成功渲染的快照（缓存命中先显示它，不闪 loading） */
  lastData: null as LotCache | null,
  /** 缓存落库时刻（毫秒时间戳），超 CACHE_TTL_MS 视为过期 */
  lastLoadedAt: 0,

  onLoad() {
    const rect = wx.getMenuButtonBoundingClientRect()
    this.setData({ navTop: rect && rect.height > 0 ? Math.round(rect.bottom + 8) : 100 })
  },

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(2)
    void this.load()
  },

  /**
   * 加载车场配置。缓存有效且非强制时：先用缓存渲染（不闪 loading），再后台静默刷新；
   * 缓存过期或无缓存走原 loading 流程。force=true 用于编辑保存后——跳过缓存强制重拉
   */
  async load(force = false) {
    const cached = this.lastData
    if (cached && !force && Date.now() - this.lastLoadedAt < CACHE_TTL_MS) {
      this.applyCache(cached)
      void this.refresh(true)
      return
    }
    this.setData({ state: 'loading' })
    await this.refresh(false)
  },

  /**
   * 拉取车场配置并更新缓存。
   * silent=true（缓存命中后的后台刷新）：失败静默保留缓存、不 toast；
   * silent=false：走原 loading 的错误 / no_role / no_lot 分支
   */
  async refresh(silent: boolean) {
    const r = await fetchAdminLot()
    if (!r.ok) {
      if (silent) return
      if (r.code === 'NO_AUTH') {
        this.lastData = null
        this.lastLoadedAt = 0
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.role !== 'lot_admin') {
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_role' })
      return
    }
    if (!r.data.lot) {
      if (silent) return
      this.lastData = null
      this.lastLoadedAt = 0
      this.setData({ state: 'no_lot' })
      return
    }
    const lot = r.data.lot
    const cache: LotCache = { lot, vm: toVM(lot) }
    this.lastData = cache
    this.lastLoadedAt = Date.now()
    this.applyCache(cache)
  },

  /** 把（缓存的）渲染快照落到 data。lot 依赖 load 成功赋值，缓存命中分支也要正确设置 */
  applyCache(c: LotCache) {
    this.lot = c.lot
    this.setData({
      state: 'ready',
      lotName: c.vm.lotName,
      lotAddress: c.vm.lotAddress,
      pricing: c.vm.pricing,
      facilitiesText: c.vm.facilitiesText,
    })
  },

  onPickRole() {
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  onBindLot() {
    // 绑定会改车场归属，先失效缓存，回来时强制重拉
    this.lastLoadedAt = 0
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load(true)
  },

  // ---- 编辑弹窗 ----
  onEditName() {
    this.openEdit('name', '车场名称', this.data.lotName, false)
  },

  onEditAddress() {
    this.openEdit('address', '车场地址', this.data.lotAddress, false)
  },

  onEditFirstHour() {
    this.openEdit('firstHour', '首小时（元）', this.data.pricing?.firstHour || '', true)
  },

  onEditPerHourAfter() {
    this.openEdit('perHourAfter', '后续每小时（元）', this.data.pricing?.perHourAfter || '', true)
  },

  onEditStep() {
    this.openEdit('stepMinutes', '计费步长（分钟）', this.data.pricing?.stepMinutes || '', true)
  },

  onEditCap() {
    this.openEdit('capPerDay', '单日封顶（元）', this.data.pricing?.capPerDay || '', true)
  },

  onEditNight() {
    this.openEdit('nightRate', '夜间费率（元/次，留空为无）', this.data.pricing?.nightRate || '', true)
  },

  openEdit(field: Field, label: string, value: string, numeric: boolean) {
    this.setData({
      editDialog: true,
      edit: { field, label, value, numeric },
      editInput: value,
      inputInvalid: false,
    })
  },

  onEditInput(e: WechatMiniprogram.Input) {
    this.setData({ editInput: e.detail.value, inputInvalid: false })
  },

  onCloseEdit() {
    this.setData({ editDialog: false })
  },

  async onConfirmEdit() {
    if (this.data.submitting || !this.data.edit) return
    const { field, numeric } = this.data.edit
    const val = this.data.editInput.trim()
    if (numeric) {
      const n = Number(val)
      if (!Number.isFinite(n) || n < 0) {
        this.setData({ inputInvalid: true })
        return
      }
    } else if (val === '') {
      this.setData({ inputInvalid: true })
      return
    }

    this.setData({ submitting: true })
    const patch: Record<string, unknown> = {}
    if (field === 'name' || field === 'address') {
      patch[field] = val
    } else {
      // pricing 子对象
      patch.pricing = { [field]: field === 'nightRate' && val === '' ? null : Number(val) }
    }
    const r = await updateLot(this.lot!._id, patch as Parameters<typeof updateLot>[1])
    this.setData({ submitting: false })
    if (!r.ok) {
      wx.showToast({ title: r.message || '保存失败', icon: 'none' })
      return
    }
    this.setData({ editDialog: false })
    wx.showToast({ title: '已保存', icon: 'success' })
    // 编辑改了数据，强制重拉，不信任旧缓存
    this.load(true)
  },

  noop() {},
})

/** 车场配置 → 渲染 VM（缓存载体，纯函数便于复用） */
function toVM(lot: AdminLot): LotVM {
  const p = lot.pricing || {}
  const sourceLabel = p.source === 'public' || p.source === 'ops'
    ? '已核实'
    : '示例数据，待核实'
  return {
    lotName: lot.name,
    lotAddress: lot.address,
    pricing: {
      firstHour: fmtNum(p.firstHour),
      perHourAfter: fmtNum(p.perHourAfter),
      stepMinutes: fmtNum(p.stepMinutes),
      capPerDay: fmtNum(p.capPerDay),
      nightRate: p.nightRate === null || p.nightRate === undefined ? '无' : fmtNum(p.nightRate),
      sourceLabel,
    },
    facilitiesText: lot.facilities && lot.facilities.length ? lot.facilities.join('、') : '暂无设施',
  }
}

function fmtNum(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '--'
}
