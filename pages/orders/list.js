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
  signed: '已签收',
  cancel_requested: '取消中',
  cancelled: '已取消',
  refunded: '已退款',
  surcharge_pending: '待补差'
}

const STATUS_CLASS = {
  pending_pay: 'st-pay',
  surcharge_pending: 'st-warn',
  sf_failed: 'st-warn',
  signed: 'st-done',
  cancelled: 'st-cancel',
  refunded: 'st-cancel',
  cancel_requested: 'st-wait'
}

function statusClass(status) {
  return STATUS_CLASS[status] || 'st-go'
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return m + '月' + day + '日'
}

Page({
  data: { needLogin: true, list: [], tabs: TABS, tab: 'all' },
  onShow() {
    if (isPickingMedia()) return
    const tab = wx.getStorageSync('orderTab') || 'all'
    wx.removeStorageSync('orderTab')
    this.setData({ tab })
    const ready = (getApp() && getApp().loginReady) || Promise.resolve()
    ready.then(() => this.afterAuth()).catch(() => this.afterAuth())
  },
  afterAuth() {
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
        const all = (data.list || []).map((o) => {
          const sender = o.sender || {}
          const receiver = o.receiver || {}
          const photos = o.petPhotos || []
          const title = [o.petName, o.breed].filter(Boolean).join(' · ') || '宠物空运'
          const path = [sender.city, sender.district].filter(Boolean).join(' ') +
            ' → ' +
            [receiver.city, receiver.district].filter(Boolean).join(' ') +
            (o.weightKg ? ' · ' + o.weightKg + 'kg' : '')
          const subline = o.sfWaybillNo
            ? '运单 ' + o.sfWaybillNo
            : (o.status === 'surcharge_pending' ? '复秤待补差' : (fmtDate(o.createdAt) + '创建'))
          return {
            ...o,
            title,
            path,
            subline,
            cover: photos[0] || '',
            paidYuan: yuan(o.paidCents),
            statusText: STATUS_TEXT[o.status] || o.status,
            statusClass: statusClass(o.status)
          }
        })
        this._all = all
        this.setData({ list: filterOrders(all, this.data.tab) })
        logOp('view_orders', { tab: this.data.tab, count: all.length })
      })
      .catch((e) => {
        if (e && e.code === 401) {
          login()
            .then(() => this.load())
            .catch(() => this.setData({ needLogin: true, list: [] }))
          return
        }
        this.setData({ list: [] })
      })
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
