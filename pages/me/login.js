const { login, takeNext } = require('../../utils/auth')
const { isDevTools } = require('../../utils/env')
const config = require('../../utils/config')

function phoneFailTitle(detail) {
  const errno = detail && detail.errno
  if (errno === 1400001) return '手机号验证额度已用完'
  if (errno === 112) return '请先在公众平台声明收集手机号'
  if (errno === 104 || errno === 103) return '请先同意隐私保护指引'
  const msg = String((detail && detail.errMsg) || '')
  if (/privacy/i.test(msg)) return '请先同意隐私保护指引'
  if (/deny|cancel|auth deny/i.test(msg)) return '需要点允许才能登录'
  return '没有获取到手机号，请重试'
}

Page({
  data: { agreed: false, devtools: false, lastError: '' },
  onLoad() {
    this.setData({ devtools: isDevTools() })
  },
  clearError() {
    this.setData({ lastError: '' })
  },
  showError(title, detail) {
    const extra = detail ? `\n${detail}` : ''
    const text = `${title}${extra}\n接口:${config.baseUrl}`
    this.setData({ lastError: text })
    wx.showModal({ title: '登录失败', content: text, showCancel: false })
  },
  toggleAgree() {
    this.setData({ agreed: !this.data.agreed, lastError: '' })
  },
  needAgree() {
    wx.showToast({ title: '请先同意运输服务协议', icon: 'none' })
  },
  openAgreement() {
    wx.navigateTo({ url: '/pages/legal/agreement' })
  },
  onAgreePrivacy() {},
  onDevLogin() {
    if (!this.data.agreed) {
      this.needAgree()
      return
    }
    this.submit('')
  },
  onPhone(e) {
    const detail = (e && e.detail) || {}
    console.log('[login] getPhoneNumber', detail)
    if (/deny|cancel/i.test(detail.errMsg || '') || detail.errno === 103 || detail.errno === 104) {
      this.showError(phoneFailTitle(detail), `errMsg=${detail.errMsg || ''} errno=${detail.errno || ''}`)
      return
    }
    if (!detail.code) {
      this.showError(phoneFailTitle(detail), `errMsg=${detail.errMsg || ''} errno=${detail.errno || ''}`)
      return
    }
    this.submit(detail.code)
  },
  submit(phoneCode) {
    wx.showLoading({ title: '登录中' })
    login(phoneCode)
      .then(() => {
        wx.hideLoading()
        this.setData({ lastError: '' })
        wx.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => this.afterLogin(), 400)
      })
      .catch((err) => {
        wx.hideLoading()
        console.error('[login] failed', err)
        this.showError((err && err.message) || '登录失败', err && err.raw ? JSON.stringify(err.raw).slice(0, 120) : '')
      })
  },
  afterLogin() {
    const next = takeNext()
    if (next.indexOf('tab:') === 0) {
      const url = next.slice(4)
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack({ complete() { wx.switchTab({ url }) } })
      } else {
        wx.switchTab({ url })
      }
      return
    }
    if (next) {
      wx.redirectTo({ url: next })
      return
    }
    const pages = getCurrentPages()
    if (pages.length > 1) wx.navigateBack()
    else wx.switchTab({ url: '/pages/me/index' })
  }
})
