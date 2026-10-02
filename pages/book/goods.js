const { requireLoginPage } = require('../../utils/auth')
const { getBook, saveBook } = require('../../utils/book')
const { request, yuan } = require('../../utils/request')
const { resolvePetFromName } = require('../../utils/pet')

const CRATE_IMAGE = {
  'crate-s': '/images/crate-s.jpg',
  'crate-m': '/images/crate-m.jpg',
  'crate-l': '/images/crate-l.jpg'
}

const FALLBACK_CRATES = [
  { id: 'crate-s', name: '航空箱 S', size_hint: '适合小型猫狗', price_cents: 18000 },
  { id: 'crate-m', name: '航空箱 M', size_hint: '适合中型犬', price_cents: 28000 },
  { id: 'crate-l', name: '航空箱 L', size_hint: '适合大型犬', price_cents: 42000 }
]

function weightText(kg) {
  const n = Number(kg)
  if (!n) return '0'
  return String(n)
}

function mapCrates(list) {
  return (list || []).map((c) => ({
    ...c,
    yuan: yuan(c.price_cents).replace(/\.00$/, ''),
    image: CRATE_IMAGE[c.id] || '/images/crate-m.jpg'
  }))
}

Page({
  data: {
    petName: '',
    weightKg: 3,
    weightText: '3',
    pieceCount: 1,
    volumeOn: false,
    volumeL: '',
    volumeW: '',
    volumeH: '',
    crates: mapCrates(FALLBACK_CRATES),
    crateSkuId: ''
  },
  onLoad() {
    const b = getBook()
    const weight = Number(b.weightKg) || 3
    this.setData({
      petName: b.petName || b.breed || '',
      weightKg: weight,
      weightText: weightText(weight),
      volumeOn: Boolean(b.volumeOn),
      volumeL: b.volumeL || '',
      volumeW: b.volumeW || '',
      volumeH: b.volumeH || '',
      crateSkuId: b.crateMode === 'buy' ? (b.crateSkuId || '') : ''
    })
    requireLoginPage()
      .then(() => request({ url: '/addons/crates' }))
      .then((crates) => {
        const list = crates && crates.list && crates.list.length ? crates.list : FALLBACK_CRATES
        this.setData({ crates: mapCrates(list) })
      })
      .catch(() => {})
  },
  onPetName(e) {
    this.setData({ petName: e.detail.value })
  },
  clearName() {
    this.setData({ petName: '' })
  },
  openForbid() {
    wx.navigateTo({ url: '/pages/guide/forbidden' })
  },
  moreCrates() {
    wx.showToast({ title: '可选箱型已全部列出', icon: 'none' })
  },
  pickCrate(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ crateSkuId: this.data.crateSkuId === id ? '' : id })
  },
  stepWeight(e) {
    const dir = Number(e.currentTarget.dataset.dir)
    let n = Math.round((Number(this.data.weightKg) + dir * 0.5) * 10) / 10
    if (n < 0.5) n = 0.5
    if (n > 40) n = 40
    this.setData({ weightKg: n, weightText: weightText(n) })
  },
  toggleVolume() {
    this.setData({ volumeOn: !this.data.volumeOn })
  },
  onDim(e) {
    this.setData({ [e.currentTarget.dataset.k]: e.detail.value })
  },
  stepPiece(e) {
    const dir = Number(e.currentTarget.dataset.dir)
    if (dir > 0) {
      wx.showToast({ title: '一单一只宠物', icon: 'none' })
      return
    }
    this.setData({ pieceCount: 1 })
  },
  confirm() {
    const d = this.data
    if (!d.petName) {
      wx.showToast({ title: '请填写物品名称', icon: 'none' })
      return
    }
    if (!(Number(d.weightKg) > 0)) {
      wx.showToast({ title: '请填写预估重量', icon: 'none' })
      return
    }
    const resolved = resolvePetFromName(d.petName)
    const b = getBook()
    b.petName = d.petName
    b.species = resolved.species
    b.breed = resolved.breed
    b.weightKg = String(d.weightKg)
    b.pieceCount = 1
    b.volumeOn = d.volumeOn
    b.volumeL = d.volumeL
    b.volumeW = d.volumeW
    b.volumeH = d.volumeH
    b.crateMode = d.crateSkuId ? 'buy' : 'own'
    b.crateSkuId = d.crateSkuId || ''
    // 物品变更后重新估价
    b.quote = null
    b.previewTotalCents = null
    saveBook()
    wx.navigateBack()
  }
})
