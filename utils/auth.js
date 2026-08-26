const { request } = require('./request')

function isLoggedIn() {
  return Boolean(wx.getStorageSync('token'))
}

function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) {
          reject({ message: '微信登录失败' })
          return
        }
        request({ url: '/auth/wx-login', method: 'POST', data: { code: res.code }, needAuth: false })
          .then((data) => {
            wx.setStorageSync('token', data.token)
            wx.setStorageSync('user', data.user || {})
            resolve(data)
          })
          .catch(reject)
      },
      fail: reject
    })
  })
}

function ensureLogin() {
  if (isLoggedIn()) return Promise.resolve()
  return login()
}

function requireLoginPage() {
  return ensureLogin().catch((e) => {
    wx.showToast({ title: (e && e.message) || '请先登录', icon: 'none' })
    setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 400)
    return Promise.reject(e)
  })
}

module.exports = { isLoggedIn, login, ensureLogin, requireLoginPage }
