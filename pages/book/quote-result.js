const { requireLoginPage } = require('../../utils/auth')
const { getBook, saveBook, setBookStep } = require('../../utils/book')
const { request, yuan } = require('../../utils/request')
const { cityLabel } = require('../../utils/regions')

const QUARANTINE = 20000

Page({
  data: {
    quote: {},
    freightYuan: '0.00',
    crateOn: false,
    agencyOn: false,
    insureOn: false,
    crates: [],
    crateSkuId: '',
    crateLabel: '',
    crateYuan: '0.00',
    declaredYuan: '',
    totalYuan: '0.00',
    routeLine: ''
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
      const crates = (data.list || []).map((c) => ({ ...c, yuan: yuan(c.price_cents) }))
      const picked = crates.find((c) => c.id === b.crateSkuId)
      this.setData({
        quote: { ...q, lines },
        freightYuan: yuan(q.sellFreightCents),
        crates,
        crateOn: b.crateMode === 'buy',
        agencyOn: b.quarantineMode === 'agency',
        insureOn: Boolean(b.insure),
        crateSkuId: b.crateSkuId || '',
        crateLabel: picked ? picked.name : '',
        crateYuan: picked ? picked.yuan : '0.00',
        declaredYuan: b.declaredValueCents ? String(Number(b.declaredValueCents) / 100) : '',
        routeLine: [cityLabel(b.fromCity) || (b.sender && b.sender.city), cityLabel(b.toCity) || (b.receiver && b.receiver.city)]
          .filter(Boolean)
          .join(' → ') +
          (b.breed ? ' · ' + b.breed : '') +
          (b.weightKg ? ' ' + b.weightKg + 'kg' : '') +
          (b.pickupDate ? ' · ' + b.pickupDate + '取件' : '')
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
  pickCrate(e) {
    const id = e.currentTarget.dataset.id
    const c = this.data.crates.find((x) => x.id === id)
    if (!c) return
    getBook().crateSkuId = c.id
    saveBook()
    this.setData({ crateSkuId: c.id, crateLabel: c.name, crateYuan: c.yuan })
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
    const totalCents = (q.sellFreightCents || 0) + extra
    b.previewTotalCents = totalCents
    saveBook()
    this.setData({ totalYuan: yuan(totalCents) })
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
