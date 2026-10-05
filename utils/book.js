function emptyBook() {
  return {
    fromCity: null,
    toCity: null,
    sender: null,
    receiver: null,
    species: '',
    breed: '',
    petName: '',
    petNote: '',
    weightKg: '',
    pickupDate: '',
    pieceCount: 1,
    volumeOn: false,
    volumeL: '',
    volumeW: '',
    volumeH: '',
    quote: null,
    crateMode: 'own',
    crateSkuId: '',
    quarantineMode: 'self',
    insure: false,
    declaredValueCents: '',
    petPhotos: [],
    cratePhotos: [],
    quarantinePhotos: [],
    petPhotoPreviews: [],
    cratePhotoPreviews: [],
    quarantinePhotoPreviews: [],
    agency: { name: '', phone: '', petName: '' },
    pickupTime: '今天两小时内',
    etaKey: 'standard',
    insureMode: 'none',
    fixedYuan: '500',
    step: '',
    resumeHidden: false
  }
}

const SEND_TAB = '/pages/send/index'

const STEP_URL = {
  goods: '/pages/book/goods',
  fulfill: '/pages/book/fulfill',
  pay: '/pages/book/pay'
}

function getBook() {
  const app = getApp()
  if (!app.globalData.book) {
    const saved = wx.getStorageSync('book')
    app.globalData.book = saved && typeof saved === 'object' ? { ...emptyBook(), ...saved } : emptyBook()
  }
  return app.globalData.book
}

function saveBook() {
  const book = getBook()
  wx.setStorageSync('book', book)
  return book
}

function setBookStep(step) {
  const book = getBook()
  book.step = step
  book.resumeHidden = false
  saveBook()
  return book
}

function quoteExpired(book) {
  const q = book && book.quote
  if (!q || !q.expiresAt) return false
  return new Date(q.expiresAt).getTime() < Date.now()
}

function draftResume() {
  const b = getBook()
  if (b.resumeHidden || !b.step) return null
  const started = Boolean(
    (b.sender && b.sender.name) ||
      (b.receiver && b.receiver.name) ||
      b.quote ||
      (b.petPhotos && b.petPhotos.length) ||
      b.species
  )
  if (!started) return null
  const deep = b.step === 'fulfill' || b.step === 'pay'
  if (deep && b.quote && !quoteExpired(b)) {
    return { url: STEP_URL[b.step], tab: false, text: '订单未支付，点此继续上次填写' }
  }
  if (b.step === 'goods') {
    return { url: STEP_URL.goods, tab: false, text: '点此继续上次填写' }
  }
  const expired = deep && quoteExpired(b)
  return { url: SEND_TAB, tab: true, text: expired ? '报价已过期，点此继续填写' : '点此继续上次填写' }
}

function hideResume() {
  const b = getBook()
  b.resumeHidden = true
  saveBook()
}

function resetBook() {
  const app = getApp()
  app.globalData.book = emptyBook()
  wx.removeStorageSync('book')
}

module.exports = {
  getBook,
  saveBook,
  setBookStep,
  draftResume,
  hideResume,
  resetBook,
  emptyBook,
  quoteExpired
}
