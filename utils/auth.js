/**
 * 微信小程序登录（官方标准流程）
 * https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html
 *
 * 1. wx.login() 拿到临时 code（只能用一次）
 * 2. 把 code 发给开发者服务器
 * 3. 服务器用 code 调 code2Session，换 openid / session_key
 * 4. 服务器签发自定义登录态 token，小程序本地存 token
 * 注意：session_key 绝不能下发到小程序
 *
 * 头像昵称另走官方「头像昵称填写」能力（chooseAvatar + type=nickname），
 * 不再使用已回收的 getUserInfo / getUserProfile。
 */

const { request } = require('./request')

function isLoggedIn() {
  return Boolean(wx.getStorageSync('token'))
}

function applySession(data) {
  wx.setStorageSync('token', data.token)
  wx.setStorageSync('user', data.user || {})
  return data
}

function errMessage(err) {
  if (!err) return '登录失败'
  if (typeof err === 'string') return err
  const data = err.data
  if (data && (data.errmsg || data.errcode)) {
    return [data.errcode, data.errmsg].filter(Boolean).join(' ')
  }
  return err.message || err.errMsg || '登录失败'
}

/** 标准：永远先 wx.login 拿 code，再交给后端 */
function login() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(loginRes) {
        if (!loginRes.code) {
          reject({ message: '微信登录失败：未返回 code' })
          return
        }
        request({
          url: '/auth/wx-login',
          method: 'POST',
          data: { code: loginRes.code },
          needAuth: false
        })
          .then(applySession)
          .then(resolve)
          .catch((e) => reject({ message: errMessage(e), raw: e }))
      },
      fail(err) {
        reject({ message: (err && err.errMsg) || 'wx.login 调用失败' })
      }
    })
  })
}

/**
 * 有 token 时用 checkSession 判断微信侧会话是否还有效；
 * 失效或没有 token → 重新走 login()
 */
function ensureLogin() {
  return new Promise((resolve, reject) => {
    if (!isLoggedIn()) {
      login().then(resolve).catch(reject)
      return
    }
    wx.checkSession({
      success() {
        resolve()
      },
      fail() {
        wx.removeStorageSync('token')
        login().then(resolve).catch(reject)
      }
    })
  })
}

function requireLoginPage() {
  return ensureLogin().catch((e) => {
    wx.showToast({ title: errMessage(e) || '请先登录', icon: 'none' })
    setTimeout(() => wx.switchTab({ url: '/pages/home/index' }), 400)
    return Promise.reject(e)
  })
}

function logout() {
  wx.removeStorageSync('token')
  wx.removeStorageSync('user')
}

function needsProfile(user) {
  const u = user || wx.getStorageSync('user') || {}
  return !u.nickName || !u.avatarUrl
}

module.exports = { isLoggedIn, login, ensureLogin, requireLoginPage, logout, needsProfile, errMessage }
