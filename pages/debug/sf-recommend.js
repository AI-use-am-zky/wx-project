const { request } = require('../../utils/request')

/** 普通货；月结卡由服务端 .env 的 SF_MONTHLY_CARD 注入，不在此写沙箱卡号 */
const DEFAULT_BODY = {
  srcProvince: '广东省',
  srcCity: '深圳市',
  srcCounty: '南山区',
  destProvince: '广东省',
  destCity: '广州市',
  destCounty: '白云区',
  paymentTerms: '1',
  destAddress: '广东省-广州市-白云区机场路湖北大厦',
  weight: 5,
  srcAddress: '广东省-深圳市-南山区南新路前海枫叶大厦1001室',
  commodityNameList: ['文件', '日用品'],
  sendTime: '2026-10-08 14:00:00',
  phoneNumber: '13800138000',
  totalNum: 1
}

Page({
  data: {
    loading: false,
    resultText:
      '将请求顺丰【生产】环境。请先在 server/.env 填：SF_ENV=prod、生产校验码、真实月结卡，并重启服务。'
  },
  onLoad() {
    this._body = DEFAULT_BODY
  },
  run() {
    if (this.data.loading) return
    this.setData({ loading: true, resultText: '正在请求生产环境…' })
    request({
      url: '/debug/sf/product-recommend',
      method: 'POST',
      data: this._body,
      needAuth: false
    })
      .then((data) => {
        const lines = (data.productList || []).map(
          (p, i) =>
            `${i + 1}. ${p.productDisplayName || p.productName} (${p.productCode})  ¥${p.totalFee}  时效 ${p.reachTime || '-'}`
        )
        const head = [
          `环境: ${data.env}`,
          `地址: ${data.endpoint}`,
          `顾客编码: ${data.partnerId}`,
          `平台: ${data.platform && data.platform.apiResultCode}`,
          `业务: ${data.business && data.business.errorCode}`,
          `产品数: ${data.productCount}`,
          '',
          ...lines,
          '',
          '—— 完整 JSON ——',
          JSON.stringify(data, null, 2)
        ]
        this.setData({ resultText: head.join('\n'), loading: false })
      })
      .catch((e) => {
        this.setData({
          loading: false,
          resultText: '失败: ' + ((e && e.message) || JSON.stringify(e))
        })
      })
  }
})
