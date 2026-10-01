const { requireLoginPage } = require('../../utils/auth')
const { request, uploadFile } = require('../../utils/request')
const config = require('../../utils/config')

const DEFAULT_AVATAR =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

function displayAvatar(url) {
  if (!url) return DEFAULT_AVATAR
  if (/^https?:\/\//.test(url) || url.indexOf('wxfile://') === 0) return url
  return config.baseUrl + url
}

Page({
  data: {
    avatarUrl: DEFAULT_AVATAR,
    nickName: '',
    phone: '',
    saving: false
  },
  _avatarPath: '',
  onLoad() {
    requireLoginPage()
      .then(() => this.loadMe())
      .catch(() => {})
  },
  loadMe() {
    return request({ url: '/auth/me' })
      .then((data) => {
        const user = data.user || {}
        wx.setStorageSync('user', user)
        this._avatarPath = user.avatarUrl || ''
        this.setData({
          avatarUrl: displayAvatar(user.avatarUrl),
          nickName: user.nickName || '',
          phone: user.phone || ''
        })
      })
      .catch((e) => wx.showToast({ title: e.message || '加载失败', icon: 'none' }))
  },
  onChooseAvatar(e) {
    const tempPath = e.detail && e.detail.avatarUrl
    if (!tempPath) return
    this.setData({ avatarUrl: tempPath })
    wx.showLoading({ title: '上传中' })
    uploadFile(tempPath)
      .then((up) => {
        const path = (up && up.url) || tempPath
        this._avatarPath = path
        return request({ url: '/auth/profile', method: 'POST', data: { avatarUrl: path } })
      })
      .then((data) => {
        wx.hideLoading()
        const user = data.user || {}
        wx.setStorageSync('user', user)
        this._avatarPath = user.avatarUrl || this._avatarPath
        this.setData({ avatarUrl: displayAvatar(user.avatarUrl || tempPath) })
        wx.showToast({ title: '头像已更新', icon: 'success' })
      })
      .catch((err) => {
        wx.hideLoading()
        this._avatarPath = tempPath
        wx.showToast({ title: (err && err.message) || '头像上传失败', icon: 'none' })
      })
  },
  onNickInput(e) {
    this.setData({ nickName: e.detail.value || '' })
  },
  onNickBlur(e) {
    this.setData({ nickName: (e.detail && e.detail.value) || this.data.nickName || '' })
  },
  onPhone(e) {
    const code = e.detail && e.detail.code
    if (!code) {
      wx.showToast({ title: '需要授权手机号', icon: 'none' })
      return
    }
    request({ url: '/auth/wx-phone', method: 'POST', data: { code } })
      .then((d) => {
        const user = wx.getStorageSync('user') || {}
        user.phone = d.phone
        wx.setStorageSync('user', user)
        this.setData({ phone: d.phone })
        wx.showToast({ title: '手机号已绑定', icon: 'success' })
      })
      .catch((err) => wx.showToast({ title: err.message || '授权失败', icon: 'none' }))
  },
  save() {
    if (this.data.saving) return
    const nickName = (this.data.nickName || '').trim()
    if (!nickName) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    request({
      url: '/auth/profile',
      method: 'POST',
      data: {
        nickName,
        avatarUrl: this._avatarPath || ''
      }
    })
      .then((data) => {
        wx.setStorageSync('user', data.user || {})
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 400)
      })
      .catch((e) => wx.showToast({ title: e.message || '保存失败', icon: 'none' }))
      .then(() => this.setData({ saving: false }))
  }
})
