const { request } = require('./utils/request')
const { restoreUrlAfterPick, clearMediaPick, isPickingMedia } = require('./utils/media-pick')
const { restore } = require('./utils/auth')

App({
  globalData: {
    book: null,
    settings: null,
    pickingMedia: false
  },
  loginReady: Promise.resolve(),
  onLaunch() {
    if (wx.getStorageSync('pickingMediaAt')) {
      this.globalData.pickingMedia = true
    }
    wx.removeStorageSync('loginAsked')
    restore()
    this.loginReady = request({ url: '/meta/settings', needAuth: false })
      .then((data) => {
        this.globalData.settings = data
      })
      .catch(() => {})
  },
  onShow() {
    if (isPickingMedia()) this.globalData.pickingMedia = true
    setTimeout(() => {
      const url = restoreUrlAfterPick()
      if (!url) return
      clearMediaPick()
      wx.navigateTo({ url })
    }, 300)
  }
})
