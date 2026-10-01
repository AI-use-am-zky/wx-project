const { request } = require('./utils/request')
const { restoreUrlAfterPick, clearMediaPick, isPickingMedia } = require('./utils/media-pick')
const { ensureLogin } = require('./utils/auth')

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
    // 先拉配置，再静默登录（有 token 则 checkSession，否则 wx.login）
    this.loginReady = request({ url: '/meta/settings', needAuth: false })
      .then((data) => {
        this.globalData.settings = data
      })
      .catch(() => {})
      .then(() =>
        ensureLogin().catch((e) => {
          console.warn('silent login failed', e)
        })
      )
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
