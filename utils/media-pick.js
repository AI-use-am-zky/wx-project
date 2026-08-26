const KEY_AT = 'pickingMediaAt'
const KEY_TARGET = 'pickingMediaTarget'

function beginMediaPick(target) {
  const app = getApp()
  app.globalData.pickingMedia = true
  if (app._pickMediaTimer) {
    clearTimeout(app._pickMediaTimer)
    app._pickMediaTimer = null
  }
  wx.setStorageSync(KEY_AT, Date.now())
  wx.setStorageSync(KEY_TARGET, target || 'pages/book/fulfill')
}

function currentRoute() {
  const pages = getCurrentPages()
  if (!pages.length) return ''
  return pages[pages.length - 1].route || ''
}

function isPickingMedia() {
  const app = getApp()
  if (app && app.globalData && app.globalData.pickingMedia) return true
  const at = wx.getStorageSync(KEY_AT)
  return Boolean(at && Date.now() - Number(at) < 120000)
}

function restoreUrlAfterPick() {
  const at = wx.getStorageSync(KEY_AT)
  if (!at || Date.now() - Number(at) > 120000) return ''
  const target = String(wx.getStorageSync(KEY_TARGET) || 'pages/book/fulfill').replace(/^\//, '')
  const route = currentRoute()
  if (route === target) return ''
  return '/' + target
}

function clearMediaPick() {
  const app = getApp()
  if (app) {
    app.globalData.pickingMedia = false
    if (app._pickMediaTimer) {
      clearTimeout(app._pickMediaTimer)
      app._pickMediaTimer = null
    }
  }
  wx.removeStorageSync(KEY_AT)
  wx.removeStorageSync(KEY_TARGET)
}

function endMediaPick() {
  const app = getApp()
  if (app._pickMediaTimer) clearTimeout(app._pickMediaTimer)
  app._pickMediaTimer = setTimeout(() => {
    const target = String(wx.getStorageSync(KEY_TARGET) || '').replace(/^\//, '')
    const route = currentRoute()
    if (target && route !== target) {
      if (app) app.globalData.pickingMedia = true
      return
    }
    clearMediaPick()
  }, 400)
}

module.exports = {
  beginMediaPick,
  endMediaPick,
  isPickingMedia,
  restoreUrlAfterPick,
  clearMediaPick
}
