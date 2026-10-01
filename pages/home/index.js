const { getBook, saveBook, draftResume, hideResume } = require('../../utils/book')
const { requireLoginPage } = require('../../utils/auth')
const { findProvince, indexesFor, cityFromIndex, samePlace } = require('../../utils/regions')
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

Page({
  data: {
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
    resumeUrl: ''
  },
  onShow() {
    if (isPickingMedia()) return
    this.takePicked()
    this.sync()
    this.syncResume()
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
    const who = e.currentTarget.dataset.who
    requireLoginPage()
      .then(() => wx.navigateTo({ url: '/pages/me/addresses?pick=' + who + '&title=地址簿' }))
      .catch(() => {})
  },
  editWho() {
    const b = getBook()
    if (!b.fromCity || !b.toCity) {
      wx.showToast({ title: '请先从地址簿选择寄收地址', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/book/addresses' })
  },
  syncResume() {
    const draft = draftResume()
    this.setData({
      resumeText: draft ? draft.text : '',
      resumeUrl: draft ? draft.url : ''
    })
  },
  resumeBook() {
    const url = this.data.resumeUrl
    if (!url) return
    clearMediaPick()
    wx.navigateTo({ url })
  },
  closeResume() {
    hideResume()
    this.setData({ resumeText: '', resumeUrl: '' })
  },
  goBook() {
    const b = getBook()
    if (!b.sender || !b.sender.name || !b.receiver || !b.receiver.name) {
      wx.showToast({ title: '请先选择寄收地址', icon: 'none' })
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
    requireLoginPage().then(() => {
      wx.navigateTo({ url: '/pages/book/addresses' })
    })
  },
  goGuide(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.navigateTo({ url })
  }
})
