const { requireLoginPage } = require('../../utils/auth')
const { getBook, saveBook: persistBook, setBookStep } = require('../../utils/book')
const { request } = require('../../utils/request')
const { cityLabel } = require('../../utils/regions')
const { isMobile, looksLikeFullAddress, parseAddress, mergeParsed } = require('../../utils/address-parse')

function blank() {
  return { name: '', phone: '', province: '', city: '', district: '', detail: '' }
}

function fromSelected(city) {
  return {
    name: '',
    phone: '',
    province: (city && city.province) || '',
    city: (city && (city.name || city.city)) || '',
    district: '',
    detail: ''
  }
}

function lockRegion(existing, city) {
  const seeded = fromSelected(city)
  if (!existing) return seeded
  return {
    ...existing,
    province: seeded.province,
    city: seeded.city
  }
}

Page({
  data: {
    sender: blank(),
    receiver: blank(),
    fromLabel: '',
    toLabel: '',
    senderPhoneErr: '',
    receiverPhoneErr: ''
  },
  onLoad() {
    requireLoginPage().then(() => this.hydrate())
  },
  hydrate() {
    const b = getBook()
    if (!b.fromCity || !b.toCity) {
      wx.showToast({ title: '请先在首页选择城市', icon: 'none' })
      setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 400)
      return
    }
    this.setData({
      sender: lockRegion(b.sender, b.fromCity),
      receiver: lockRegion(b.receiver, b.toCity),
      fromLabel: cityLabel(b.fromCity),
      toLabel: cityLabel(b.toCity),
      senderPhoneErr: '',
      receiverPhoneErr: ''
    })
    setBookStep('addresses')
  },
  persist() {
    const b = getBook()
    b.sender = lockRegion(this.data.sender, b.fromCity)
    b.receiver = lockRegion(this.data.receiver, b.toCity)
    persistBook()
  },
  onField(e) {
    const { who, k } = e.currentTarget.dataset
    const value = e.detail.value
    if (k === 'province' || k === 'city') return
    if (k === 'phone') {
      const clipped = String(value || '').replace(/\D/g, '').slice(0, 11)
      this.setData({
        [`${who}.${k}`]: clipped,
        [`${who}PhoneErr`]: clipped && !isMobile(clipped) ? '请输入11位手机号' : ''
      })
      return
    }
    if (k === 'detail' && looksLikeFullAddress(value)) {
      const parsed = parseAddress(value)
      const b = getBook()
      const city = who === 'sender' ? b.fromCity : b.toCity
      const merged = lockRegion(mergeParsed(this.data[who], parsed), city)
      this.setData({
        [who]: merged,
        [`${who}PhoneErr`]: merged.phone && !isMobile(merged.phone) ? '请输入11位手机号' : ''
      })
      return
    }
    this.setData({ [`${who}.${k}`]: value })
  },
  paste(e) {
    const who = e.currentTarget.dataset.who
    wx.getClipboardData({
      success: (res) => {
        const text = (res && res.data) || ''
        if (!String(text).trim()) {
          wx.showToast({ title: '剪贴板为空', icon: 'none' })
          return
        }
        const parsed = parseAddress(text)
        const b = getBook()
        const city = who === 'sender' ? b.fromCity : b.toCity
        const merged = lockRegion(mergeParsed(this.data[who], parsed), city)
        if (!parsed.detail && !looksLikeFullAddress(text)) merged.detail = String(text).trim()
        this.setData({
          [who]: merged,
          [`${who}PhoneErr`]: merged.phone && !isMobile(merged.phone) ? '请输入11位手机号' : ''
        })
        this.persist()
        wx.showToast({ title: '已识别粘贴内容', icon: 'none' })
      },
      fail: () => wx.showToast({ title: '无法读取剪贴板', icon: 'none' })
    })
  },
  checkPhone(who) {
    const phone = (this.data[who] && this.data[who].phone) || ''
    const ok = isMobile(phone)
    this.setData({ [`${who}PhoneErr`]: ok ? '' : '请输入11位手机号' })
    return ok
  },
  saveBook() {
    this.persist()
    const { sender, receiver } = this.data
    if (!this.checkPhone('sender') || !this.checkPhone('receiver')) return
    Promise.all([
      request({ url: '/addresses', method: 'POST', data: { ...sender, role_hint: 'sender' } }),
      request({ url: '/addresses', method: 'POST', data: { ...receiver, role_hint: 'receiver' } })
    ]).then(() => wx.showToast({ title: '已保存' })).catch((e) => wx.showToast({ title: e.message || '保存失败', icon: 'none' }))
  },
  next() {
    this.persist()
    const { sender, receiver } = this.data
    if (!this.checkPhone('sender') || !this.checkPhone('receiver')) {
      wx.showToast({ title: '手机号须为11位', icon: 'none' })
      return
    }
    const keys = ['name', 'phone', 'province', 'city', 'district', 'detail']
    if (!keys.every((k) => sender[k] && receiver[k])) {
      wx.showToast({ title: '请把寄收地址填到详细地址', icon: 'none' })
      return
    }
    setBookStep('pet-quote')
    wx.navigateTo({ url: '/pages/book/pet-quote' })
  }
})
