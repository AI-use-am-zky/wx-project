const { isLoggedIn, login } = require('./auth')

function withLogin(then) {
  if (isLoggedIn()) {
    then()
    return
  }
  login()
    .then(() => then())
    .catch((e) => wx.showToast({ title: (e && e.message) || '请先登录', icon: 'none' }))
}

function go(url) {
  withLogin(() => wx.navigateTo({ url }))
}

function goOrders(tab) {
  if (tab) wx.setStorageSync('orderTab', tab)
  else wx.removeStorageSync('orderTab')
  withLogin(() => wx.switchTab({ url: '/pages/orders/list' }))
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

module.exports = { withLogin, go, goOrders, goBack }
