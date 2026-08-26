Page({
  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },
  logout() {
    wx.removeStorageSync('token')
    wx.removeStorageSync('user')
    wx.showToast({ title: '已退出' })
    setTimeout(() => wx.switchTab({ url: '/pages/me/index' }), 400)
  }
})
