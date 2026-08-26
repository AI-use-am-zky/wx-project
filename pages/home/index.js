const { getBook, saveBook, draftResume, hideResume } = require('../../utils/book')
const { requireLoginPage } = require('../../utils/auth')
const { TREE, PROVINCE_NAMES, rangeFor, cityFromIndex, cityLabel, samePlace, pickerFromCity } = require('../../utils/regions')
const { logOp } = require('../../utils/session')
const { isPickingMedia, clearMediaPick } = require('../../utils/media-pick')

Page({
  data: {
    fromName: '',
    toName: '',
    fromRange: [PROVINCE_NAMES, TREE[0].cities],
    toRange: [PROVINCE_NAMES, TREE[0].cities],
    fromIndex: [0, 0],
    toIndex: [0, 0],
    resumeText: '',
    resumeUrl: ''
  },
  onShow() {
    if (isPickingMedia()) return
    this.sync()
    this.syncResume()
  },
  sync() {
    const b = getBook()
    const fromPick = pickerFromCity(b.fromCity)
    const toPick = pickerFromCity(b.toCity)
    this.setData({
      fromName: cityLabel(b.fromCity),
      toName: cityLabel(b.toCity),
      fromIndex: b.fromCity ? fromPick.index : [0, 0],
      toIndex: b.toCity ? toPick.index : [0, 0],
      fromRange: b.fromCity ? fromPick.range : [PROVINCE_NAMES, TREE[0].cities],
      toRange: b.toCity ? toPick.range : [PROVINCE_NAMES, TREE[0].cities]
    })
  },
  onColumn(e) {
    const role = e.currentTarget.dataset.role
    const { column, value } = e.detail
    if (column !== 0) return
    this.setData({
      [role + 'Range']: rangeFor(value),
      [role + 'Index']: [value, 0]
    })
  },
  onPick(e) {
    const role = e.currentTarget.dataset.role
    const [pi, ci] = e.detail.value || [0, 0]
    const city = cityFromIndex(pi, ci)
    if (!city) return
    const b = getBook()
    const other = role === 'from' ? b.toCity : b.fromCity
    if (samePlace(other, city)) {
      wx.showToast({ title: '出发与到达不能相同', icon: 'none' })
      this.sync()
      return
    }
    if (role === 'from') {
      b.fromCity = city
      if (b.sender) {
        b.sender.province = city.province
        b.sender.city = city.name
      }
    } else {
      b.toCity = city
      if (b.receiver) {
        b.receiver.province = city.province
        b.receiver.city = city.name
      }
    }
    saveBook()
    this.sync()
    logOp('city_pick', { role, code: city.code, name: city.name, province: city.province, source: 'home' })
  },
  swap() {
    const b = getBook()
    if (!b.fromCity && !b.toCity) return
    const tmp = b.fromCity
    b.fromCity = b.toCity
    b.toCity = tmp
    if (b.sender && b.fromCity) {
      b.sender.province = b.fromCity.province
      b.sender.city = b.fromCity.name
    }
    if (b.receiver && b.toCity) {
      b.receiver.province = b.toCity.province
      b.receiver.city = b.toCity.name
    }
    saveBook()
    this.sync()
    logOp('city_swap', {
      from: cityLabel(b.fromCity),
      to: cityLabel(b.toCity)
    })
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
    if (!b.fromCity || !b.toCity) {
      wx.showToast({ title: '请先选择出发和到达城市', icon: 'none' })
      return
    }
    if (samePlace(b.fromCity, b.toCity)) {
      wx.showToast({ title: '出发与到达不能相同', icon: 'none' })
      return
    }
    requireLoginPage().then(() => {
      wx.navigateTo({ url: '/pages/book/addresses' })
    })
  }
})
