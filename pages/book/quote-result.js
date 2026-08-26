const { requireLoginPage } = require('../../utils/auth')
const { getBook, saveBook, setBookStep } = require('../../utils/book')
const { request, yuan } = require('../../utils/request')

const QUARANTINE = 20000

Page({
  data: {
    quote: {},
    freightYuan: '0.00',
    crateOn: false,
    agencyOn: false,
    insureOn: false,
    crates: [],
    crateNames: [],
    crateLabel: '',
    crateYuan: '0.00',
    declaredYuan: '',
    totalYuan: '0.00'
  },
  onLoad() {
    requireLoginPage().then(() => request({ url: '/addons/crates' })).then((data) => {
      const b = getBook()
      const q = b.quote
      if (!q) {
        wx.navigateBack()
        return
      }
      const lines = (q.lines || []).map((l) => ({ ...l, yuan: yuan(l.cents) }))
      this.setData({
        quote: { ...q, lines },
        freightYuan: yuan(q.sellFreightCents),
        crates: data.list || [],
        crateNames: (data.list || []).map((c) => c.name),
        crateOn: b.crateMode === 'buy',
        agencyOn: b.quarantineMode === 'agency',
        insureOn: Boolean(b.insure),
        crateLabel: '',
        declaredYuan: b.declaredValueCents ? String(Number(b.declaredValueCents) / 100) : ''
      })
      setBookStep('quote-result')
      this.recalc()
    }).catch(() => {})
  },
  toggleCrate() {
    const crateOn = !this.data.crateOn
    getBook().crateMode = crateOn ? 'buy' : 'own'
    saveBook()
    this.setData({ crateOn })
    this.recalc()
  },
  onCrate(e) {
    const c = this.data.crates[e.detail.value]
    getBook().crateSkuId = c.id
    saveBook()
    this.setData({ crateLabel: c.name, crateYuan: yuan(c.price_cents) })
    this.recalc()
  },
  toggleAgency() {
    const agencyOn = !this.data.agencyOn
    getBook().quarantineMode = agencyOn ? 'agency' : 'self'
    saveBook()
    this.setData({ agencyOn })
    this.recalc()
  },
  toggleInsure() {
    const insureOn = !this.data.insureOn
    getBook().insure = insureOn
    saveBook()
    this.setData({ insureOn })
    this.recalc()
  },
  onDeclared(e) {
    this.setData({ declaredYuan: e.detail.value })
    const cents = Math.round(Number(e.detail.value || 0) * 100)
    getBook().declaredValueCents = cents
    saveBook()
    this.recalc()
  },
  recalc() {
    const b = getBook()
    const q = b.quote || {}
    let extra = 0
    if (this.data.crateOn && b.crateSkuId) {
      const c = this.data.crates.find((x) => x.id === b.crateSkuId)
      extra += c ? c.price_cents : 0
    }
    if (this.data.agencyOn) extra += QUARANTINE
    if (this.data.insureOn) extra += Math.max(100, Math.round((Number(b.declaredValueCents) || 0) * 0.01))
    this.setData({ totalYuan: yuan((q.sellFreightCents || 0) + extra) })
  },
  next() {
    const b = getBook()
    if (this.data.crateOn && !b.crateSkuId) {
      wx.showToast({ title: '请选择箱型', icon: 'none' })
      return
    }
    if (this.data.insureOn && !(Number(b.declaredValueCents) > 0)) {
      wx.showToast({ title: '请填写声明价值', icon: 'none' })
      return
    }
    saveBook()
    setBookStep('fulfill')
    wx.navigateTo({ url: '/pages/book/fulfill' })
  }
})
