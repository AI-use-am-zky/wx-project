const { requireLoginPage } = require('../../utils/auth')
const { request, yuan } = require('../../utils/request')
const { photoSrc } = require('../../utils/photo')

const STATUS_TEXT = {
  pending_pay: '待支付',
  paid: '待回访',
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
  data: { order: {}, canCancel: false, headline: '', heroDesc: '', cover: '' },
  onLoad(q) {
    this.id = q.id
    requireLoginPage().then(() => this.load())
  },
  load() {
    request({ url: '/orders/' + this.id })
      .then((o) => {
        const blocked = ['collected', 'in_transit', 'signed', 'cancelled', 'refunded', 'refunding'].includes(o.status)
        const name = o.petName || o.breed || '爱宠'
        const toCity = (o.receiver && o.receiver.city) || '目的地'
        const headlines = {
          pending_pay: '待支付本单',
          paid: '已支付，等待电话回访',
          sf_submitting: '正在向承运方下单',
          sf_failed: '下单失败，人工处理中',
          booked: name + '待上门取件',
          collected: name + '已揽收',
          in_transit: name + '正在飞往' + toCity,
          signed: name + '已安全送达',
          cancelled: '本单已取消',
          refunded: '本单已退款',
          surcharge_pending: '复秤超出，需补差',
          cancel_requested: '取消处理中'
        }
        const descs = {
          pending_pay: '支付给本服务商。支付后客服电话回访，确认后再安排顺丰上门取件。',
          paid: '请保持手机畅通。客服会电话确认寄件人、收件人和宠物信息，确认后才会向顺丰预约上门取件。',
          sf_failed: '回访后向顺丰下单未成功，客服会继续处理，无需重复支付。',
          in_transit: '航班运输中，到达后将上门派送。可复制运单号向承运方查询路由。',
          signed: '收件人已签收，可申请电子发票。',
          surcharge_pending: '上门复秤超出阈值，支付补差后继续履约。',
          cancelled: '未揽收订单已取消，款项按规则退回。'
        }
        this.setData({
          canCancel: !blocked && !o.demo,
          headline: headlines[o.status] || (STATUS_TEXT[o.status] || o.status),
          heroDesc: descs[o.status] || '取件日前未生成运单可全额取消；已揽收不可退。',
          cover: photoSrc((o.petPhotoUrls && o.petPhotoUrls[0]) || ''),
          order: { ...o, paidYuan: yuan(o.paidCents), statusText: STATUS_TEXT[o.status] || o.status }
        })
      })
      .catch((e) => wx.showToast({ title: e.message || '加载失败', icon: 'none' }))
  },
  copy() {
    wx.setClipboardData({ data: this.data.order.sfWaybillNo || '' })
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
