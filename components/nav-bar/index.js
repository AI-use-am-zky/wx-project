const { goBack: leavePage } = require('../../utils/nav')

function measure() {
  let statusBarHeight = 20
  let menu = null
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    statusBarHeight = win.statusBarHeight || 20
  } catch (e) {}
  try {
    menu = wx.getMenuButtonBoundingClientRect()
  } catch (e) {}
  const menuHeight = menu && menu.height ? menu.height : 32
  const menuTop = menu && menu.top ? menu.top : statusBarHeight + 6
  const gap = Math.max(menuTop - statusBarHeight, 0)
  return {
    statusBarHeight,
    navHeight: statusBarHeight + gap * 2 + menuHeight
  }
}

Component({
  properties: {
    title: { type: String, value: '' }
  },
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    showBack: false
  },
  lifetimes: {
    created() {
      const m = measure()
      this.data.statusBarHeight = m.statusBarHeight
      this.data.navHeight = m.navHeight
    },
    attached() {
      this.setData(measure())
      this.refreshBack()
    }
  },
  pageLifetimes: {
    show() {
      this.refreshBack()
    }
  },
  methods: {
    refreshBack() {
      const pages = getCurrentPages()
      this.setData({ showBack: pages.length > 1 })
    },
    goBack() {
      leavePage()
    }
  }
})
