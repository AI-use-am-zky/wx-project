import crypto from 'crypto'
import { v4 as uuid } from 'uuid'

/** Java URLEncoder.encode 风格：非 ASCII / 特殊字符转 %XX，且十六进制大写 */
export function javaUrlEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
}

/** msgDigest = Base64(MD5(URLEncode(msgData + timestamp + checkword))) */
export function signMsgDigest(msgData, timestamp, checkWord) {
  const encoded = javaUrlEncode(String(msgData) + String(timestamp) + String(checkWord))
  return crypto.createHash('md5').update(encoded, 'utf8').digest('base64')
}

const ENV_URLS = {
  sbox: 'https://sfapi-sbox.sf-express.com/std/service',
  prod: 'https://bspgw.sf-express.com/std/service',
  hk: 'https://sfapi-hk.sf-express.com/std/service'
}

/**
 * 从产品推荐列表里挑一条用于估价。
 * 优先：配置的 productCode → 专享即日(T11) → 名称含宠物/空运 → 国内时效类
 */
export function pickProduct(productList, preferredCodes = []) {
  const list = Array.isArray(productList) ? productList.filter(Boolean) : []
  if (!list.length) return null

  const preferred = preferredCodes.map((c) => String(c).trim()).filter(Boolean)
  if (preferred.length) {
    const hit = list.find(
      (p) =>
        preferred.includes(String(p.productCode)) ||
        preferred.includes(String(p.expressType)) ||
        preferred.includes(String(p.productCodeL2 || ''))
    )
    if (hit) return hit
  }

  const score = (p) => {
    const name = `${p.productName || ''}${p.productDisplayName || ''}${p.productNameL2 || ''}`
    const type = String(p.productType || '')
    const code = String(p.productCode || '')
    let s = 0
    if (code === 'T11' || /专享即日/.test(name)) s += 200
    if (/宠物|活体/.test(name)) s += 100
    if (/空运|航空|空配/.test(name)) s += 80
    if (type === '5' || /冷运/.test(name)) s += 60
    if (type === '3') s += 20
    if (type === '7' || /国际/.test(name)) s -= 50
    if (type === '6' || /快运|零担|卡航/.test(name)) s -= 30
    if (p.totalFee == null && p.price == null && p.freight == null) s -= 100
    return s
  }

  const ranked = [...list].sort((a, b) => {
    const ds = score(b) - score(a)
    if (ds) return ds
    return (Number(a.sortNo) || 9999) - (Number(b.sortNo) || 9999)
  })
  return ranked[0]
}

export function feeToCents(product) {
  if (!product) return null
  const yuan = product.totalFee ?? product.price ?? product.freight
  if (yuan == null || Number.isNaN(Number(yuan))) return null
  return Math.round(Number(yuan) * 100)
}

function fullAddress(addr) {
  if (!addr) return ''
  return [addr.province, addr.city, addr.district, addr.detail].filter(Boolean).join('')
}

function fmtSendTime(pickupDate) {
  if (pickupDate && /^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
    return `${pickupDate} 10:00:00`
  }
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function buildProductRecommendMsgData(input, opts = {}) {
  const sender = input.sender || {}
  const receiver = input.receiver || {}
  const species = input.species || '宠物'
  const breed = input.breed || ''
  const msg = {
    srcProvince: sender.province,
    srcCity: sender.city,
    srcCounty: sender.district || undefined,
    destProvince: receiver.province,
    destCity: receiver.city,
    destCounty: receiver.district || undefined,
    srcAddress: fullAddress(sender),
    destAddress: fullAddress(receiver),
    sendTime: fmtSendTime(input.pickupDate),
    weight: Number(input.weightKg) || 1,
    paymentTerms: opts.paymentTerms || '1',
    commodityNameList: [`活体动物-${species}`, breed].filter(Boolean),
    totalNum: 1,
    phoneNumber: sender.phone || receiver.phone || undefined,
    monthlyCard: opts.monthlyCard || undefined,
    traceId: uuid()
  }
  if (input.length != null) msg.length = Number(input.length)
  if (input.width != null) msg.width = Number(input.width)
  if (input.height != null) msg.height = Number(input.height)
  return msg
}

export function createSfOpenClient({
  partnerId,
  checkWord,
  env = 'sbox',
  monthlyCard = '',
  preferredProductCodes = [],
  timeoutMs = 12000
} = {}) {
  if (!partnerId || !checkWord) {
    throw new Error('SF_PARTNER_ID / SF_CHECKWORD 未配置')
  }
  const endpoint = ENV_URLS[env] || ENV_URLS.sbox

  async function call(serviceCode, msgObj) {
    const msgData = typeof msgObj === 'string' ? msgObj : JSON.stringify(msgObj)
    const timestamp = String(Date.now())
    const requestID = uuid()
    const msgDigest = signMsgDigest(msgData, timestamp, checkWord)
    const body = new URLSearchParams({
      partnerID: partnerId,
      requestID,
      serviceCode,
      timestamp,
      msgDigest,
      msgData
    })

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    let res
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(),
        signal: ctrl.signal
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const err = new Error(`SF_HTTP_${res.status}`)
      err.code = 'SF_HTTP_ERROR'
      throw err
    }

    const platform = await res.json()
    // 平台层：apiResultCode === 'A1000' 表示接入成功
    if (platform.apiResultCode && platform.apiResultCode !== 'A1000') {
      const err = new Error(platform.apiErrorMsg || platform.apiResultCode)
      err.code = platform.apiResultCode
      err.raw = platform
      throw err
    }

    let business = platform.apiResultData
    if (typeof business === 'string') {
      try {
        business = JSON.parse(business)
      } catch {
        const err = new Error('顺丰业务报文解析失败')
        err.code = 'SF_PARSE_ERROR'
        err.raw = platform
        throw err
      }
    }
    // 部分环境直接返回业务层
    if (!business && platform.success != null) business = platform

    if (!business || business.success === false || (business.errorCode && business.errorCode !== 'S0000')) {
      const err = new Error((business && business.errorMsg) || '顺丰业务失败')
      err.code = (business && business.errorCode) || 'SF_BIZ_ERROR'
      err.raw = business || platform
      throw err
    }

    let msg = business.msgData
    if (typeof msg === 'string') {
      try {
        msg = JSON.parse(msg)
      } catch {
        /* keep string */
      }
    }
    return { platform, business, msgData: msg }
  }

  return {
    endpoint,
    call,
    async productRecommend(input) {
      const msg =
        input && input.srcProvince
          ? {
              ...input,
              monthlyCard: input.monthlyCard || monthlyCard || undefined,
              paymentTerms: input.paymentTerms || '1'
            }
          : buildProductRecommendMsgData(input, {
              monthlyCard,
              paymentTerms: '1'
            })
      return call('EXP_RECE_PSDS_PRODUCT_RECOMMEND', msg)
    }
  }
}

export function createSf({
  mock = true,
  quoteFail = false,
  partnerId,
  checkWord,
  env,
  monthlyCard,
  preferredProductCodes,
  mockFactory
} = {}) {
  const { createMockSf } = mockFactory
  const base = createMockSf({ quoteFail })

  if (mock || !partnerId || !checkWord) {
    return base
  }

  const client = createSfOpenClient({
    partnerId,
    checkWord,
    env,
    monthlyCard,
    preferredProductCodes
  })
  const preferred = preferredProductCodes || []

  return {
    ...base,
    async quotePetAir(input) {
      if (quoteFail) {
        const err = new Error('SF_QUOTE_UNAVAILABLE')
        err.code = 'SF_QUOTE_UNAVAILABLE'
        throw err
      }
      try {
        const { msgData, business, platform } = await client.productRecommend(input)
        const productList = (msgData && msgData.productList) || []
        const product = pickProduct(productList, preferred)
        const costCents = feeToCents(product)
        if (costCents == null) {
          const err = new Error('SF_QUOTE_NO_PRODUCT')
          err.code = 'SF_QUOTE_UNAVAILABLE'
          err.raw = { msgData, business }
          throw err
        }
        return {
          costCents,
          raw: {
            source: 'EXP_RECE_PSDS_PRODUCT_RECOMMEND',
            product,
            productList,
            fastigiumControlStrategyList: (msgData && msgData.fastigiumControlStrategyList) || [],
            platformCode: platform && platform.apiResultCode
          }
        }
      } catch (e) {
        if (e.code === 'SF_QUOTE_UNAVAILABLE') throw e
        const err = new Error(e.message || 'SF_QUOTE_UNAVAILABLE')
        err.code = 'SF_QUOTE_UNAVAILABLE'
        err.cause = e
        err.raw = e.raw
        throw err
      }
    }
  }
}
