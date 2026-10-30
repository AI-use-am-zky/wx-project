import crypto from 'crypto'
import { config } from '../config.js'

function md5Upper(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase()
}

/** 微信支付 V2：字典序拼签 &key=API_KEY → MD5 大写 */
export function signWxPayV2(params, apiKey) {
  const keys = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '' && k !== 'sign')
    .sort()
  const str = keys.map((k) => `${k}=${params[k]}`).join('&') + `&key=${apiKey}`
  return md5Upper(str)
}

export function objectToXml(obj) {
  const body = Object.keys(obj)
    .map((k) => `<${k}><![CDATA[${obj[k]}]]></${k}>`)
    .join('')
  return `<xml>${body}</xml>`
}

export function xmlToObject(xml) {
  const out = {}
  const re = /<(\w+)><!\[CDATA\[([\s\S]*?)\]\]><\/\1>|<(\w+)>([^<]*)<\/\3>/g
  let m
  while ((m = re.exec(String(xml || '')))) {
    const key = m[1] || m[3]
    const val = m[2] !== undefined ? m[2] : m[4]
    out[key] = val
  }
  return out
}

/** UUID → 32 位商户订单号；可逆还原 */
export function orderIdToOutTradeNo(orderId) {
  return String(orderId || '').replace(/-/g, '').slice(0, 32)
}

export function outTradeNoToOrderId(outTradeNo) {
  const s = String(outTradeNo || '')
  if (/^[0-9a-f]{32}$/i.test(s)) {
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`.toLowerCase()
  }
  return s
}

let cachedToken = { value: '', expireAt: 0 }

export function createWechat() {
  async function getAccessToken() {
    if (!config.wxAppId || !config.wxAppSecret) {
      throw new Error('未配置 WX_APP_ID / WX_APP_SECRET')
    }
    if (cachedToken.value && Date.now() < cachedToken.expireAt) {
      return cachedToken.value
    }
    const url =
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential` +
      `&appid=${encodeURIComponent(config.wxAppId)}&secret=${encodeURIComponent(config.wxAppSecret)}`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.access_token) {
      const err = new Error(data.errmsg || '获取 access_token 失败')
      err.data = data
      throw err
    }
    cachedToken = {
      value: data.access_token,
      expireAt: Date.now() + Math.max(60, (data.expires_in || 7200) - 200) * 1000
    }
    return cachedToken.value
  }

  return {
    getAccessToken,

    async code2session(code) {
      if (config.wxMockLogin || !config.wxAppSecret) {
        const openid =
          'dev_' + crypto.createHash('sha256').update(String(code || 'anon')).digest('hex').slice(0, 24)
        return { openid, unionid: null, session_key: 'mock' }
      }
      const url =
        `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wxAppId}` +
        `&secret=${config.wxAppSecret}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
      const res = await fetch(url)
      const data = await res.json()
      if (!data.openid) {
        const detail = [data.errcode, data.errmsg].filter(Boolean).join(' ')
        const err = new Error(detail || '微信登录失败')
        err.data = data
        throw err
      }
      return data
    },

    /**
     * 新版手机号：前端 getPhoneNumber 返回的 code
     * mock 模式允许直传 phone，便于开发者工具与单测
     */
    async decryptPhone(code, fallbackPhone) {
      if (config.wxMockLogin || !config.wxAppSecret) {
        return { phone: fallbackPhone || '13800000000' }
      }
      if (!code) {
        throw new Error('缺少手机号授权 code')
      }
      const token = await getAccessToken()
      const res = await fetch(
        `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        }
      )
      const data = await res.json()
      if (data.errcode && data.errcode !== 0) {
        let message = data.errmsg || '获取手机号失败'
        if (data.errcode === 40029) message = '手机号凭证无效，请再点一次允许'
        if (data.errcode === 40013) message = '小程序 AppID 与后台不一致'
        const err = new Error(message)
        err.data = data
        throw err
      }
      const info = data.phone_info || {}
      const phone = info.purePhoneNumber || info.phoneNumber
      if (!phone) throw new Error('未返回手机号')
      return { phone }
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

    /**
     * JSAPI 统一下单，返回小程序 wx.requestPayment 参数
     * totalFee 单位：分
     */
    async createJsapiPayment({ orderId, openid, totalFee, description }) {
      if (config.payMock || !config.wxMchId || !config.wxPayKey) {
        return this.mockPayParams(orderId)
      }
      if (!openid) throw new Error('缺少 openid，无法调起微信支付')
      if (!config.wxAppId) throw new Error('未配置 WX_APP_ID')
      if (!config.wxPayNotifyUrl) throw new Error('未配置 WX_PAY_NOTIFY_URL')

      const outTradeNo = orderIdToOutTradeNo(orderId)
      const nonceStr = crypto.randomBytes(16).toString('hex')
      const params = {
        appid: config.wxAppId,
        mch_id: config.wxMchId,
        nonce_str: nonceStr,
        body: String(description || '航宠通').slice(0, 127),
        out_trade_no: outTradeNo,
        total_fee: String(Math.round(Number(totalFee) || 0)),
        spbill_create_ip: config.wxPayClientIp || '127.0.0.1',
        notify_url: config.wxPayNotifyUrl,
        trade_type: 'JSAPI',
        openid
      }
      params.sign = signWxPayV2(params, config.wxPayKey)

      const res = await fetch('https://api.mch.weixin.qq.com/pay/unifiedorder', {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: objectToXml(params)
      })
      const xml = await res.text()
      const data = xmlToObject(xml)
      if (data.return_code !== 'SUCCESS') {
        const err = new Error(data.return_msg || '统一下单通信失败')
        err.data = data
        throw err
      }
      if (data.result_code !== 'SUCCESS') {
        const err = new Error(data.err_code_des || data.err_code || '统一下单失败')
        err.data = data
        throw err
      }
      const prepayId = data.prepay_id
      if (!prepayId) {
        const err = new Error('未返回 prepay_id')
        err.data = data
        throw err
      }

      const timeStamp = String(Math.floor(Date.now() / 1000))
      const payNonce = crypto.randomBytes(16).toString('hex')
      const payPackage = `prepay_id=${prepayId}`
      const payParams = {
        appId: config.wxAppId,
        timeStamp,
        nonceStr: payNonce,
        package: payPackage,
        signType: 'MD5'
      }
      const paySign = signWxPayV2(payParams, config.wxPayKey)
      return {
        mock: false,
        timeStamp,
        nonceStr: payNonce,
        package: payPackage,
        signType: 'MD5',
        paySign,
        outTradeNo,
        prepayId
      }
    },

    /** 校验支付结果通知，成功返回 { orderId, transactionId, totalFee } */
    parsePayNotify(xml) {
      const data = xmlToObject(xml)
      if (data.return_code !== 'SUCCESS') {
        const err = new Error(data.return_msg || 'notify return fail')
        err.data = data
        throw err
      }
      const sign = data.sign
      const check = { ...data }
      delete check.sign
      if (signWxPayV2(check, config.wxPayKey) !== sign) {
        const err = new Error('支付回调签名校验失败')
        err.data = data
        throw err
      }
      if (data.result_code !== 'SUCCESS') {
        const err = new Error(data.err_code_des || '支付未成功')
        err.data = data
        throw err
      }
      return {
        orderId: outTradeNoToOrderId(data.out_trade_no),
        outTradeNo: data.out_trade_no,
        transactionId: data.transaction_id,
        totalFee: Number(data.total_fee || 0),
        openid: data.openid,
        raw: data
      }
    },

    notifySuccessXml() {
      return objectToXml({ return_code: 'SUCCESS', return_msg: 'OK' })
    },

    notifyFailXml(msg) {
      return objectToXml({ return_code: 'FAIL', return_msg: String(msg || 'FAIL').slice(0, 128) })
    },

    async refund({ orderId, paidCents, refundCents, reason } = {}) {
      if (config.payMock || !config.wxMchId || !config.wxPayKey) {
        return { mock: true, ok: true }
      }
      // V2 退款需商户证书；本期先占位，管理端仍可标退款状态
      return {
        mock: false,
        ok: false,
        pendingCert: true,
        message: '退款需配置商户 API 证书后实现，已记录应退金额',
        orderId,
        paidCents,
        refundCents,
        reason
      }
    }
  }
}
