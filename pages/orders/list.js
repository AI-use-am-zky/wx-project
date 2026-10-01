const { isLoggedIn, login } = require('../../utils/auth')
const { request } = require('../../utils/request')
const { filterOrders } = require('../../utils/order-tabs')
const { getBook, saveBook } = require('../../utils/book')
const { findProvince, indexesFor, cityFromIndex } = require('../../utils/regions')
const { logOp } = require('../../utils/session')
const { isPickingMedia } = require('../../utils/media-pick')

const STATUS_TEXT = {
  pending_pay: '待支付',
  paid: '已支付',
  sf_submitting: '下单中',
  sf_failed: '待处理',
  booked: '待取件',
  collected: '已揽收',
  in_transit: '运送中',
  signed: '已签收',
  cancel_requested: '取消中',
  cancelled: '已取消',
  refunded: '已退款',
  surcharge_pending: '待补差'
}

const LEGACY = {
  all: { tab: 'sent', extra: '' },
  pending: { tab: 'pay', extra: '' },
  transit: { tab: 'sent', extra: 'transit' },
  done: { tab: 'sent', extra: 'done' },
  cancelled: { tab: 'sent', extra: 'cancelled' },
  sent: { tab: 'sent', extra: '' },
  recv: { tab: 'recv', extra: '' },
  star: { tab: 'star', extra: '' },
  pay: { tab: 'pay', extra: '' }
}

function measure() {
  let statusBarHeight = 20
  let windowWidth = 375
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    statusBarHeight = win.statusBarHeight || 20
    windowWidth = win.windowWidth || 375
  } catch (e) {}
  const rpx = windowWidth / 750
  return { statusBarHeight, topHeight: statusBarHeight + (12 + 72 + 88) * rpx }
}

function tone(status) {
  if (status === 'signed' || status === 'cancelled' || status === 'refunded') return 'done'
  return 'go'
}

function fmt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

function shortCity(name) {
  return String(name || '—').replace(/市$/, '')
}

function cityOf(addr) {
  if (!addr || !addr.province) return null
  const province = findProvince(addr.province)
  if (!province) return null
  const idx = indexesFor(province.name, addr.city)
  return cityFromIndex(idx[0], idx[1])
}

Page({
  data: {
    ...measure(),
    needLogin: true,
    list: [],
    tab: 'sent',
    extra: '',
    keyword: '',
    sentCount: 0,
    payCount: 0,
    emptyText: '暂无运单'
  },
  onShow() {
    if (isPickingMedia()) return
    const stored = wx.getStorageSync('orderTab')
    wx.removeStorageSync('orderTab')
    if (stored && LEGACY[stored]) {
      this.setData(LEGACY[stored])
    }
    const ready = (getApp() && getApp().loginReady) || Promise.resolve()
    ready.then(() => this.afterAuth()).catch(() => this.afterAuth())
  },
  afterAuth() {
    if (!isLoggedIn()) {
      this.setData({ needLogin: true, list: [], sentCount: 0, payCount: 0 })
      return
    }
    this.setData({ needLogin: false })
    this.load()
  },
  load() {
    request({ url: '/orders' })
      .then((data) => {
        this._all = (data.list || []).map((o) => {
          const sender = o.sender || {}
          const receiver = o.receiver || {}
          const photos = o.petPhotos || []
          return {
            ...o,
            waybill: o.sfWaybillNo || o.id,
            fromCity: shortCity(sender.city),
            toCity: shortCity(receiver.city),
            when: (o.status === 'signed' ? '签收 ' : '寄出 ') + fmt(o.createdAt),
            who: receiver.name ? '收 ' + receiver.name : '',
            receiverPhone: receiver.phone || '',
            cover: photos[0] || '',
            statusText: STATUS_TEXT[o.status] || o.status,
            statusTone: tone(o.status),
            title: [o.petName, o.breed].filter(Boolean).join(' ')
          }
        })
        this.apply()
        logOp('view_orders', { tab: this.data.tab, count: this._all.length })
      })
      .catch((e) => {
        if (e && e.code === 401) {
          login().then(() => this.load()).catch(() => this.setData({ needLogin: true, list: [] }))
          return
        }
        this._all = []
        this.apply()
      })
  },
  apply() {
    const all = this._all || []
    let list = all
    const tab = this.data.tab
    if (tab === 'pay') list = all.filter((o) => o.status === 'pending_pay')
    else if (tab === 'recv' || tab === 'star') list = []
    else if (this.data.extra) list = filterOrders(all, this.data.extra)
    const q = String(this.data.keyword || '').trim()
    if (q) {
      list = list.filter((o) => [o.sfWaybillNo, o.id, o.fromCity, o.toCity, o.title, o.who].join(' ').indexOf(q) >= 0)
    }
    const emptyText = tab === 'recv' ? '暂无收到的快递' : (tab === 'star' ? '暂无关注的运单' : '暂无运单')
    this.setData({
      list,
      emptyText,
      sentCount: all.length,
      payCount: all.filter((o) => o.status === 'pending_pay').length
    })
  },
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ tab, extra: '' })
    this.apply()
    logOp('order_tab', { tab })
  },
  openFilter() {
    const labels = ['全部', '待付款', '出行中', '已完成', '已取消']
    const keys = ['', 'pending', 'transit', 'done', 'cancelled']
    wx.showActionSheet({
      itemList: labels,
      success: (res) => {
        this.setData({ tab: 'sent', extra: keys[res.tapIndex] })
        this.apply()
      }
    })
  },
  onSearch(e) {
    this.setData({ keyword: e.detail.value })
    this.apply()
  },
  doLogin() {
    login().then(() => this.onShow()).catch((e) => wx.showToast({ title: e.message || '登录失败', icon: 'none' }))
  },
  open(e) {
    wx.navigateTo({ url: '/pages/orders/detail?id=' + e.currentTarget.dataset.id })
  },
  copyNo(e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.no || '' })
  },
  notify(e) {
    const phone = e.currentTarget.dataset.phone
    if (!phone) {
      wx.showToast({ title: '没有收件人手机号', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: phone, success: () => wx.showToast({ title: '已复制收件人手机号', icon: 'none' }) })
  },
  again(e) {
    const order = (this._all || []).find((o) => o.id === e.currentTarget.dataset.id)
    if (!order) return
    const b = getBook()
    b.sender = order.sender || null
    b.receiver = order.receiver || null
    b.fromCity = cityOf(order.sender)
    b.toCity = cityOf(order.receiver)
    b.species = order.species || b.species
    b.breed = order.breed || ''
    b.petName = order.petName || ''
    b.weightKg = order.weightKg || ''
    b.quote = null
    saveBook()
    wx.switchTab({ url: '/pages/send/index' })
  }
})
