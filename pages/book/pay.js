const { requireLoginPage } = require('../../utils/auth')
const { getBook, resetBook, setBookStep } = require('../../utils/book')
const { request } = require('../../utils/request')

Page({
  data: { agreed: false, needPhone: false, agreementVersion: 'v1' },
  onLoad() {
    requireLoginPage().then(() => {
      const user = wx.getStorageSync('user') || {}
      const settings = getApp().globalData.settings || {}
      this.setData({
        needPhone: !user.phone,
        agreementVersion: settings.agreementVersion || 'v1'
      })
      setBookStep('pay')
    })
  },
  toggle() {
    this.setData({ agreed: !this.data.agreed })
  },
  openAgree() {
    wx.navigateTo({ url: '/pages/legal/agreement' })
  },
  onPhone(e) {
    const code = e.detail && e.detail.code
    if (!code) {
      return request({ url: '/auth/wx-phone', method: 'POST', data: { phone: '13800000000' } })
        .then((d) => {
          const user = wx.getStorageSync('user') || {}
          user.phone = d.phone
          wx.setStorageSync('user', user)
          this.setData({ needPhone: false })
        })
    }
    request({ url: '/auth/wx-phone', method: 'POST', data: { code } })
      .then((d) => {
        const user = wx.getStorageSync('user') || {}
        user.phone = d.phone
        wx.setStorageSync('user', user)
        this.setData({ needPhone: false })
      })
      .catch((err) => wx.showToast({ title: err.message || '授权失败', icon: 'none' }))
  },
  pay() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意协议', icon: 'none' })
      return
    }
    const b = getBook()
    if (!b.quote) {
      wx.showToast({ title: '报价已失效', icon: 'none' })
      return
    }
    wx.showLoading({ title: '下单中' })
    request({
      url: '/orders',
      method: 'POST',
      data: {
        quoteId: b.quote.id,
        agreementVersion: this.data.agreementVersion,
        petPhotos: b.petPhotos,
        crateMode: b.crateMode || 'own',
        crateSkuId: b.crateSkuId,
        cratePhotos: b.cratePhotos,
        quarantineMode: b.quarantineMode || 'self',
        quarantinePhotos: b.quarantinePhotos,
        agency: b.agency,
        insure: Boolean(b.insure),
        declaredValueCents: b.declaredValueCents
      }
    })
      .then((data) => {
        return request({ url: `/orders/${data.orderId}/mock-pay`, method: 'POST' }).then(() => data.orderId)
      })
      .then((orderId) => {
        wx.hideLoading()
        resetBook()
        wx.redirectTo({ url: '/pages/orders/detail?id=' + orderId })
      })
      .catch((e) => {
        wx.hideLoading()
        wx.showToast({ title: (e && e.message) || '支付失败', icon: 'none' })
      })
  }
})
