const { requireLoginPage } = require('../../utils/auth')
const { request, yuan } = require('../../utils/request')

const STATUS_TEXT = {
  pending_pay: '待支付',
  paid: '已支付',
  sf_submitting: '正在向承运方下单',
  sf_failed: '下单失败，人工处理中',
  booked: '已预约上门',
  collected: '已揽收',
  in_transit: '运输中',
  signed: '已签收',
  cancel_requested: '取消处理中',
  cancelled: '已取消',
  refunded: '已退款',
  surcharge_pending: '待补差'
}

Page({
  data: { order: {}, canCancel: false, phone: '' },
  onLoad(q) {
    this.id = q.id
    requireLoginPage().then(() => this.load())
  },
  load() {
    const settings = getApp().globalData.settings || {}
    request({ url: '/orders/' + this.id })
      .then((o) => {
        const blocked = ['collected', 'in_transit', 'signed', 'cancelled', 'refunded', 'refunding'].includes(o.status)
        this.setData({
          phone: settings.customerServicePhone || '',
          canCancel: !blocked && !o.demo,
          order: { ...o, paidYuan: yuan(o.paidCents), statusText: STATUS_TEXT[o.status] || o.status }
        })
      })
      .catch((e) => wx.showToast({ title: e.message || '加载失败', icon: 'none' }))
  },
  copy() {
    wx.setClipboardData({ data: this.data.order.sfWaybillNo || '' })
  },
  call() {
    if (this.data.phone) wx.makePhoneCall({ phoneNumber: this.data.phone })
  },
  cancel() {
    wx.showModal({
      title: '确认取消',
      content: '未生成运单全额退；已下单未揽收将扣除手续费。已揽收不可退。',
      success: (r) => {
        if (!r.confirm) return
        request({ url: `/orders/${this.id}/cancel`, method: 'POST' })
          .then(() => this.load())
          .catch((e) => wx.showToast({ title: e.message || '无法取消', icon: 'none' }))
      }
    })
  },
  surcharge() {
    wx.navigateTo({ url: '/pages/orders/surcharge-pay?id=' + this.id })
  }
})
