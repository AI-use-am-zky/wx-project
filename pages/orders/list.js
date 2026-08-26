const { isLoggedIn, login } = require('../../utils/auth')
const { request, yuan } = require('../../utils/request')
const { TABS, filterOrders } = require('../../utils/order-tabs')
const { logOp } = require('../../utils/session')
const { isPickingMedia } = require('../../utils/media-pick')

const STATUS_TEXT = {
  pending_pay: '待付款',
  paid: '已支付',
  sf_submitting: '下单中',
  sf_failed: '待处理',
  booked: '待取件',
  collected: '已揽收',
  in_transit: '运输中',
  signed: '已完成',
  cancel_requested: '取消中',
  cancelled: '已取消',
  refunded: '已退款',
  surcharge_pending: '待补差'
}

Page({
  data: { needLogin: true, list: [], tabs: TABS, tab: 'all' },
  onShow() {
    if (isPickingMedia()) return
    const tab = wx.getStorageSync('orderTab') || 'all'
    wx.removeStorageSync('orderTab')
    this.setData({ tab })
    if (!isLoggedIn()) {
      this.setData({ needLogin: true, list: [] })
      return
    }
    this.setData({ needLogin: false })
    this.load()
  },
  load() {
    request({ url: '/orders' })
      .then((data) => {
        const all = (data.list || []).map((o) => ({
          ...o,
          paidYuan: yuan(o.paidCents),
          statusText: STATUS_TEXT[o.status] || o.status
        }))
        this._all = all
        this.setData({ list: filterOrders(all, this.data.tab) })
        logOp('view_orders', { tab: this.data.tab, count: all.length })
      })
      .catch(() => this.setData({ list: [] }))
  },
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab, list: filterOrders(this._all || [], tab) })
    logOp('order_tab', { tab })
  },
  doLogin() {
    login().then(() => this.onShow()).catch((e) => wx.showToast({ title: e.message || '登录失败', icon: 'none' }))
  },
  open(e) {
    wx.navigateTo({ url: '/pages/orders/detail?id=' + e.currentTarget.dataset.id })
  }
})
