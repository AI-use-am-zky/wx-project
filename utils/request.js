const config = require('./config')
const { isDevTools } = require('./env')

function getToken() {
  return wx.getStorageSync('token') || ''
}

function request({ url, method = 'GET', data, needAuth = true }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: config.baseUrl + url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        Authorization: getToken() ? 'Bearer ' + getToken() : ''
      },
      success(res) {
        const body = res.data || {}
        if (res.statusCode === 401) {
          wx.removeStorageSync('token')
          reject({ code: 401, message: '请先登录' })
          return
        }
        if (res.statusCode >= 400 || body.code) {
          if (body.code && body.code !== 0) {
            reject(body)
            return
          }
        }
        if (typeof body.code === 'number' && body.code !== 0) {
          reject(body)
          return
        }
        resolve(body.data)
      },
      fail(err) {
        reject({ message: err.errMsg || '网络错误' })
      }
    })
  })
}

function uploadFile(filePath) {
  if (isDevTools()) {
    return Promise.resolve({ fileId: 'dev-' + Date.now(), url: filePath || '' })
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (fn, arg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(arg)
    }
    const timer = setTimeout(() => done(reject, { message: '上传超时' }), 12000)
    wx.uploadFile({
      url: config.baseUrl + '/uploads',
      filePath,
      name: 'file',
      header: { Authorization: 'Bearer ' + getToken() },
      success(res) {
        try {
          const body = JSON.parse(res.data)
          if (body.code !== 0) done(reject, body)
          else done(resolve, body.data)
        } catch (e) {
          done(reject, { message: '上传解析失败' })
        }
      },
      fail(err) {
        done(reject, { message: (err && err.errMsg) || '上传失败' })
      }
    })
  })
}

function yuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2)
}

module.exports = { request, uploadFile, yuan, getToken }
