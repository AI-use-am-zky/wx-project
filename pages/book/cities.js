const { request } = require('../../utils/request')
const { getBook, saveBook } = require('../../utils/book')
const { CITIES, withProvince, mergeCityList } = require('../../utils/cities')
const { logOp } = require('../../utils/session')

Page({
  data: { cities: CITIES, fromCode: '', toCode: '', role: '' },
  onLoad(q) {
    this.role = (q && q.role) || ''
    const b = getBook()
    this.setData({
      role: this.role,
      cities: CITIES,
      fromCode: (b.fromCity && b.fromCity.code) || '',
      toCode: (b.toCity && b.toCity.code) || ''
    })
    request({ url: '/meta/cities', needAuth: false })
      .then((data) => {
        if (data && data.cities && data.cities.length) this.setData({ cities: mergeCityList(data.cities) })
      })
      .catch(() => {})
  },
  pick(e) {
    const { role, code } = e.currentTarget.dataset
    const city = withProvince((this.data.cities || []).find((c) => c.code === code))
    if (!city) return
    const b = getBook()
    const other = role === 'from' ? b.toCity : b.fromCity
    if (other && other.code === city.code) {
      wx.showToast({ title: '出发与到达不能相同', icon: 'none' })
      return
    }
    if (role === 'from') {
      b.fromCity = city
      this.setData({ fromCode: city.code })
    } else {
      b.toCity = city
      this.setData({ toCode: city.code })
    }
    saveBook()
    logOp('city_pick', { role, code: city.code, name: city.name, source: 'cities' })
    if (this.role) {
      wx.navigateBack()
    }
  },
  next() {
    const b = getBook()
    if (!b.fromCity || !b.toCity) {
      wx.showToast({ title: '请选择出发和到达城市', icon: 'none' })
      return
    }
    if (b.fromCity.code === b.toCity.code) {
      wx.showToast({ title: '出发与到达不能相同', icon: 'none' })
      return
    }
    saveBook()
    wx.navigateTo({ url: '/pages/book/addresses' })
  }
})
