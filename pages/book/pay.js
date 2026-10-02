const { requireLoginPage } = require('../../utils/auth')
const { getBook, resetBook, setBookStep, saveBook } = require('../../utils/book')
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

function invokePay(payParams) {
  return new Promise((resolve, reject) => {
    if (!payParams || payParams.mock) {
      reject({ message: '缺少真实支付参数' })
      return
    }
    wx.requestPayment({
      timeStamp: payParams.timeStamp,
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || 'MD5',
      paySign: payParams.paySign,
      success: resolve,
      fail: (err) => {
        reject({ message: (err && err.errMsg) || '支付取消或失败' })
      }
    })
  })
}

Page({
  data: {
    agreed: false,
    needPhone: false,
    payMock: true,
    wxMockLogin: true,
    agreementVersion: 'v1',
    phoneMasked: '',
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
      const payMock = settings.payMock !== false
      const wxMockLogin = settings.wxMockLogin !== false
      this.setData({
        needPhone: !user.phone,
        payMock,
        wxMockLogin,
        phoneMasked: user.phone ? maskPhone(user.phone) : '',
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
      // 演示环境：自动用寄件人手机号完成账号绑定，避免开发者工具无法真授权
      if (!user.phone && (payMock || wxMockLogin)) {
        this.bindMockPhone(s.phone || '13800000000')
      }
    })
  },
  bindMockPhone(phone) {
    const next = String(phone || '13800000000').replace(/\D/g, '') || '13800000000'
    return request({ url: '/auth/wx-phone', method: 'POST', data: { phone: next } })
      .then((d) => {
        const user = wx.getStorageSync('user') || {}
        user.phone = d.phone
        wx.setStorageSync('user', user)
        this.setData({ needPhone: false, phoneMasked: maskPhone(d.phone) })
        return d.phone
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
      // 开发者工具 / 用户拒绝：演示环境回落模拟号
      if (this.data.payMock || this.data.wxMockLogin) {
        const b = getBook()
        this.bindMockPhone((b.sender && b.sender.phone) || '13800000000').catch((err) =>
          wx.showToast({ title: (err && err.message) || '授权失败', icon: 'none' })
        )
        return
      }
      wx.showToast({ title: '需要授权手机号', icon: 'none' })
      return
    }
    request({ url: '/auth/wx-phone', method: 'POST', data: { code } })
      .then((d) => {
        const user = wx.getStorageSync('user') || {}
        user.phone = d.phone
        wx.setStorageSync('user', user)
        this.setData({ needPhone: false, phoneMasked: maskPhone(d.phone) })
      })
      .catch((err) => wx.showToast({ title: err.message || '授权失败', icon: 'none' }))
  },
  pay() {
    if (!this.data.agreed) {
      wx.showToast({ title: '请先同意协议', icon: 'none' })
      return
    }
    const startPay = () => {
      const b = getBook()
      if (!b.quote) {
        wx.showToast({ title: '报价已失效', icon: 'none' })
        return
      }
      // 代办检疫：缺办理人时用寄件人/宠物名补齐，避免仅报「缺少字段：name」
      if (b.quarantineMode === 'agency') {
        const sender = b.sender || {}
        b.agency = {
          name: (b.agency && b.agency.name) || sender.name || '',
          phone: (b.agency && b.agency.phone) || sender.phone || '',
          petName: (b.agency && b.agency.petName) || b.petName || b.breed || ''
        }
        if (!b.agency.name || !b.agency.phone || !b.agency.petName) {
          wx.showToast({ title: '请补充代办检疫办理人信息', icon: 'none' })
          return
        }
        saveBook()
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
          const useMock = data.payMock || (data.payParams && data.payParams.mock) || this.data.payMock
          if (useMock) {
            return request({ url: `/orders/${data.orderId}/mock-pay`, method: 'POST' }).then(() => data.orderId)
          }
          wx.hideLoading()
          wx.showLoading({ title: '拉起支付' })
          return invokePay(data.payParams).then(() => data.orderId)
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

    if (this.data.needPhone) {
      if (this.data.payMock || this.data.wxMockLogin) {
        const b = getBook()
        this.bindMockPhone((b.sender && b.sender.phone) || '13800000000')
          .then(() => startPay())
          .catch((err) => wx.showToast({ title: (err && err.message) || '请先授权手机号', icon: 'none' }))
        return
      }
      wx.showToast({ title: '请先授权手机号', icon: 'none' })
      return
    }
    startPay()
  }
})
