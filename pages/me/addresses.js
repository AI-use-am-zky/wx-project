const { requireLoginPage } = require('../../utils/auth')
const { request } = require('../../utils/request')

const EMPTY = { name: '', phone: '', province: '', city: '', district: '', detail: '' }

function maskPhone(phone) {
  const s = String(phone || '')
  if (s.length < 7) return s
  return s.slice(0, 3) + '****' + s.slice(-4)
}

function lineOf(a) {
  return [a.province, a.city, a.district, a.detail].filter(Boolean).join('')
}

Page({
  data: {
    list: [],
    shown: [],
    keyword: '',
    showForm: false,
    editingId: '',
    form: { ...EMPTY }
  },
  onLoad(q) {
    this.pick = (q && q.pick) || ''
    wx.setNavigationBarTitle({ title: '地址簿' })
  },
  onShow() {
    requireLoginPage().then(() => this.reload()).catch(() => {})
  },
  reload() {
    return request({ url: '/addresses' })
      .then((d) => {
        const list = (d.list || []).map((a) => ({
          ...a,
          phoneMask: maskPhone(a.phone),
          line: lineOf(a)
        }))
        this.setData({ list })
        this.apply()
      })
      .catch(() => {})
  },
  apply() {
    const q = String(this.data.keyword || '').trim()
    const shown = (this.data.list || []).filter((a) => {
      if (!q) return true
      return [a.name, a.phone, a.line].join(' ').indexOf(q) >= 0
    })
    this.setData({ shown })
  },
  onSearch(e) {
    this.setData({ keyword: e.detail.value })
    this.apply()
  },
  soon() {
    wx.showToast({ title: '暂仅支持中国内地', icon: 'none' })
  },
  noop() {},
  choose(e) {
    if (!this.pick) return
    const item = this.data.shown[e.currentTarget.dataset.index]
    if (!item) return
    wx.setStorageSync('addressPicked', { role: this.pick, address: item })
    wx.navigateBack()
  },
  share(e) {
    const item = this.data.shown[e.currentTarget.dataset.index]
    if (!item) return
    wx.setClipboardData({
      data: item.name + ' ' + item.phone + '\n' + item.line,
      success: () => wx.showToast({ title: '地址已复制', icon: 'none' })
    })
  },
  edit(e) {
    const item = this.data.shown[e.currentTarget.dataset.index]
    if (!item) return
    this.setData({
      showForm: true,
      editingId: item.id,
      form: {
        name: item.name || '',
        phone: item.phone || '',
        province: item.province || '',
        city: item.city || '',
        district: item.district || '',
        detail: item.detail || ''
      }
    })
  },
  remove(e) {
    const item = this.data.shown[e.currentTarget.dataset.index]
    if (!item) return
    wx.showModal({
      title: '删除地址',
      content: '删除后不能恢复',
      success: (res) => {
        if (!res.confirm) return
        request({ url: '/addresses/' + item.id, method: 'DELETE' })
          .then(() => this.reload())
          .catch((err) => wx.showToast({ title: err.message || '删除失败', icon: 'none' }))
      }
    })
  },
  hintManage() {
    wx.showToast({ title: '点卡片上的编辑或删除', icon: 'none' })
  },
  openForm() {
    this.setData({ showForm: true, editingId: '', form: { ...EMPTY } })
  },
  closeForm() {
    this.setData({ showForm: false, editingId: '', form: { ...EMPTY } })
  },
  onF(e) {
    this.setData({ [`form.${e.currentTarget.dataset.k}`]: e.detail.value })
  },
  save() {
    const form = this.data.form
    const editingId = this.data.editingId
    const req = editingId
      ? request({ url: '/addresses/' + editingId, method: 'PUT', data: form })
      : request({ url: '/addresses', method: 'POST', data: form })
    req
      .then(() => {
        this.closeForm()
        return this.reload()
      })
      .catch((e) => wx.showToast({ title: e.message || '保存失败', icon: 'none' }))
  }
})
