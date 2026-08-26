const { requireLoginPage } = require('../../utils/auth')
const { request } = require('../../utils/request')

Page({
  data: {
    list: [],
    showForm: false,
    form: { name: '', phone: '', province: '', city: '', district: '', detail: '' }
  },
  onLoad(q) {
    wx.setNavigationBarTitle({ title: q.title || '地址管理' })
  },
  onShow() {
    requireLoginPage()
      .then(() => request({ url: '/addresses' }))
      .then((d) => this.setData({ list: d.list || [] }))
      .catch(() => {})
  },
  openForm() {
    this.setData({ showForm: true })
  },
  onF(e) {
    this.setData({ [`form.${e.currentTarget.dataset.k}`]: e.detail.value })
  },
  save() {
    request({ url: '/addresses', method: 'POST', data: this.data.form })
      .then(() => {
        this.setData({
          showForm: false,
          form: { name: '', phone: '', province: '', city: '', district: '', detail: '' }
        })
        return request({ url: '/addresses' })
      })
      .then((d) => this.setData({ list: d.list || [] }))
      .catch((e) => wx.showToast({ title: e.message || '保存失败', icon: 'none' }))
  }
})
