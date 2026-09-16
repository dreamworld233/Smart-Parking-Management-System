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

type Field = 'firstHour' | 'perHourAfter' | 'stepMinutes' | 'capPerDay' | 'nightRate' | 'name' | 'address' | 'reservableQuota'

interface EditVM {
  field: Field
  label: string
  value: string
  /** 数字字段 */
  numeric: boolean
}

Page({
  data: {
    state: 'loading' as ViewState,
    lotName: '',
    lotAddress: '',
    pricing: null as PricingVM | null,
    quotaText: '',
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

  onShow() {
    const tabBar = this.getTabBar?.()
    tabBar?.setSelected(2)
    void this.load()
  },

  async load() {
    this.setData({ state: 'loading' })
    const r = await fetchAdminLot()
    if (!r.ok) {
      if (r.code === 'NO_AUTH') {
        this.setData({ state: 'no_role' })
        return
      }
      this.setData({ state: 'error' })
      return
    }
    if (r.data.role !== 'lot_admin') {
      this.setData({ state: 'no_role' })
      return
    }
    if (!r.data.lot) {
      this.setData({ state: 'no_lot' })
      return
    }
    const lot = r.data.lot
    const p = lot.pricing || {}
    const sourceLabel = p.source === 'public' || p.source === 'ops'
      ? '已核实'
      : '示例数据，待核实'
    this.lot = lot
    this.setData({
      state: 'ready',
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
      quotaText: typeof lot.reservableQuota === 'number' ? String(lot.reservableQuota) : '--',
      facilitiesText: lot.facilities && lot.facilities.length ? lot.facilities.join('、') : '暂无设施',
    })
  },

  onPickRole() {
    clearRole()
    wx.reLaunch({ url: '/pages/role-select/role-select' })
  },

  onBindLot() {
    wx.navigateTo({ url: '/pages/owner/bind-lot/bind-lot' })
  },

  onRetry() {
    this.load()
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

  onEditQuota() {
    this.openEdit('reservableQuota', '可预约额度（个）', this.data.quotaText, true)
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
    if (field === 'name' || field === 'address' || field === 'reservableQuota') {
      patch[field] = field === 'reservableQuota' ? Number(val) : val
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
    this.load()
  },

  noop() {},
})

function fmtNum(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '--'
}
