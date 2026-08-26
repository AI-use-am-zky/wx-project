const { request, yuan } = require('../../utils/request')
const { requireLoginPage } = require('../../utils/auth')

Page({
  data: { yuan: '0.00' },
  onLoad(q) {
    this.id = q.id
    requireLoginPage().then(() => request({ url: '/orders/' + this.id })).then((o) => {
      this.setData({ yuan: yuan(o.surchargeCents) })
    })
  },
  pay() {
    request({ url: `/orders/${this.id}/surcharge/pay`, method: 'POST' })
      .then(() => {
        wx.showToast({ title: '已补差' })
        setTimeout(() => wx.navigateBack(), 400)
      })
      .catch((e) => wx.showToast({ title: e.message || '失败', icon: 'none' }))
  }
})
