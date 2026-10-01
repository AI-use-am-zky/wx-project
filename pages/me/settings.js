const { isDevTools } = require('../../utils/env')
const { logout } = require('../../utils/auth')

Page({
  data: { showSfDebug: false },
  onShow() {
    this.setData({ showSfDebug: isDevTools() })
  },
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },
  logout() {
    logout()
    wx.showToast({ title: '已退出' })
    setTimeout(() => wx.switchTab({ url: '/pages/me/index' }), 400)
  },
  about() {
    wx.showToast({ title: '宠途空运演示环境 v0.1', icon: 'none' })
  }
})

