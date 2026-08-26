const { requireLoginPage } = require('../../utils/auth')
Page({
  onLoad() {
    requireLoginPage().catch(() => {})
  }
})
