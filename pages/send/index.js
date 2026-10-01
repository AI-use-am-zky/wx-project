const { getBook, saveBook, setBookStep } = require('../../utils/book')
const { requireLoginPage } = require('../../utils/auth')
const { findProvince, indexesFor, cityFromIndex, samePlace } = require('../../utils/regions')
const { isPickingMedia } = require('../../utils/media-pick')
const { yuan } = require('../../utils/request')

const TIMES = ['今天两小时内', '今天 18:00 前', '明天 09:00-12:00', '明天 12:00-18:00']
const PAYS = ['寄付现结', '到付']

function measure() {
  let statusBarHeight = 20
  let menu = null
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    statusBarHeight = win.statusBarHeight || 20
  } catch (e) {}
  try {
    menu = wx.getMenuButtonBoundingClientRect()
  } catch (e) {}
  const menuHeight = menu && menu.height ? menu.height : 32
  const menuTop = menu && menu.top ? menu.top : statusBarHeight + 6
  const gap = Math.max(menuTop - statusBarHeight, 0)
  return { statusBarHeight, navHeight: statusBarHeight + gap * 2 + menuHeight }
}

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

function blank() {
  return { name: '', phone: '', province: '', city: '', district: '', detail: '' }
}

Page({
  data: {
    ...measure(),
    sender: blank(),
    receiver: blank(),
    senderLine: '',
    receiverLine: '',
    senderPhoneMask: '',
    receiverPhoneMask: '',
    showInvite: true,
    pickupTime: '今天两小时内',
    goodsText: '请填写宠物和重量',
    goodsReady: false,
    payMethod: '寄付现结',
    etaKey: 'standard',
    etas: [],
    insureMode: 'none',
    declaredYuan: '',
    fixedYuan: '500',
    remark: '',
    totalText: '--'
  },
  onShow() {
    if (isPickingMedia()) return
    this.takePicked()
    this.sync()
  },
  takePicked() {
    const picked = wx.getStorageSync('addressPicked')
    if (!picked || !picked.role || !picked.address) return
    wx.removeStorageSync('addressPicked')
    const b = getBook()
    const addr = picked.address
    if (picked.role === 'sender') {
      b.sender = addr
      const city = cityOf(addr)
      if (city) b.fromCity = city
    } else {
      b.receiver = addr
      const city = cityOf(addr)
      if (city) b.toCity = city
    }
    saveBook()
  },
  sync() {
    const b = getBook()
    const sender = b.sender || blank()
    const receiver = b.receiver || blank()
    const goods = [b.petName || b.breed || b.species, b.weightKg ? b.weightKg + 'kg' : ''].filter(Boolean).join('，')
    const quote = b.quote
    const cents = b.previewTotalCents != null ? b.previewTotalCents : (quote && quote.sellFreightCents)
    const total = cents != null ? yuan(cents) : '--'
    const priced = cents != null ? '¥' + yuan(cents) : '待估价'
    const etaPrice = (key) => (cents != null && this.data.etaKey === key ? priced : '待估价')
    this.setData({
      sender,
      receiver,
      senderLine: lineOf(sender),
      receiverLine: lineOf(receiver),
      senderPhoneMask: maskPhone(sender.phone),
      receiverPhoneMask: maskPhone(receiver.phone),
      goodsText: goods || '请填写宠物和重量',
      goodsReady: Boolean(b.species && b.weightKg),
      insureMode: b.insure ? (this.data.insureMode === 'fixed' ? 'fixed' : 'basic') : 'none',
      declaredYuan: b.declaredValueCents ? String(Math.round(Number(b.declaredValueCents) / 100)) : this.data.declaredYuan,
      remark: b.petNote || this.data.remark,
      totalText: total,
      etas: [
        { key: 'express', name: '空运次日', eta: '明天 18:00 前', price: etaPrice('express') },
        { key: 'standard', name: '空运标准', eta: '按承运方可约航班', price: etaPrice('standard') },
        { key: 'economy', name: '空运经济', eta: '航班较满时顺延', price: etaPrice('economy') }
      ]
    })
  },
  editWho() {
    const b = getBook()
    if (!b.fromCity || !b.toCity) {
      wx.showToast({ title: '请先用地址簿选择寄收地址', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/book/addresses' })
  },
  openBook(e) {
    const who = e.currentTarget.dataset.who
    requireLoginPage()
      .then(() => wx.navigateTo({ url: '/pages/me/addresses?pick=' + who + '&title=地址簿' }))
      .catch(() => {})
  },
  closeInvite() {
    this.setData({ showInvite: false })
  },
  swap() {
    const b = getBook()
    const sender = b.sender
    b.sender = b.receiver
    b.receiver = sender
    const from = b.fromCity
    b.fromCity = b.toCity
    b.toCity = from
    saveBook()
    this.sync()
  },
  pointMode() {
    wx.showToast({ title: '当前只支持上门取件', icon: 'none' })
  },
  pickTime() {
    wx.showActionSheet({
      itemList: TIMES,
      success: (res) => this.setData({ pickupTime: TIMES[res.tapIndex] })
    })
  },
  editGoods() {
    requireLoginPage()
      .then(() => {
        const b = getBook()
        if (!b.fromCity || !b.toCity || !(b.sender && b.sender.name) || !(b.receiver && b.receiver.name)) {
          wx.showToast({ title: '请先填好寄收地址', icon: 'none' })
          return
        }
        wx.navigateTo({ url: '/pages/book/goods' })
      })
      .catch(() => {})
  },
  pickPay() {
    wx.showActionSheet({
      itemList: PAYS,
      success: (res) => {
        if (PAYS[res.tapIndex] !== '寄付现结') {
          wx.showToast({ title: '当前仅支持寄付现结', icon: 'none' })
          return
        }
        this.setData({ payMethod: '寄付现结' })
      }
    })
  },
  pickEta(e) {
    this.setData({ etaKey: e.currentTarget.dataset.key })
  },
  pickInsure(e) {
    const mode = e.currentTarget.dataset.mode
    const b = getBook()
    b.insure = true
    this.data.insureMode = mode
    if (mode === 'fixed') {
      const yuanValue = Number(this.data.fixedYuan) || 500
      b.declaredValueCents = yuanValue * 100
      this.data.declaredYuan = String(yuanValue)
    }
    saveBook()
    this.sync()
  },
  pickFixed(e) {
    const yuanValue = e.currentTarget.dataset.yuan
    const b = getBook()
    b.insure = true
    b.declaredValueCents = Number(yuanValue) * 100
    saveBook()
    this.setData({ insureMode: 'fixed', fixedYuan: String(yuanValue), declaredYuan: String(yuanValue) })
  },
  onDeclared(e) {
    const value = String(e.detail.value || '').replace(/[^\d.]/g, '')
    const b = getBook()
    b.insure = true
    b.declaredValueCents = Math.round(Number(value || 0) * 100)
    saveBook()
    this.setData({ declaredYuan: value, insureMode: 'basic' })
  },
  noop() {},
  pickCoupon() {
    wx.showToast({ title: '暂无可用优惠券', icon: 'none' })
  },
  onRemark(e) {
    const remark = e.detail.value
    const b = getBook()
    b.petNote = remark
    saveBook()
    this.setData({ remark })
  },
  showDetail() {
    const b = getBook()
    const lines = (b.quote && b.quote.lines) || []
    const body = lines.length
      ? lines.map((item) => item.name + '  ¥' + yuan(item.cents)).join('\n')
      : '填写寄收地址和宠物重量后，才会生成估价。'
    wx.showModal({ title: '费用明细', content: body, showCancel: false })
  },
  submit() {
    requireLoginPage()
      .then(() => {
        const b = getBook()
        if (!b.sender || !b.sender.name || !b.receiver || !b.receiver.name) {
          wx.showToast({ title: '请先填写寄收地址', icon: 'none' })
          return
        }
        if (!b.fromCity || !b.toCity) {
          wx.showToast({ title: '地址里缺少可识别的城市', icon: 'none' })
          return
        }
        if (samePlace(b.fromCity, b.toCity)) {
          wx.showToast({ title: '出发与到达不能相同', icon: 'none' })
          return
        }
        if (!b.species || !b.weightKg) {
          wx.showToast({ title: '请填写物品信息', icon: 'none' })
          this.editGoods()
          return
        }
        setBookStep(b.quote ? 'quote-result' : 'pet-quote')
        wx.navigateTo({ url: b.quote ? '/pages/book/quote-result' : '/pages/book/pet-quote' })
      })
      .catch(() => {})
  }
})
