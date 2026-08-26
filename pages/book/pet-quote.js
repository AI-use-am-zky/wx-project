const { requireLoginPage } = require('../../utils/auth')
const { getBook, saveBook, setBookStep } = require('../../utils/book')
const { request } = require('../../utils/request')

Page({
  data: {
    speciesList: [],
    speciesNames: [],
    breedNames: [],
    speciesName: '',
    species: '',
    breed: '',
    petName: '',
    petNote: '',
    weightKg: '',
    pickupDate: '',
    minDate: ''
  },
  onLoad() {
    const t = new Date()
    t.setDate(t.getDate() + 1)
    this.setData({ minDate: t.toISOString().slice(0, 10) })
    requireLoginPage()
      .then(() => request({ url: '/meta/breeds' }))
      .then((data) => {
        const list = data.species || []
        const b = getBook()
        const matched = list.find((s) => s.species === b.species)
        this.setData({
          speciesList: list,
          speciesNames: list.map((s) => s.name),
          species: b.species || '',
          speciesName: matched ? matched.name : '',
          breedNames: matched ? matched.breeds : [],
          breed: b.breed || '',
          petName: b.petName || '',
          petNote: b.petNote || '',
          weightKg: b.weightKg || '',
          pickupDate: b.pickupDate || ''
        })
        setBookStep('pet-quote')
      })
      .catch(() => setBookStep('pet-quote'))
  },
  persistPet() {
    const b = getBook()
    b.species = this.data.species
    b.breed = this.data.breed
    b.petName = this.data.petName
    b.petNote = this.data.petNote
    b.weightKg = this.data.weightKg
    b.pickupDate = this.data.pickupDate
    saveBook()
  },
  onSpecies(e) {
    const i = Number(e.detail.value)
    const s = this.data.speciesList[i]
    this.setData({
      species: s.species,
      speciesName: s.name,
      breedNames: s.breeds,
      breed: ''
    })
    this.persistPet()
  },
  onBreed(e) {
    this.setData({ breed: this.data.breedNames[e.detail.value] })
    this.persistPet()
  },
  onPetName(e) {
    this.setData({ petName: e.detail.value })
    this.persistPet()
  },
  onPetNote(e) {
    this.setData({ petNote: e.detail.value })
    this.persistPet()
  },
  onWeight(e) {
    this.setData({ weightKg: e.detail.value })
    this.persistPet()
  },
  onDate(e) {
    this.setData({ pickupDate: e.detail.value })
    this.persistPet()
  },
  quote() {
    const b = getBook()
    const { species, breed, weightKg, pickupDate, petName, petNote } = this.data
    if (!b.sender || !b.receiver) {
      wx.showToast({ title: '请先填地址', icon: 'none' })
      return
    }
    if (!species || !breed || !weightKg || !pickupDate) {
      wx.showToast({ title: '请填品种、体重和取件日', icon: 'none' })
      return
    }
    wx.showLoading({ title: '估价中' })
    request({
      url: '/quotes',
      method: 'POST',
      data: {
        sender: b.sender,
        receiver: b.receiver,
        species,
        breed,
        petName,
        petNote,
        weightKg: Number(weightKg),
        pickupDate
      }
    })
      .then((q) => {
        wx.hideLoading()
        b.species = species
        b.breed = breed
        b.petName = petName
        b.petNote = petNote
        b.weightKg = weightKg
        b.pickupDate = pickupDate
        b.quote = q
        saveBook()
        setBookStep('quote-result')
        wx.navigateTo({ url: '/pages/book/quote-result' })
      })
      .catch((e) => {
        wx.hideLoading()
        wx.showToast({ title: (e && e.message) || '估价失败', icon: 'none' })
      })
  }
})
