const { requireLoginPage } = require('../../utils/auth')
const { getBook, resetBook, setBookStep } = require('../../utils/book')
const { request, yuan } = require('../../utils/request')
const { cityLabel } = require('../../utils/regions')

function maskPhone(p) {
  const s = String(p || '')
  if (s.length < 7) return s
  return s.slice(0, 3) + '****' + s.slice(-4)
}

function addrLine(a) {
  if (!a) return ''
  return [a.city, a.district, a.detail].filter(Boolean).join(' ')
}

Page({
  data: {
    agreed: false,
    needPhone: false,
    agreementVersion: 'v1',
    summary: {
      pet: '',
      sender: '',
      senderAddr: '',
      receiver: '',
      pickupDate: '',
      crate: '',
      quarantine: '',
      insure: '',
      totalYuan: '0.00'
    }
  },
  onLoad() {
    requireLoginPage().then(() => {
      const user = wx.getStorageSync('user') || {}
      const settings = getApp().globalData.settings || {}
      const b = getBook()
      const s = b.sender || {}
      const r = b.receiver || {}
      this.setData({
        needPhone: !user.phone,
        agreementVersion: settings.agreementVersion || 'v1',
        summary: {
          pet: [b.petName, b.breed, b.weightKg ? b.weightKg + 'kg' : '', cityLabel(b.fromCity) && cityLabel(b.toCity) ? cityLabel(b.fromCity) + ' → ' + cityLabel(b.toCity) : '']
            .filter(Boolean)
            .join(' · '),
          sender: [s.name, maskPhone(s.phone)].filter(Boolean).join(' '),
          senderAddr: addrLine(s),
          receiver: [r.name, maskPhone(r.phone)].filter(Boolean).join(' '),
          pickupDate: b.pickupDate || '',
          crate: b.crateMode === 'buy' ? '购买航空箱' : '自备',
          quarantine: b.quarantineMode === 'agency' ? '代办检疫' : '自备证明',
          insure: b.insure ? '已保价' : '不保价',
          totalYuan: yuan(b.previewTotalCents || (b.quote && b.quote.sellFreightCents) || 0)
        }
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
