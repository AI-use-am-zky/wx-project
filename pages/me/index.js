const { isLoggedIn, login, needsProfile, errMessage } = require('../../utils/auth')
const { go, goOrders } = require('../../utils/nav')
const { fetchBadges, markBadgeSeen, logOp } = require('../../utils/session')
const { isPickingMedia } = require('../../utils/media-pick')
const { request } = require('../../utils/request')
const config = require('../../utils/config')

const DEFAULT_AVATAR =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

function displayAvatar(url) {
  if (!url) return ''
  if (/^https?:\/\//.test(url) || url.indexOf('wxfile://') === 0) return url
  return config.baseUrl + url
}

Page({
  data: {
    loggedIn: false,
    phone: '',
    nickName: '',
    avatarUrl: '',
    needProfile: false,
    padTop: 0,
    navH: 32,
    navPad: 24,
    badges: { pending: 0, transit: 0, done: 0, cancelled: 0 }
  },
  onLoad() {
    const mb = wx.getMenuButtonBoundingClientRect()
    this.setData({
      padTop: 0,
      navPad: mb.top,
      navH: mb.height
    })
  },
  onShow() {
    if (isPickingMedia()) return
    const ready = (getApp() && getApp().loginReady) || Promise.resolve()
    ready.then(() => this.afterAuth()).catch(() => this.afterAuth())
  },
  afterAuth() {
    if (!isLoggedIn()) {
      this.setData({
        loggedIn: false,
        phone: '',
        nickName: '',
        avatarUrl: '',
        needProfile: false,
        badges: { pending: 0, transit: 0, done: 0, cancelled: 0 }
      })
      logOp('open_me', {})
      return
    }
    request({ url: '/auth/me' })
      .then((data) => {
        const user = data.user || {}
        wx.setStorageSync('user', user)
        this.applyUser(user)
        this.loadBadges()
        logOp('open_me', {})
      })
      .catch(() => {
        const user = wx.getStorageSync('user') || {}
        this.applyUser(user)
        this.loadBadges()
      })
  },
  applyUser(user) {
    const nickName = user.nickName || ''
    const avatarUrl = displayAvatar(user.avatarUrl)
    this.setData({
      loggedIn: true,
      phone: user.phone || '',
      nickName,
      avatarUrl,
      needProfile: needsProfile(user)
    })
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
    if (!this.data.loggedIn) {
      wx.showLoading({ title: '登录中' })
      login()
        .then((data) => {
          wx.hideLoading()
          const user = (data && data.user) || wx.getStorageSync('user') || {}
          this.applyUser(user)
          this.loadBadges()
          // 官方流程：登录只拿 openid；头像昵称需用户主动填写
          if (needsProfile(user) || (data && data.needProfile)) {
            wx.navigateTo({ url: '/pages/me/profile' })
          } else {
            wx.showToast({ title: '登录成功', icon: 'success' })
          }
        })
        .catch((e) => {
          wx.hideLoading()
          wx.showToast({ title: errMessage(e), icon: 'none', duration: 3500 })
        })
      return
    }
    wx.navigateTo({ url: '/pages/me/profile' })
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
