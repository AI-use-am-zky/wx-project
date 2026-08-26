const { request } = require('./utils/request')
const { restoreUrlAfterPick, clearMediaPick, isPickingMedia } = require('./utils/media-pick')

App({
  globalData: {
    book: null,
    settings: null,
    pickingMedia: false
  },
  onLaunch() {
    if (wx.getStorageSync('pickingMediaAt')) {
      this.globalData.pickingMedia = true
    }
    request({ url: '/meta/settings', needAuth: false })
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
