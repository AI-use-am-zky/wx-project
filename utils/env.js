function isDevTools() {
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
    return info.platform === 'devtools'
  } catch (e) {
    return false
  }
}

module.exports = { isDevTools }
