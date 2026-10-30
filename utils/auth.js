/**
 * 登录只有这一条链路：
 * wx.login 的 code → 服务器换成 openid → 必须有手机号 → 签发 token。
 * 每个 openid 一个数据库。登录态保持到用户退出。
 * 开发者工具拿不到手机号凭证，本机允许用模拟号走同一条接口。
 */

const { request } = require('./request')
const { isDevTools } = require('./env')

function currentUser() {
  return wx.getStorageSync('user') || {}
}

function isLoggedIn() {
  return Boolean(wx.getStorageSync('token') && currentUser().phone)
}

function logout() {
  wx.removeStorageSync('token')
  wx.removeStorageSync('user')
  wx.removeStorageSync('loginNext')
  wx.removeStorageSync('loginAsked')
}

function restore() {
  if (wx.getStorageSync('token') && !currentUser().phone) logout()
}

function saveSession(data) {
  const user = (data && data.user) || {}
  if (!data || !data.token) {
    logout()
    throw new Error('登录失败，请重试')
  }
  if (!user.phone) {
    logout()
    throw new Error('服务器未返回手机号，请重试')
  }
  wx.removeStorageSync('loginAsked')
  wx.setStorageSync('token', data.token)
  wx.setStorageSync('user', user)
  return data
}

function login(phoneCode) {
  const devtools = !phoneCode && isDevTools()
  return new Promise((resolve, reject) => {
    if (!phoneCode && !devtools) {
      reject(new Error('没有获取到手机号，请点允许授权'))
      return
    }
    wx.login({
      success(res) {
        if (!res.code) {
          reject(new Error('登录失败'))
          return
        }
        request({
          url: '/auth/wx-login',
          method: 'POST',
          needAuth: false,
          data: { code: res.code, phoneCode: phoneCode || '', devtools }
        })
          .then(saveSession)
          .then(resolve)
          .catch((err) => {
            const error = new Error((err && (err.message || err.errMsg)) || '登录失败')
            error.raw = err
            reject(error)
          })
      },
      fail(err) {
        const error = new Error((err && err.errMsg) || '登录失败')
        error.raw = err
        reject(error)
      }
    })
  })
}

let opening = false

function openLogin(next) {
  if (next) wx.setStorageSync('loginNext', next)
  const pages = getCurrentPages()
  const cur = pages[pages.length - 1]
  if (cur && cur.route === 'pages/me/login') return
  if (opening) return
  opening = true
  wx.navigateTo({
    url: '/pages/me/login',
    complete() {
      opening = false
    }
  })
}

function takeNext() {
  const next = wx.getStorageSync('loginNext') || ''
  wx.removeStorageSync('loginNext')
  return next
}

function ensureLogin() {
  if (isLoggedIn()) return Promise.resolve()
  if (!wx.getStorageSync('loginAsked')) {
    wx.setStorageSync('loginAsked', '1')
    openLogin()
  }
  return Promise.reject(new Error('请先登录'))
}

module.exports = {
  isLoggedIn,
  currentUser,
  login,
  logout,
  restore,
  openLogin,
  takeNext,
  ensureLogin,
  requireLoginPage: ensureLogin
}
