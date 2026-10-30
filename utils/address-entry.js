const { isLoggedIn, openLogin } = require('./auth')
const { request } = require('./request')

function addressUrl(who, compose) {
  return '/pages/me/addresses?pick=' + who + (compose ? '&compose=1' : '')
}

function openAddressForm(who) {
  const url = addressUrl(who, true)
  if (!isLoggedIn()) {
    openLogin(url)
    return Promise.reject({ message: '请先登录' })
  }
  wx.navigateTo({ url })
  return Promise.resolve()
}

function openAddressBook(who) {
  if (!isLoggedIn()) {
    openLogin(addressUrl(who, false))
    return Promise.reject({ message: '请先登录' })
  }
  return request({ url: '/addresses' })
      .then((data) => {
        const empty = !data || !data.list || !data.list.length
        wx.navigateTo({ url: addressUrl(who, empty) })
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '地址簿打开失败', icon: 'none' })
      })
}

module.exports = { openAddressForm, openAddressBook }
