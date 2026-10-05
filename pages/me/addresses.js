const { requireLoginPage } = require('../../utils/auth')
const { request } = require('../../utils/request')
const { getBook } = require('../../utils/book')
const { looksLikeFullAddress, parseAddress, mergeParsed } = require('../../utils/address-parse')

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
    compose: false,
    editingId: '',
    pasteText: '',
    form: { ...EMPTY }
  },
  onLoad(q) {
    this.pick = (q && q.pick) || ''
    this.compose = Boolean(q && q.compose === '1')
    wx.setNavigationBarTitle({ title: '地址簿' })
    if (!this.compose) return
    const book = getBook()
    const current = this.pick === 'sender' ? book.sender : this.pick === 'receiver' ? book.receiver : null
    const hasCurrent = current && current.name
    this.setData({
      compose: true,
      showForm: true,
      editingId: hasCurrent && current.id ? current.id : '',
      form: hasCurrent
        ? {
            name: current.name || '',
            phone: current.phone || '',
            province: current.province || '',
            city: current.city || '',
            district: current.district || '',
            detail: current.detail || ''
          }
        : { ...EMPTY }
    })
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
      pasteText: '',
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
    this.setData({ showForm: true, editingId: '', pasteText: '', form: { ...EMPTY } })
  },
  closeForm() {
    if (this.compose) {
      wx.navigateBack()
      return
    }
    this.setData({ showForm: false, editingId: '', pasteText: '', form: { ...EMPTY } })
  },
  onF(e) {
    this.setData({ [`form.${e.currentTarget.dataset.k}`]: e.detail.value })
  },
  onPaste(e) {
    const text = e.detail.value || ''
    const prev = this.data.pasteText || ''
    const pasted = text.length - prev.length > 8
    this.setData({ pasteText: text })
    if (!looksLikeFullAddress(text)) return
    const parsed = parseAddress(text)
    const useful = parsed.phone || parsed.province || parsed.district || parsed.detail
    if (!useful) return
    this.setData({ form: mergeParsed(this.data.form, parsed) })
    if (pasted) wx.showToast({ title: '已识别地址', icon: 'none' })
  },
  save() {
    const form = this.data.form
    const editingId = this.data.editingId
    const missing = ['name', 'phone', 'province', 'city', 'district', 'detail'].some(
      (key) => !String(form[key] || '').trim()
    )
    if (missing) {
      wx.showToast({ title: '请把地址填完整', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(String(form.phone).trim())) {
      wx.showToast({ title: '手机号须为11位', icon: 'none' })
      return
    }
    const req = editingId
      ? request({ url: '/addresses/' + editingId, method: 'PUT', data: form })
      : request({ url: '/addresses', method: 'POST', data: { ...form, role_hint: this.pick || null } })
    req
      .then((saved) => {
        if (this.pick) {
          wx.setStorageSync('addressPicked', {
            role: this.pick,
            address: { ...form, id: (saved && saved.id) || editingId }
          })
          wx.navigateBack()
          return
        }
        this.setData({ showForm: false, editingId: '', pasteText: '', form: { ...EMPTY } })
        return this.reload()
      })
      .catch((e) => wx.showToast({ title: e.message || '保存失败', icon: 'none' }))
  }
})
