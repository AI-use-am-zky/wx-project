const { isLoggedIn, login } = require('../../utils/auth')
const { go, goOrders } = require('../../utils/nav')
const { fetchBadges, markBadgeSeen, logOp } = require('../../utils/session')
const { isPickingMedia } = require('../../utils/media-pick')

Page({
  data: {
    loggedIn: false,
    phone: '',
    padTop: 0,
    navH: 32,
    navPad: 24,
    badges: { pending: 0, transit: 0, done: 0, cancelled: 0 }
  },
  onLoad() {
    const mb = wx.getMenuButtonBoundingClientRect()
    const sys = wx.getSystemInfoSync()
    this.setData({
      padTop: 0,
      navPad: mb.top,
      navH: mb.height
    })
    this._statusBar = sys.statusBarHeight
  },
  onShow() {
    if (isPickingMedia()) return
    const user = wx.getStorageSync('user') || {}
    this.setData({
      loggedIn: isLoggedIn(),
      phone: user.phone || ''
    })
    this.loadBadges()
    logOp('open_me', {})
  },
  loadBadges() {
    if (!isLoggedIn()) {
      this.setData({ badges: { pending: 0, transit: 0, done: 0, cancelled: 0 } })
      return
    }
    fetchBadges()
      .then((data) => {
        const badges = { pending: 0, transit: 0, done: 0, cancelled: 0 }
        for (const key of Object.keys(badges)) {
          const item = data[key]
          badges[key] = item && item.unread ? item.count : 0
        }
        this.setData({ badges })
      })
      .catch(() => {})
  },
  tapUser() {
    if (this.data.loggedIn) {
      wx.navigateTo({ url: '/pages/me/settings' })
      return
    }
    login().then(() => this.onShow()).catch((e) => wx.showToast({ title: e.message || '登录失败', icon: 'none' }))
  },
  goMsg() {
    go('/pages/me/messages')
  },
  goSet() {
    go('/pages/me/settings')
  },
  allOrders() {
    goOrders('all')
  },
  goTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (this.data.badges[tab]) {
      this.setData({ [`badges.${tab}`]: 0 })
      markBadgeSeen(tab).catch(() => {})
    }
    goOrders(tab)
  },
  goPage(e) {
    go(e.currentTarget.dataset.url)
  }
})
