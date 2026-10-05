const { requireLoginPage } = require('./auth')
const { request } = require('./request')

function addressUrl(who, compose) {
  return '/pages/me/addresses?pick=' + who + (compose ? '&compose=1' : '')
}

function openAddressForm(who) {
  return requireLoginPage().then(() => {
    wx.navigateTo({ url: addressUrl(who, true) })
  })
}

function openAddressBook(who) {
  return requireLoginPage().then(() =>
    request({ url: '/addresses' })
      .then((data) => {
        const empty = !data || !data.list || !data.list.length
        wx.navigateTo({ url: addressUrl(who, empty) })
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '地址簿打开失败', icon: 'none' })
      })
  )
}

module.exports = { openAddressForm, openAddressBook }
