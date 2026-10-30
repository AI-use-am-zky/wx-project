const { isLoggedIn, openLogin } = require('./auth')

function isBrowsePage(url) {
  return url.indexOf('/pages/guide/') === 0 || url.indexOf('/pages/legal/') === 0
}

function go(url) {
  if (isBrowsePage(url) || isLoggedIn()) {
    wx.navigateTo({ url })
    return
  }
  openLogin(url)
}

function goOrders(tab) {
  if (tab) wx.setStorageSync('orderTab', tab)
  else wx.removeStorageSync('orderTab')
  if (isLoggedIn()) {
    wx.switchTab({ url: '/pages/orders/list' })
    return
  }
  openLogin('tab:/pages/orders/list')
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    wx.navigateBack()
    return
  }
  const route = pages[0] && pages[0].route
  if (route === 'pages/home/index') return
  wx.switchTab({ url: '/pages/home/index' })
}

module.exports = { go, goOrders, goBack }
