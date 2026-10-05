const { getBook, saveBook, setBookStep, quoteExpired } = require('../../utils/book')
const { requireLoginPage } = require('../../utils/auth')
const { findProvince, indexesFor, cityFromIndex, samePlace } = require('../../utils/regions')
const { isPickingMedia } = require('../../utils/media-pick')
const { request, yuan } = require('../../utils/request')
const { openAddressForm, openAddressBook } = require('../../utils/address-entry')
const { goodsFilled, ensurePetFields } = require('../../utils/pet')
const { goBack: leavePage } = require('../../utils/nav')

const TIMES = ['今天两小时内', '今天 18:00 前', '明天 09:00-12:00', '明天 12:00-18:00']
const PAYS = ['寄付现结', '到付']
const CRATE_PRICE = { 'crate-s': 18000, 'crate-m': 28000, 'crate-l': 42000 }
const QUARANTINE = 20000

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

function pickupDateFromLabel(label) {
  const d = new Date()
  if (/明天/.test(String(label || ''))) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function insureFeeCents(declaredValueCents) {
  return Math.max(100, Math.round((Number(declaredValueCents) || 0) * 0.01))
}

function computePreviewCents(b) {
  if (!b.quote || b.quote.sellFreightCents == null) return null
  let total = Number(b.quote.sellFreightCents) || 0
  if (b.crateMode === 'buy' && b.crateSkuId) total += CRATE_PRICE[b.crateSkuId] || 0
  if (b.quarantineMode === 'agency') total += QUARANTINE
  if (b.insure && Number(b.declaredValueCents) > 0) total += insureFeeCents(b.declaredValueCents)
  return total
}

function canQuote(b) {
  return Boolean(
    b &&
      b.sender &&
      b.sender.name &&
      b.receiver &&
      b.receiver.name &&
      b.fromCity &&
      b.toCity &&
      goodsFilled(b)
  )
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
    totalText: '--',
    quoting: false
  },
  onShow() {
    if (isPickingMedia()) return
    this.takePicked()
    this.sync()
    this.maybeQuote()
  },
  onHide() {
    this.remember()
  },
  goBack() {
    this.remember()
    leavePage()
  },
  remember() {
    if (!this._synced) return
    const b = getBook()
    const d = this.data
    b.pickupTime = d.pickupTime || b.pickupTime
    b.etaKey = d.etaKey || b.etaKey
    b.insureMode = d.insureMode || 'none'
    b.fixedYuan = d.fixedYuan || b.fixedYuan
    if (d.remark != null) b.petNote = d.remark
    saveBook()
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
    b.quote = null
    b.previewTotalCents = null
    saveBook()
  },
  sync() {
    const b = getBook()
    ensurePetFields(b)
    const preview = computePreviewCents(b)
    if (preview != null) {
      b.previewTotalCents = preview
      saveBook()
    }
    const sender = b.sender || blank()
    const receiver = b.receiver || blank()
    const goods = [b.petName || b.breed || b.species, b.weightKg ? b.weightKg + 'kg' : '']
      .filter(Boolean)
      .join('，')
    const cents = preview != null ? preview : b.previewTotalCents
    const total = cents != null ? yuan(cents) : '--'
    const priced = cents != null ? '¥' + yuan(cents) : this.data.quoting ? '估价中' : '待估价'
    const etaKey = b.etaKey || 'standard'
    const insureMode = b.insureMode && b.insureMode !== 'none' ? b.insureMode : b.insure ? 'basic' : 'none'
    const pickupTime = b.pickupTime || '今天两小时内'
    const fixedYuan = b.fixedYuan || '500'
    const remark = b.petNote || ''
    const etaPrice = (key) => (cents != null && etaKey === key ? priced : cents != null ? '¥' + yuan(cents) : priced)
    this._synced = true
    this.data.pickupTime = pickupTime
    this.data.etaKey = etaKey
    this.data.insureMode = insureMode
    this.data.fixedYuan = fixedYuan
    this.data.remark = remark
    this.setData({
      sender,
      receiver,
      senderLine: lineOf(sender),
      receiverLine: lineOf(receiver),
      senderPhoneMask: maskPhone(sender.phone),
      receiverPhoneMask: maskPhone(receiver.phone),
      pickupTime,
      etaKey,
      fixedYuan,
      goodsText: goods || '请填写宠物和重量',
      goodsReady: goodsFilled(b),
      insureMode,
      declaredYuan: b.declaredValueCents
        ? String(Math.round(Number(b.declaredValueCents) / 100))
        : this.data.declaredYuan,
      remark,
      totalText: total,
      etas: [
        { key: 'express', name: '空运次日', eta: '明天 18:00 前', price: etaPrice('express') },
        { key: 'standard', name: '空运标准', eta: '按承运方可约航班', price: etaPrice('standard') },
        { key: 'economy', name: '空运经济', eta: '航班较满时顺延', price: etaPrice('economy') }
      ]
    })
  },
  maybeQuote() {
    const b = getBook()
    ensurePetFields(b)
    if (!canQuote(b)) return
    if (b.quote && !quoteExpired(b)) {
      this.sync()
      return
    }
    this.refreshQuote()
  },
  refreshQuote() {
    const b = getBook()
    ensurePetFields(b)
    if (!canQuote(b) || this._quoting) return Promise.resolve(null)
    this._quoting = true
    this.setData({ quoting: true, totalText: '...' })
    b.pickupDate = pickupDateFromLabel(b.pickupTime || this.data.pickupTime)
    saveBook()
    return request({
      url: '/quotes',
      method: 'POST',
      data: {
        sender: b.sender,
        receiver: b.receiver,
        species: b.species,
        breed: b.breed,
        petName: b.petName,
        petNote: b.petNote || '',
        weightKg: Number(b.weightKg),
        pickupDate: b.pickupDate
      }
    })
      .then((q) => {
        b.quote = q
        b.previewTotalCents = computePreviewCents(b)
        saveBook()
        this._quoting = false
        this.setData({ quoting: false })
        this.sync()
        return q
      })
      .catch((e) => {
        this._quoting = false
        this.setData({ quoting: false })
        this.sync()
        wx.showToast({ title: (e && e.message) || '估价失败', icon: 'none' })
        return null
      })
  },
  editWho(e) {
    openAddressForm(e.currentTarget.dataset.who).catch(() => {})
  },
  openBook(e) {
    openAddressBook(e.currentTarget.dataset.who).catch(() => {})
  },
  swap() {
    const b = getBook()
    const sender = b.sender
    b.sender = b.receiver
    b.receiver = sender
    const from = b.fromCity
    b.fromCity = b.toCity
    b.toCity = from
    b.quote = null
    b.previewTotalCents = null
    saveBook()
    this.sync()
    this.maybeQuote()
  },
  pointMode() {
    wx.showToast({ title: '当前只支持上门取件', icon: 'none' })
  },
  pickTime() {
    wx.showActionSheet({
      itemList: TIMES,
      success: (res) => {
        const pickupTime = TIMES[res.tapIndex]
        const b = getBook()
        b.pickupTime = pickupTime
        b.quote = null
        b.previewTotalCents = null
        saveBook()
        this.setData({ pickupTime })
        this.maybeQuote()
      }
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
        setBookStep('goods')
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
    const etaKey = e.currentTarget.dataset.key
    const b = getBook()
    b.etaKey = etaKey
    saveBook()
    this.setData({ etaKey })
    this.sync()
  },
  pickInsure(e) {
    const mode = e.currentTarget.dataset.mode
    const b = getBook()
    b.insure = true
    b.insureMode = mode
    if (mode === 'fixed') {
      const yuanValue = Number(b.fixedYuan || this.data.fixedYuan) || 500
      b.fixedYuan = String(yuanValue)
      b.declaredValueCents = yuanValue * 100
    }
    saveBook()
    this.sync()
  },
  pickFixed(e) {
    const yuanValue = e.currentTarget.dataset.yuan
    const b = getBook()
    b.insure = true
    b.insureMode = 'fixed'
    b.fixedYuan = String(yuanValue)
    b.declaredValueCents = Number(yuanValue) * 100
    saveBook()
    this.sync()
  },
  onDeclared(e) {
    const value = String(e.detail.value || '').replace(/[^\d.]/g, '')
    const b = getBook()
    b.insure = true
    b.insureMode = 'basic'
    b.declaredValueCents = Math.round(Number(value || 0) * 100)
    saveBook()
    this.setData({ declaredYuan: value })
    this.sync()
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
    const extras = []
    if (b.crateMode === 'buy' && b.crateSkuId) {
      extras.push('航空箱  ¥' + yuan(CRATE_PRICE[b.crateSkuId] || 0))
    }
    if (b.insure && Number(b.declaredValueCents) > 0) {
      extras.push('保价  ¥' + yuan(insureFeeCents(b.declaredValueCents)))
    }
    const body = lines.length
      ? lines
          .map((item) => item.name + '  ¥' + yuan(item.cents))
          .concat(extras)
          .join('\n')
      : '填写寄收地址和宠物重量后，才会生成估价。'
    wx.showModal({ title: '费用明细', content: body, showCancel: false })
  },
  submit() {
    requireLoginPage()
      .then(() => {
        const b = getBook()
        ensurePetFields(b)
        saveBook()
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
        if (!goodsFilled(b)) {
          wx.showToast({ title: '请填写物品信息', icon: 'none' })
          this.editGoods()
          return
        }
        const goNext = () => {
          setBookStep('fulfill')
          wx.navigateTo({ url: '/pages/book/fulfill' })
        }
        if (b.quote && !quoteExpired(b)) {
          goNext()
          return
        }
        wx.showLoading({ title: '估价中' })
        this.refreshQuote().then((q) => {
          wx.hideLoading()
          if (!q) return
          goNext()
        })
      })
      .catch(() => {})
  }
})
