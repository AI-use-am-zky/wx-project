import crypto from 'crypto'
import { config } from '../config.js'

export function createWechat() {
  return {
    async code2session(code) {
      if (config.wxMockLogin || !config.wxAppSecret) {
        const openid = 'dev_' + crypto.createHash('sha256').update(String(code || 'anon')).digest('hex').slice(0, 24)
        return { openid, unionid: null, session_key: 'mock' }
      }
      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wxAppId}&secret=${config.wxAppSecret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
      const res = await fetch(url)
      const data = await res.json()
      if (!data.openid) {
        const err = new Error(data.errmsg || 'wx login failed')
        err.data = data
        throw err
      }
      return data
    },
    /** mock：不解密真实手机号 */
    async decryptPhone(_code) {
      return { phone: '13800000000' }
    },
    mockPayParams(orderId) {
      return {
        mock: true,
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: crypto.randomBytes(8).toString('hex'),
        package: 'prepay_id=mock_' + orderId,
        signType: 'MD5',
        paySign: 'MOCK'
      }
    },
    async refund() {
      return { mock: true, ok: true }
    }
  }
}
