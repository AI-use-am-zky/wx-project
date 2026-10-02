const { requireLoginPage } = require('../../utils/auth')
const { getBook, saveBook, setBookStep } = require('../../utils/book')
const { uploadFile } = require('../../utils/request')
const { isDevTools } = require('../../utils/env')
const { clearMediaPick } = require('../../utils/media-pick')

function previewKey(key) {
  if (key === 'petPhotos') return 'petPhotoPreviews'
  if (key === 'cratePhotos') return 'cratePhotoPreviews'
  return 'quarantinePhotoPreviews'
}

Page({
  data: {
    crateMode: 'own',
    quarantineMode: 'self',
    petPhotos: [],
    cratePhotos: [],
    quarantinePhotos: [],
    agency: { name: '', phone: '', petName: '' },
    isDevTools: false,
    cameraOn: false
  },
  onLoad() {
    this.setData({ isDevTools: isDevTools() })
    clearMediaPick()
    requireLoginPage().then(() => {
      const b = getBook()
      const sender = b.sender || {}
      const agency = {
        name: (b.agency && b.agency.name) || sender.name || '',
        phone: (b.agency && b.agency.phone) || sender.phone || '',
        petName: (b.agency && b.agency.petName) || b.petName || b.breed || ''
      }
      b.agency = agency
      saveBook()
      this.setData({
        crateMode: b.crateMode || 'own',
        quarantineMode: b.quarantineMode || 'self',
        petPhotos: b.petPhotoPreviews && b.petPhotoPreviews.length ? b.petPhotoPreviews : (b.petPhotos || []),
        cratePhotos: b.cratePhotoPreviews && b.cratePhotoPreviews.length ? b.cratePhotoPreviews : (b.cratePhotos || []),
        quarantinePhotos: b.quarantinePhotoPreviews && b.quarantinePhotoPreviews.length ? b.quarantinePhotoPreviews : (b.quarantinePhotos || []),
        agency
      })
      setBookStep('fulfill')
    })
  },
  addPet() { this.pick('petPhotos') },
  addCrate() { this.pick('cratePhotos') },
  addQuar() { this.pick('quarantinePhotos') },
  pick(key) {
    this._pickKey = key
    if (isDevTools()) {
      this.addDemoShot(key)
      return
    }
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: (res) => {
        if (res.tapIndex === 0) this.pickAlbum(key)
        else this.openCamera(key)
      }
    })
  },
  addDemoShot(key) {
    this.writeTinyPng()
      .then((path) => this.usePath(key, path))
      .catch(() => wx.showToast({ title: '添加示例图失败', icon: 'none' }))
  },
  writeTinyPng() {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager()
      const path = `${wx.env.USER_DATA_PATH}/demo_${Date.now()}.png`
      fs.writeFile({
        filePath: path,
        encoding: 'base64',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
        success: () => resolve(path),
        fail: reject
      })
    })
  },
  pickAlbum(key) {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        const path = (res.tempFilePaths && res.tempFilePaths[0]) || ''
        if (path) this.usePath(key, path)
      }
    })
  },
  openCamera(key) {
    this._pickKey = key
    this.setData({ cameraOn: true })
  },
  closeCam() {
    this.setData({ cameraOn: false })
  },
  onCamError() {
    this.setData({ cameraOn: false })
    wx.showToast({ title: '相机不可用，已改用示例图', icon: 'none' })
    this.addDemoShot(this._pickKey)
  },
  takeCam() {
    const ctx = wx.createCameraContext()
    ctx.takePhoto({
      quality: 'normal',
      success: (res) => {
        this.setData({ cameraOn: false })
        this.usePath(this._pickKey, res.tempImagePath)
      },
      fail: () => this.onCamError()
    })
  },
  usePath(key, path) {
    if (!key || !path) return
    const list = (this.data[key] || []).concat([path])
    this.setData({ [key]: list })
    const b = getBook()
    const pKey = previewKey(key)
    const fileId = 'local-' + Date.now()
    b[pKey] = list
    b[key] = (b[key] || []).concat([fileId])
    saveBook()
    uploadFile(path)
      .then((data) => {
        if (!data || !data.fileId) return
        const ids = b[key] || []
        const idx = ids.lastIndexOf(fileId)
        if (idx >= 0) ids[idx] = data.fileId
        saveBook()
      })
      .catch(() => {})
  },
  onAgency(e) {
    const k = e.currentTarget.dataset.k
    const agency = { ...this.data.agency, [k]: e.detail.value }
    const b = getBook()
    b.agency = agency
    saveBook()
    this.setData({ agency })
  },
  next() {
    const b = getBook()
    if (!(b.petPhotos || []).length && !(b.petPhotoPreviews || []).length) {
      return wx.showToast({ title: '请上传宠物照', icon: 'none' })
    }
    if (b.crateMode !== 'buy' && !(b.cratePhotos || []).length && !(b.cratePhotoPreviews || []).length) {
      return wx.showToast({ title: '请上传箱照', icon: 'none' })
    }
    if (b.quarantineMode === 'agency') {
      const a = b.agency || {}
      if (!a.name || !a.phone || !a.petName) {
        return wx.showToast({ title: '请填写代办检疫办理人信息', icon: 'none' })
      }
    } else if (!(b.quarantinePhotos || []).length && !(b.quarantinePhotoPreviews || []).length) {
      return wx.showToast({ title: '请上传检疫证明', icon: 'none' })
    }
    if (!(b.petPhotos || []).length && (b.petPhotoPreviews || []).length) {
      b.petPhotos = b.petPhotoPreviews.map((_, i) => 'local-pet-' + i)
    }
    if (b.crateMode !== 'buy' && !(b.cratePhotos || []).length && (b.cratePhotoPreviews || []).length) {
      b.cratePhotos = b.cratePhotoPreviews.map((_, i) => 'local-crate-' + i)
    }
    if (b.quarantineMode !== 'agency' && !(b.quarantinePhotos || []).length && (b.quarantinePhotoPreviews || []).length) {
      b.quarantinePhotos = b.quarantinePhotoPreviews.map((_, i) => 'local-quar-' + i)
    }
    saveBook()
    setBookStep('pay')
    wx.navigateTo({ url: '/pages/book/pay' })
  }
})
