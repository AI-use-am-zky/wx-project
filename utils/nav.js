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

module.exports = { withLogin, go, goOrders }
