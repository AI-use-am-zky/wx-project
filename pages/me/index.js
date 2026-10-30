const { isLoggedIn, openLogin, logout } = require('../../utils/auth')
const { go, goOrders, goBack: leavePage } = require('../../utils/nav')
const { fetchBadges, markBadgeSeen, logOp } = require('../../utils/session')
const { isPickingMedia } = require('../../utils/media-pick')
const { request, uploadFile } = require('../../utils/request')
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
    defaultAvatar: DEFAULT_AVATAR,
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
    if (!user.phone) {
      logout()
      this.setData({
        loggedIn: false,
        phone: '',
        nickName: '',
        avatarUrl: ''
      })
      return
    }
    this.setData({
      loggedIn: true,
      phone: user.phone || '',
      nickName: user.nickName || '',
      avatarUrl: displayAvatar(user.avatarUrl)
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
      openLogin()
      return
    }
    this.openProfile()
  },
  openProfile() {
    wx.navigateTo({
      url: '/pages/me/profile',
      fail(err) {
        wx.showToast({ title: (err && err.errMsg) || '资料页打不开', icon: 'none' })
      }
    })
  },
  onChooseAvatar(e) {
    const tempPath = e.detail && e.detail.avatarUrl
    if (!tempPath) {
      wx.showToast({ title: '没有选到头像', icon: 'none' })
      return
    }
    this.setData({ avatarUrl: tempPath })
    wx.showLoading({ title: '更新头像' })
    uploadFile(tempPath)
      .then((up) => {
        const path = (up && up.url) || tempPath
        return request({ url: '/auth/profile', method: 'POST', data: { avatarUrl: path } })
      })
      .then((data) => {
        wx.hideLoading()
        const user = data.user || {}
        wx.setStorageSync('user', user)
        this.applyUser(user)
        if (!user.avatarUrl) this.setData({ avatarUrl: tempPath })
        wx.showToast({ title: '头像已更新', icon: 'success' })
      })
      .catch((err) => {
        wx.hideLoading()
        wx.showToast({ title: (err && err.message) || '头像保存失败', icon: 'none' })
      })
  },
  onNickInput(e) {
    this._nick = (e.detail && e.detail.value) || ''
  },
  onNickBlur(e) {
    const nickName = String((e.detail && e.detail.value) || this._nick || '').trim()
    if (!nickName || nickName === this.data.nickName) return
    this.setData({ nickName })
    request({ url: '/auth/profile', method: 'POST', data: { nickName } })
      .then((data) => {
        const user = data.user || {}
        wx.setStorageSync('user', user)
        this.applyUser(user)
      })
      .catch((err) => wx.showToast({ title: (err && err.message) || '昵称保存失败', icon: 'none' }))
  },
  goBack() {
    leavePage()
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
