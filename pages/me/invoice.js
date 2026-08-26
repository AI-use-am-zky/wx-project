const { requireLoginPage } = require('../../utils/auth')
const { request, yuan } = require('../../utils/request')

const STATUS_TEXT = { signed: '已签收', booked: '运输中' }
Page({
  data: { list: [], draft: {} },
  onShow() {
    requireLoginPage()
      .then(() => request({ url: '/orders' }))
      .then((d) => {
        const list = (d.list || []).filter((o) => o.status !== 'pending_pay').map((o) => ({
          ...o,
          paidYuan: yuan(o.paidCents),
          statusText: STATUS_TEXT[o.status] || o.status
        }))
        this.setData({ list })
      })
      .catch(() => {})
  },
  onF(e) {
    const { id, k } = e.currentTarget.dataset
    const draft = this.data.draft
    draft[id] = Object.assign({}, draft[id], { [k]: e.detail.value })
    this.setData({ draft })
  },
  save(e) {
    const id = e.currentTarget.dataset.id
    const d = this.data.draft[id] || {}
    request({ url: `/orders/${id}/invoice-title`, method: 'PUT', data: d })
      .then(() => wx.showToast({ title: '已保存' }))
      .catch((err) => wx.showToast({ title: err.message || '失败', icon: 'none' }))
  },
  issue(e) {
    const id = e.currentTarget.dataset.id
    request({ url: `/orders/${id}/invoice/issue`, method: 'POST' })
      .then((r) => wx.showToast({ title: (r && r.mark) || '已受理', icon: 'none' }))
      .catch((err) => wx.showToast({ title: err.message || '失败', icon: 'none' }))
  }
})
