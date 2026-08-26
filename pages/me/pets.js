const { requireLoginPage } = require('../../utils/auth')
const { request } = require('../../utils/request')

Page({
  data: { list: [] },
  onShow() {
    requireLoginPage()
      .then(() => request({ url: '/pets' }))
      .then((d) => this.setData({ list: d.list || [] }))
      .catch(() => {})
  },
  add() {
    wx.navigateTo({ url: '/pages/me/pet-edit' })
  },
  del(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除宠物？',
      success: (r) => {
        if (!r.confirm) return
        request({ url: '/pets/' + id, method: 'DELETE' }).then(() => this.onShow())
      }
    })
  }
})
