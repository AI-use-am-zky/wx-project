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
    step: '',
    resumeHidden: false
  }
}

const STEP_URL = {
  addresses: '/pages/book/addresses',
  'pet-quote': '/pages/book/pet-quote',
  'quote-result': '/pages/book/quote-result',
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
  if (!b.quote && ['quote-result', 'fulfill', 'pay'].includes(b.step)) {
    return { url: STEP_URL[b.species ? 'pet-quote' : 'addresses'], text: '点此继续上次填写' }
  }
  if (quoteExpired(b) && ['quote-result', 'fulfill', 'pay'].includes(b.step)) {
    return { url: STEP_URL['pet-quote'], text: '报价已过期，点此继续填写' }
  }
  return { url: STEP_URL[b.step] || STEP_URL.addresses, text: '订单未支付，点此继续上次填写' }
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

function addrText(a) {
  if (!a) return '请填写'
  return `${a.name} ${a.phone}\n${a.province}${a.city}${a.district}${a.detail}`
}

module.exports = {
  getBook,
  saveBook,
  setBookStep,
  draftResume,
  hideResume,
  resetBook,
  emptyBook,
  addrText,
  quoteExpired
}
