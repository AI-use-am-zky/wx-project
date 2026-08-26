const { requireLoginPage } = require('../../utils/auth')
const { request, uploadFile } = require('../../utils/request')

Page({
  data: { list: [], title: '' },
  onShow() {
    requireLoginPage()
      .then(() => request({ url: '/quarantine-docs' }))
      .then((d) => this.setData({ list: d.list || [] }))
      .catch(() => {})
  },
  onTitle(e) {
    this.setData({ title: e.detail.value })
  },
  upload() {
    if (!this.data.title) {
      wx.showToast({ title: '请填写名称', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        wx.showLoading({ title: '上传中' })
        uploadFile(res.tempFiles[0].tempFilePath)
          .then((file) =>
            request({
              url: '/quarantine-docs',
              method: 'POST',
              data: { title: this.data.title, fileId: file.fileId }
            })
          )
          .then(() => {
            wx.hideLoading()
            this.setData({ title: '' })
            this.onShow()
          })
          .catch((e) => {
            wx.hideLoading()
            wx.showToast({ title: e.message || '失败', icon: 'none' })
          })
      }
    })
  },
  del(e) {
    request({ url: '/quarantine-docs/' + e.currentTarget.dataset.id, method: 'DELETE' }).then(() => this.onShow())
  }
})
