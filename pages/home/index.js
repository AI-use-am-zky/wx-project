const { isLoggedIn, openLogin } = require('../../utils/auth')
const { getBook, saveBook, draftResume, hideResume } = require('../../utils/book')
const { openAddressForm, openAddressBook } = require('../../utils/address-entry')
const { findProvince, indexesFor, cityFromIndex } = require('../../utils/regions')
const { isPickingMedia, clearMediaPick } = require('../../utils/media-pick')

function maskPhone(phone) {
  const s = String(phone || '')
  if (s.length < 7) return s
  return s.slice(0, 3) + '****' + s.slice(-4)
}

function lineOf(addr) {
  if (!addr) return ''
  return [addr.province, addr.city, addr.district, addr.detail].filter(Boolean).join('')
}

function cityOf(addr) {
  if (!addr || !addr.province) return null
  const province = findProvince(addr.province)
  if (!province) return null
  const idx = indexesFor(province.name, addr.city)
  return cityFromIndex(idx[0], idx[1])
}

function kefuMetrics() {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const width = win.windowWidth
  const height = win.windowHeight
  const rpx = width / 750
  const size = Math.round(120 * rpx)
  const barW = Math.round(36 * rpx)
  const barH = Math.round(132 * rpx)
  const edge = Math.round(24 * rpx)
  const topMin = (win.statusBarHeight || 20) + Math.round(88 * rpx)
  const safeBottom = win.safeArea ? Math.max(0, height - win.safeArea.bottom) : 0
  const maxY = height - (48 + safeBottom) - Math.round(24 * rpx) - size
  return { width, height, rpx, size, barW, barH, edge, topMin, maxY: Math.max(topMin, maxY) }
}

const KEFU_ANIM = 'transition: left .28s cubic-bezier(.2,.8,.2,1), top .28s cubic-bezier(.2,.8,.2,1), width .28s ease, height .28s ease;'

Page({
  data: {
    kefuX: 0,
    kefuY: 0,
    kefuW: 50,
    kefuH: 50,
    kefuSide: 'right',
    kefuCollapsed: false,
    kefuOn: false,
    kefuMoved: false,
    kefuAnim: '',
    swiperList: [
      { id: 0, url: '/images/banner/1.jpg' },
      { id: 1, url: '/images/banner/2.jpg' },
      { id: 2, url: '/images/banner/3.jpg' }
    ],
    senderName: '寄件人信息',
    receiverName: '收件人信息',
    senderPhone: '',
    receiverPhone: '',
    senderLine: '',
    receiverLine: '',
    resumeText: '',
    resumeUrl: '',
    resumeTab: false
  },
  onLoad() {
    this.placeKefu()
    this.armKefuTimer()
  },
  onShow() {
    if (isPickingMedia()) return
    this.takePicked()
    this.sync()
    this.syncResume()
    this.armKefuTimer()
  },
  onHide() {
    this.clearKefuTimer()
  },
  onUnload() {
    this.clearKefuTimer()
  },
  placeKefu() {
    const m = kefuMetrics()
    this._kefu = m
    const x = m.width - m.edge - m.size
    const y = Math.min(m.maxY, m.height - Math.round(150 * m.rpx) - m.size)
    this._restX = x
    this._restY = Math.max(m.topMin, y)
    this._side = 'right'
    this.setData({
      kefuX: this._restX,
      kefuY: this._restY,
      kefuW: m.size,
      kefuH: m.size,
      kefuSide: 'right',
      kefuCollapsed: false,
      kefuOn: true,
      kefuAnim: ''
    })
  },
  clearKefuTimer() {
    if (this._kefuTimer) {
      clearTimeout(this._kefuTimer)
      this._kefuTimer = null
    }
  },
  armKefuTimer(delay) {
    this.clearKefuTimer()
    if (this.data.kefuCollapsed) return
    this._kefuTimer = setTimeout(() => this.collapseKefu(), delay == null ? 2000 : delay)
  },
  collapseKefu() {
    const m = this._kefu || kefuMetrics()
    const side = this._side || 'right'
    const y = this._restY + (m.size - m.barH) / 2
    const x = side === 'left' ? 0 : m.width - m.barW
    this.setData({
      kefuCollapsed: true,
      kefuAnim: KEFU_ANIM,
      kefuSide: side,
      kefuX: x,
      kefuY: Math.max(m.topMin, y),
      kefuW: m.barW,
      kefuH: m.barH
    })
  },
  expandKefu() {
    const m = this._kefu || kefuMetrics()
    this.setData({
      kefuCollapsed: false,
      kefuMoved: false,
      kefuAnim: KEFU_ANIM,
      kefuSide: this._side || 'right',
      kefuX: this._restX,
      kefuY: this._restY,
      kefuW: m.size,
      kefuH: m.size
    })
    this.armKefuTimer()
  },
  onKefuStart(e) {
    const t = e.touches && e.touches[0]
    if (!t) return
    this.clearKefuTimer()
    this._sx = t.clientX
    this._sy = t.clientY
    this._ox = this.data.kefuX
    this._oy = this.data.kefuY
    this._kefuMoved = false
    if (!this.data.kefuCollapsed) this.setData({ kefuAnim: '' })
  },
  onKefuMove(e) {
    if (this.data.kefuCollapsed) return
    const t = e.touches && e.touches[0]
    if (!t) return
    const dx = t.clientX - this._sx
    const dy = t.clientY - this._sy
    if (Math.abs(dx) + Math.abs(dy) > 12) this._kefuMoved = true
    if (!this._kefuMoved) return
    const m = this._kefu || kefuMetrics()
    let x = this._ox + dx
    let y = this._oy + dy
    x = Math.max(0, Math.min(x, m.width - m.size))
    y = Math.max(m.topMin, Math.min(y, m.maxY))
    this.setData({ kefuX: x, kefuY: y })
  },
  onKefuEnd() {
    if (this.data.kefuCollapsed) {
      if (!this._kefuMoved) this.expandKefu()
      return
    }
    if (!this._kefuMoved) {
      this.armKefuTimer()
      return
    }
    const m = this._kefu || kefuMetrics()
    const side = this.data.kefuX + m.size / 2 < m.width / 2 ? 'left' : 'right'
    const x = side === 'left' ? m.edge : m.width - m.edge - m.size
    const y = Math.min(m.maxY, Math.max(m.topMin, this.data.kefuY))
    this._restX = x
    this._restY = y
    this._side = side
    this.setData({
      kefuAnim: KEFU_ANIM,
      kefuSide: side,
      kefuX: x,
      kefuY: y,
      kefuW: m.size,
      kefuH: m.size
    })
    this.armKefuTimer(2280)
  },
  takePicked() {
    const picked = wx.getStorageSync('addressPicked')
    if (!picked || !picked.role || !picked.address) return
    wx.removeStorageSync('addressPicked')
    const b = getBook()
    const addr = picked.address
    const city = cityOf(addr)
    if (picked.role === 'sender') {
      b.sender = addr
      if (city) b.fromCity = city
    } else {
      b.receiver = addr
      if (city) b.toCity = city
    }
    saveBook()
  },
  sync() {
    const b = getBook()
    const sender = b.sender || {}
    const receiver = b.receiver || {}
    this.setData({
      senderName: sender.name || '寄件人信息',
      receiverName: receiver.name || '收件人信息',
      senderPhone: maskPhone(sender.phone),
      receiverPhone: maskPhone(receiver.phone),
      senderLine: lineOf(sender),
      receiverLine: lineOf(receiver)
    })
  },
  openBook(e) {
    openAddressBook(e.currentTarget.dataset.who).catch(() => {})
  },
  editWho(e) {
    openAddressForm(e.currentTarget.dataset.who).catch(() => {})
  },
  syncResume() {
    const draft = draftResume()
    this.setData({
      resumeText: draft ? draft.text : '',
      resumeUrl: draft ? draft.url : '',
      resumeTab: Boolean(draft && draft.tab)
    })
  },
  resumeBook() {
    const url = this.data.resumeUrl
    if (!url) return
    if (!isLoggedIn()) {
      openLogin(this.data.resumeTab ? 'tab:' + url : url)
      return
    }
    clearMediaPick()
    if (this.data.resumeTab) {
      wx.switchTab({ url })
      return
    }
    wx.navigateTo({ url })
  },
  closeResume() {
    hideResume()
    this.setData({ resumeText: '', resumeUrl: '', resumeTab: false })
  },
  goBook() {
    if (!isLoggedIn()) {
      openLogin('tab:/pages/send/index')
      return
    }
    wx.switchTab({ url: '/pages/send/index' })
  },
  goGuide(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.navigateTo({ url })
  }
})
