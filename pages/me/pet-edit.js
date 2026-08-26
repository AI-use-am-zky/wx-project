const { requireLoginPage } = require('../../utils/auth')
const { request } = require('../../utils/request')

Page({
  data: { name: '', species: '', breed: '', weightKg: '', gender: '', note: '' },
  onLoad() {
    requireLoginPage().catch(() => {})
  },
  on(e) {
    this.setData({ [e.currentTarget.dataset.k]: e.detail.value })
  },
  save() {
    request({
      url: '/pets',
      method: 'POST',
      data: this.data
    })
      .then(() => {
        wx.showToast({ title: '已保存' })
        setTimeout(() => wx.navigateBack(), 400)
      })
      .catch((e) => wx.showToast({ title: e.message || '失败', icon: 'none' }))
  }
})
