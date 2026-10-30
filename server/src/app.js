import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import { config } from './config.js'
import {
  db,
  nowIso,
  uuid as dbUuid,
  getSetting,
  settingsMap,
  getUserDb,
  ensureUserDb,
  syncUserProfile,
  listOrderIndex,
  dbForResource,
  ownerOf
} from './db.js'
import { ok, fail, validAddress, BREEDS } from './http.js'
import { createMockSf } from './adapters/sf-mock.js'
import { createSf, createSfOpenClient, petCargoName, petCargoWord } from './adapters/sf-open.js'
import { createWechat } from './adapters/wechat.js'
import { createNotify } from './adapters/notify.js'
import { createInvoiceAdapter } from './adapters/invoice.js'
import {
  createQuote,
  publicQuote,
  createOrder,
  getOrder,
  markPaidAwaitConfirm,
  submitSfPickup,
  attachWaybill,
  cancelOrder,
  applyReweigh,
  paySurcharge,
  issueInvoice,
  applySfWaybillPush
} from './service.js'
import { STATUS } from './domain/order-machine.js'
import {
  getBadges,
  markBadgeSeen,
  logOperation,
  listOperations,
  listUserDbFiles
} from './session-db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(os.tmpdir(), 'pet-air-uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, uuid() + path.extname(file.originalname || '.jpg'))
})
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } })

function auth(req, res, next) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return fail(res, 401, '请先登录')
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!row) return fail(res, 401, '登录已失效')
  req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id)
  if (!req.user) return fail(res, 401, '用户不存在')
  next()
}

function hashAdminPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex')
  return salt + ':' + hash
}

function adminPasswordMatches(password) {
  const stored = getSetting('admin_password_hash')
  if (stored) {
    const [salt, hash] = String(stored).split(':')
    if (!salt || !hash) return false
    const got = crypto.scryptSync(String(password), salt, 32)
    const expect = Buffer.from(hash, 'hex')
    if (expect.length !== got.length) return false
    return crypto.timingSafeEqual(expect, got)
  }
  return String(password) === config.adminPassword
}

function withAdminQuote(userId, order) {
  if (!order || !userId) return order
  const row = getUserDb(userId).prepare('SELECT quote_id FROM orders WHERE id = ?').get(order.id)
  if (!row || !row.quote_id) return order
  const quote = getUserDb(userId)
    .prepare('SELECT sf_cost_cents, sell_freight_cents, service_fee_cents, quote_source FROM quotes WHERE id = ?')
    .get(row.quote_id)
  if (!quote) return order
  return {
    ...order,
    sfCostCents: quote.sf_cost_cents,
    sellFreightCents: quote.sell_freight_cents,
    serviceFeeCents: quote.service_fee_cents,
    quoteSource: quote.quote_source
  }
}

function adminAuth(req, res, next) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  const row = token && db.prepare('SELECT * FROM admin_sessions WHERE token = ?').get(token)
  if (!row) return fail(res, 401, '管理员未登录')
  next()
}

function optionalUser(req) {
  const h = req.headers.authorization || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!row) return null
  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id)
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    phone: user.phone || '',
    nickName: user.nick_name || '',
    avatarUrl: user.avatar_url || ''
  }
}

/** 测试页允许切换的月结卡。默认卡放前面，并去掉空值和重复。 */
function labMonthlyCards() {
  const cards = []
  const push = (value) => {
    const card = String(value || '').trim()
    if (/^\d{6,20}$/.test(card) && !cards.includes(card)) cards.push(card)
  }
  push(config.sfMonthlyCard)
  for (const card of config.sfLabMonthlyCards) push(card)
  return cards
}

function pickLabMonthlyCard(requested) {
  const cards = labMonthlyCards()
  const want = String(requested || '').trim()
  if (!want) return cards[0] || ''
  return cards.includes(want) ? want : ''
}

/** 开发者工具模拟号只接受本机直连。经 Nginx 进来的请求一律要真实手机号。 */
function isDirectLocal(req) {
  if (req.headers['x-forwarded-for'] || req.headers['x-real-ip']) return false
  const ip = (req.socket && req.socket.remoteAddress) || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

export function createApp() {
  const sf = createSf({
    mock: config.sfMock,
    quoteFail: config.sfQuoteFail,
    partnerId: config.sfPartnerId,
    checkWord: config.sfCheckWord,
    env: config.sfEnv,
    monthlyCard: config.sfMonthlyCard,
    preferredProductCodes: config.sfPreferredProductCodes,
    expressTypeId: config.sfExpressTypeId,
    mockFactory: { createMockSf }
  })
  const wechat = createWechat()
  const notify = createNotify({ webhookUrl: config.adminNotifyWebhook })
  const invoiceAdapter = createInvoiceAdapter()

  const app = express()
  app.use(cors())
  // 支付回调必须先读原始 XML，不能走 json parser
  app.use('/pay/wx-notify', express.raw({ type: () => true, limit: '1mb' }))
  // 顺丰推送可能是 form / xml / json
  app.use(
    config.sfWaybillCallbackPath,
    express.text({ type: ['application/xml', 'text/xml', 'text/plain'], limit: '2mb' })
  )
  app.use(express.urlencoded({ extended: true, limit: '2mb' }))
  app.use(express.json({ limit: '8mb' }))
  app.use('/uploads', express.static(uploadDir))
  const adminDir = path.join(__dirname, '../../admin')
  app.use('/admin', express.static(adminDir))

  app.get('/health', (_req, res) => ok(res, { ok: true }))

  app.post('/auth/wx-login', async (req, res) => {
    try {
      const code = String((req.body && req.body.code) || '')
      const phoneCode = String((req.body && req.body.phoneCode) || '')
      const devtools =
        Boolean(req.body && req.body.devtools) && config.allowDevtoolsLogin && isDirectLocal(req)
      if (!code) return fail(res, 400, '缺少 code')
      if (!phoneCode && !config.wxMockLogin && !devtools) return fail(res, 400, '需要授权手机号')

      const sess = await wechat.code2session(code)
      let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(sess.openid)
      if (!user) {
        const id = dbUuid()
        db.prepare(
          'INSERT INTO users (id, openid, phone, session_key, unionid, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(id, sess.openid, null, sess.session_key || null, sess.unionid || null, nowIso())
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      } else {
        db.prepare('UPDATE users SET session_key = ?, unionid = COALESCE(?, unionid) WHERE id = ?').run(
          sess.session_key || null,
          sess.unionid || null,
          user.id
        )
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
      }

      let phone = user.phone || ''
      if (phoneCode || config.wxMockLogin) {
        const result = await wechat.decryptPhone(phoneCode)
        phone = (result && result.phone) || ''
      } else if (devtools) {
        phone = phone || config.devtoolsPhone
      }
      if (!phone) return fail(res, 400, '需要授权手机号')
      if (phone !== user.phone) {
        db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone, user.id)
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
        syncUserProfile(user)
      }
      user = { ...user, phone }

      const token = uuid()
      db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, nowIso())
      // 每位用户独立业务库：data/users/{userId}.sqlite
      const userDb = ensureUserDb(user.id)
      logOperation({
        userId: user.id,
        type: 'login',
        payload: { mock: config.wxMockLogin || !config.wxAppSecret, dbPath: userDb.path }
      })
      // 自定义登录态：只返回 token + 业务用户信息，不下发 session_key
      ok(res, {
        token,
        user: publicUser(user),
        needPhone: false,
        needProfile: !(user.nick_name && user.avatar_url),
        dbPath: userDb.path
      })
    } catch (e) {
      console.error('[wx-login]', e.message, e.data || '')
      fail(res, 500, e.message || '登录失败', e.data || null)
    }
  })

  app.get('/auth/me', auth, (req, res) => {
    ensureUserDb(req.user.id)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
    ok(res, {
      user: publicUser(user),
      needPhone: !(user && user.phone),
      needProfile: !(user && user.nick_name && user.avatar_url),
      dbPath: user && user.db_path
    })
  })

  /** 头像昵称填写（官方 chooseAvatar + nickname，非 getUserInfo） */
  app.post('/auth/profile', auth, (req, res) => {
    const { nickName, avatarUrl } = req.body || {}
    const name = nickName != null ? String(nickName).trim().slice(0, 32) : null
    const avatar = avatarUrl != null ? String(avatarUrl).trim().slice(0, 512) : null
    if (name === null && avatar === null) return fail(res, 400, '无更新内容')
    if (name !== null) {
      db.prepare('UPDATE users SET nick_name = ? WHERE id = ?').run(name || null, req.user.id)
    }
    if (avatar !== null) {
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar || null, req.user.id)
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
    syncUserProfile(user)
    ok(res, { user: publicUser(user) })
  })

  app.post('/auth/wx-phone', auth, async (req, res) => {
    try {
      const { code, phone } = req.body || {}
      if (!config.wxMockLogin && phone && !code) {
        return fail(res, 400, '请使用手机号授权')
      }
      const result = await wechat.decryptPhone(code, phone)
      if (!result.phone) return fail(res, 400, '无法获取手机号')
      db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(result.phone, req.user.id)
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
      syncUserProfile(user)
      ok(res, { phone: result.phone })
    } catch (e) {
      fail(res, 500, e.message)
    }
  })

  app.get('/meta/cities', async (_req, res) => {
    ok(res, { cities: await sf.listServiceCities() })
  })

  app.get('/meta/breeds', (_req, res) => ok(res, { species: BREEDS }))

  app.get('/meta/pickup-dates', auth, async (_req, res) => {
    ok(res, { dates: await sf.listPickupDates() })
  })

  app.get('/meta/settings', (_req, res) => {
    ok(res, {
      agreementVersion: getSetting('transport_agreement_version'),
      brandName: '航宠通',
      payMock: config.payMock || !config.wxMchId || !config.wxPayKey,
      wxMockLogin: config.wxMockLogin || !config.wxAppSecret
    })
  })

  /** 微信支付 V2 异步通知（XML） */
  app.post('/pay/wx-notify', async (req, res) => {
    const xml = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '')
    try {
      const parsed = wechat.parsePayNotify(xml)
      const hit = dbForResource('order', parsed.orderId)
      if (!hit) {
        res.type('text/xml').send(wechat.notifyFailXml('order not found'))
        return
      }
      const order = hit.udb.prepare('SELECT * FROM orders WHERE id = ?').get(parsed.orderId)
      if (!order) {
        res.type('text/xml').send(wechat.notifyFailXml('order not found'))
        return
      }
      if (Number(order.paid_cents) !== Number(parsed.totalFee)) {
        res.type('text/xml').send(wechat.notifyFailXml('amount mismatch'))
        return
      }
      if (order.status === STATUS.PENDING_PAY) {
        await markPaidAwaitConfirm({ orderId: order.id, notify })
      }
      res.type('text/xml').send(wechat.notifySuccessXml())
    } catch (e) {
      console.error('[pay/wx-notify]', e.message)
      res.type('text/xml').send(wechat.notifyFailXml(e.message))
    }
  })

  /** 开发联调：小程序 → 本机 → 顺丰产品推荐（校验码不进小程序） */
  app.post('/debug/sf/product-recommend', async (req, res) => {
    if (!config.sfPartnerId || !config.sfCheckWord) {
      return fail(res, 400, '请在 server/.env 填写 SF_PARTNER_ID 与 SF_CHECKWORD 后重启服务')
    }
    try {
      const client = createSfOpenClient({
        partnerId: config.sfPartnerId,
        checkWord: config.sfCheckWord,
        env: config.sfEnv,
        monthlyCard: config.sfMonthlyCard || undefined,
        expressTypeId: config.sfExpressTypeId
      })
      const result = await client.productRecommend(req.body || {})
      ok(res, {
        env: config.sfEnv,
        endpoint: client.endpoint,
        partnerId: config.sfPartnerId,
        productCount: (result.msgData && result.msgData.productList && result.msgData.productList.length) || 0,
        productList: (result.msgData && result.msgData.productList) || [],
        fastigiumControlStrategyList: (result.msgData && result.msgData.fastigiumControlStrategyList) || [],
        platform: {
          apiResultCode: result.platform && result.platform.apiResultCode,
          apiErrorMsg: result.platform && result.platform.apiErrorMsg
        },
        business: {
          success: result.business && result.business.success,
          errorCode: result.business && result.business.errorCode,
          errorMsg: result.business && result.business.errorMsg
        }
      })
    } catch (e) {
      fail(res, 502, e.message || '顺丰调用失败', { code: e.code, raw: e.raw })
    }
  })

  /** 开发联调：真实下单（会生成真实运单，慎用） */
  app.post('/debug/sf/create-order', async (req, res) => {
    if (config.sfMock) {
      return fail(res, 400, '当前 SF_MOCK=true，请在 .env 设为 false 后重启')
    }
    if (!config.sfPartnerId || !config.sfCheckWord) {
      return fail(res, 400, '请填写 SF_PARTNER_ID / SF_CHECKWORD')
    }
    try {
      const created = await sf.createOrder(req.body || {})
      ok(res, {
        env: config.sfEnv,
        partnerId: config.sfPartnerId,
        waybillNo: created.waybillNo,
        sfOrderId: created.sfOrderId,
        callbackUrl: config.sfPublicBaseUrl
          ? `${config.sfPublicBaseUrl}${config.sfWaybillCallbackPath}`
          : null,
        raw: created.raw
      })
    } catch (e) {
      fail(res, 502, e.message || '顺丰下单失败', { code: e.code, raw: e.raw })
    }
  })

  /** 网页测试端：活体与普通货物分开打顺丰，不走小程序下单。 */
  app.get('/debug/sf', (_req, res) => {
    res.sendFile(path.join(adminDir, 'sf-lab.html'))
  })

  app.get('/debug/sf/status', (_req, res) => {
    const cards = labMonthlyCards()
    ok(res, {
      mock: config.sfMock,
      env: config.sfEnv,
      monthlyCard: Boolean(config.sfMonthlyCard),
      monthlyCards: cards,
      defaultMonthlyCard: config.sfMonthlyCard || cards[0] || '',
      expressTypeId: config.sfExpressTypeId
    })
  })

  app.post('/debug/sf/lab', async (req, res) => {
    if (config.sfMock) return fail(res, 400, '当前 SF_MOCK=true，请改为 false 后重启再测真实顺丰')
    if (!config.sfPartnerId || !config.sfCheckWord) return fail(res, 400, '请填写 SF_PARTNER_ID / SF_CHECKWORD')
    const body = req.body || {}
    const action = body.action === 'order' || body.action === 'cancel' ? body.action : 'quote'
    const monthlyCard = pickLabMonthlyCard(body.monthlyCard)
    if (!monthlyCard) return fail(res, 400, '请选择测试名单里的月结卡号')
    let sent = null
    const client = createSfOpenClient({
      partnerId: config.sfPartnerId,
      checkWord: config.sfCheckWord,
      env: config.sfEnv,
      monthlyCard,
      expressTypeId: config.sfExpressTypeId
    })
    try {
      if (action === 'cancel') {
        const sfOrderId = String(body.sfOrderId || '').trim()
        if (!sfOrderId) return fail(res, 400, '缺少顺丰订单号')
        const result = await client.cancelOrder(sfOrderId)
        return ok(res, { action, sfOrderId, monthlyCard, raw: result.raw })
      }
      const kind = body.cargoKind === 'normal' ? 'normal' : 'live'
      const sender = body.sender || {}
      const receiver = body.receiver || {}
      for (const [who, addr] of [
        ['寄件', sender],
        ['收件', receiver]
      ]) {
        for (const key of ['name', 'phone', 'province', 'city', 'district', 'detail']) {
          if (!addr[key] || !String(addr[key]).trim()) return fail(res, 400, `${who}缺少${key}`)
        }
        if (String(addr.district).includes('省市区')) return fail(res, 400, `${who}区县请填具体区名，不要填「省市区」`)
      }
      const species = String(body.species || 'dog').slice(0, 20)
      const breed = String(body.breed || '测试').slice(0, 20)
      const cargo =
        kind === 'normal'
          ? { cargoName: '服装', cargoDesc: '服装', cargoUnit: '件', commodityNameList: ['服装'], species: '服装', breed: '' }
          : {
              cargoName: petCargoName(species, breed),
              cargoDesc: petCargoWord(species),
              cargoUnit: '只',
              commodityNameList: [petCargoName(species)],
              species,
              breed
            }
      const expressTypeId =
        body.expressTypeId != null && body.expressTypeId !== '' ? Number(body.expressTypeId) : config.sfExpressTypeId
      sent = {
        cargoKind: kind,
        cargoName: cargo.cargoName,
        cargoDesc: cargo.cargoDesc,
        cargoUnit: cargo.cargoUnit,
        expressTypeId,
        monthlyCard,
        weightKg: Number(body.weightKg) || 1,
        pickupDate: body.pickupDate || '',
        sender,
        receiver
      }
      if (action === 'quote') {
        const result = await client.productRecommend({
          sender,
          receiver,
          weightKg: sent.weightKg,
          species: cargo.species,
          breed: cargo.breed,
          commodityNameList: cargo.commodityNameList,
          pickupDate: body.pickupDate
        })
        const productList = (result.msgData && result.msgData.productList) || []
        return ok(res, {
          action,
          sent,
          monthlyCard,
          env: config.sfEnv,
          endpoint: client.endpoint,
          productList,
          platform: {
            apiResultCode: result.platform && result.platform.apiResultCode,
            apiErrorMsg: result.platform && result.platform.apiErrorMsg
          },
          business: {
            success: result.business && result.business.success,
            errorCode: result.business && result.business.errorCode,
            errorMsg: result.business && result.business.errorMsg
          }
        })
      }
      const created = await client.createOrder({
        orderId: `LAB-${Date.now()}`,
        sender,
        receiver,
        weightKg: sent.weightKg,
        species: cargo.species,
        breed: cargo.breed,
        cargoName: cargo.cargoName,
        cargoDesc: cargo.cargoDesc,
        cargoUnit: cargo.cargoUnit,
        expressTypeId,
        pickupDate: body.pickupDate
      })
      ok(res, {
        action,
        sent,
        monthlyCard,
        env: config.sfEnv,
        waybillNo: created.waybillNo,
        sfOrderId: created.sfOrderId,
        raw: created.raw
      })
    } catch (e) {
      fail(res, 502, e.message || '顺丰调用失败', { code: e.code, raw: e.raw, sent })
    }
  })

  /**
   * 顺丰运单/路由推送回调（你在开放平台登记的地址）。
   * 例：https://xxx.trycloudflare.com/sfexpress/waybills/back
   * 注意：这是「顺丰 → 你的服务」，不是你去调顺丰下单的 API。
   */
  app.post(config.sfWaybillCallbackPath, (req, res) => {
    try {
      let payload = req.body
      if (typeof payload === 'string' && payload.trim()) {
        const asJson = (() => {
          try {
            return JSON.parse(payload)
          } catch {
            return null
          }
        })()
        if (asJson) payload = asJson
        else {
          const mailno = (payload.match(/mailno=['"]([^'"]+)/i) || [])[1]
          const orderid = (payload.match(/orderid=['"]([^'"]+)/i) || [])[1]
          const opCode = (payload.match(/opCode=['"]([^'"]+)/i) || [])[1]
          const remark = (payload.match(/remark=['"]([^'"]+)/i) || [])[1]
          const acceptTime = (payload.match(/acceptTime=['"]([^'"]+)/i) || [])[1]
          payload = { mailno, orderId: orderid, opCode, remark, acceptTime, rawXml: payload }
        }
      }
      if (payload && payload.content && typeof payload.content === 'string') {
        try {
          payload = { ...payload, ...JSON.parse(payload.content) }
        } catch {
          /* keep */
        }
      }
      const result = applySfWaybillPush(payload)
      console.log('[sf/waybill-callback]', result)
      // 兼容新旧推送应答
      res.status(200).json({ success: true, return_code: '0000', return_msg: '成功', ...result })
    } catch (e) {
      console.error('[sf/waybill-callback]', e.message)
      res.status(200).json({ success: false, return_code: '1000', return_msg: e.message || 'error' })
    }
  })

  app.get('/debug/sf/config', (_req, res) => {
    ok(res, {
      mock: config.sfMock,
      env: config.sfEnv,
      partnerId: config.sfPartnerId || null,
      checkwordSet: Boolean(config.sfCheckWord),
      monthlyCardSet: Boolean(config.sfMonthlyCard),
      expressTypeId: config.sfExpressTypeId,
      preferredProductCodes: config.sfPreferredProductCodes,
      apiEndpoint:
        config.sfEnv === 'sbox'
          ? 'https://sfapi-sbox.sf-express.com/std/service'
          : 'https://bspgw.sf-express.com/std/service',
      publicBaseUrl: config.sfPublicBaseUrl || null,
      waybillCallbackUrl: config.sfPublicBaseUrl
        ? `${config.sfPublicBaseUrl}${config.sfWaybillCallbackPath}`
        : `http://127.0.0.1:${config.port}${config.sfWaybillCallbackPath}`,
      note: 'SF_PUBLIC_BASE_URL 是顺丰推送回调的公网入口，不是下单 API'
    })
  })

  app.post('/session/ops', (req, res) => {
    const { type, payload } = req.body || {}
    if (!type) return fail(res, 400, '缺少操作类型')
    const user = optionalUser(req)
    logOperation({ userId: user && user.id, type, payload })
    ok(res, { ok: true })
  })

  app.get('/session/ops', auth, (req, res) => {
    ok(res, { list: listOperations(req.user.id) })
  })

  app.get('/session/badges', auth, (req, res) => {
    ok(res, getBadges(req.user.id))
  })

  app.post('/session/badges/seen', auth, (req, res) => {
    const tab = (req.body || {}).tab
    if (!tab) return fail(res, 400, '缺少 tab')
    ok(res, markBadgeSeen(req.user.id, tab))
  })

  app.get('/addresses', auth, (req, res) => {
    const rows = getUserDb(req.user.id)
      .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user.id)
    ok(res, { list: rows })
  })

  app.post('/addresses', auth, (req, res) => {
    const a = req.body || {}
    if (!validAddress(a)) return fail(res, 400, '地址不完整')
    const id = dbUuid()
    getUserDb(req.user.id)
      .prepare(
        `INSERT INTO addresses (id, user_id, role_hint, name, phone, province, city, district, detail, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        req.user.id,
        a.role_hint || null,
        a.name,
        a.phone,
        a.province,
        a.city,
        a.district,
        a.detail,
        a.lat || null,
        a.lng || null,
        nowIso()
      )
    ok(res, { id })
  })

  app.put('/addresses/:id', auth, (req, res) => {
    const a = req.body || {}
    if (!validAddress(a)) return fail(res, 400, '地址不完整')
    const changed = getUserDb(req.user.id)
      .prepare(
        `UPDATE addresses SET name = ?, phone = ?, province = ?, city = ?, district = ?, detail = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(a.name, a.phone, a.province, a.city, a.district, a.detail, req.params.id, req.user.id)
    if (!changed.changes) return fail(res, 404, '地址不存在')
    ok(res, { id: req.params.id })
  })

  app.delete('/addresses/:id', auth, (req, res) => {
    const changed = getUserDb(req.user.id)
      .prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id)
    if (!changed.changes) return fail(res, 404, '地址不存在')
    ok(res, { id: req.params.id })
  })

  app.post('/quotes', auth, async (req, res) => {
    try {
      const data = await createQuote({ userId: req.user.id, ...req.body, sf })
      ok(res, data)
    } catch (e) {
      fail(res, e.status || 500, e.message)
    }
  })

  app.get('/quotes/:id', auth, (req, res) => {
    const q = publicQuote(req.params.id)
    if (!q) return fail(res, 404, '报价不存在')
    ok(res, q)
  })

  app.get('/addons/crates', (_req, res) => {
    ok(res, { list: db.prepare('SELECT * FROM crate_skus').all() })
  })

  app.post('/uploads', auth, upload.single('file'), (req, res) => {
    if (!req.file) return fail(res, 400, '未选择文件')
    const id = dbUuid()
    getUserDb(req.user.id)
      .prepare('INSERT INTO uploads (id, user_id, filename, created_at) VALUES (?, ?, ?, ?)')
      .run(id, req.user.id, req.file.filename, nowIso())
    ok(res, { fileId: id, url: `/uploads/${req.file.filename}` })
  })

  app.post('/orders', auth, async (req, res) => {
    try {
      const data = await createOrder({ userId: req.user.id, body: req.body, sf, wechat, notify })
      ok(res, data)
    } catch (e) {
      fail(res, e.status || 500, e.message)
    }
  })

  app.post('/orders/:id/mock-pay', auth, async (req, res) => {
    if (!config.payMock) return fail(res, 403, '未开启模拟支付')
    if (ownerOf('order', req.params.id) !== req.user.id) return fail(res, 404, '订单不存在')
    const o = getUserDb(req.user.id)
      .prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id)
    if (!o) return fail(res, 404, '订单不存在')
    if (o.status !== STATUS.PENDING_PAY) return fail(res, 400, '订单状态不可支付')
    await markPaidAwaitConfirm({ orderId: o.id, notify })
    ok(res, getOrder(o.id))
  })

  app.get('/orders', auth, (req, res) => {
    const rows = getUserDb(req.user.id)
      .prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user.id)
    ok(res, { list: rows.map((r) => getOrder(r.id)) })
  })

  app.get('/pets', auth, (req, res) => {
    ok(res, {
      list: getUserDb(req.user.id)
        .prepare('SELECT * FROM pets WHERE user_id = ? ORDER BY created_at DESC')
        .all(req.user.id)
    })
  })

  app.post('/pets', auth, (req, res) => {
    const { name, species, breed, weightKg, gender, note } = req.body || {}
    if (!name || !String(name).trim()) return fail(res, 400, '请填写宠物名')
    const id = dbUuid()
    getUserDb(req.user.id)
      .prepare(
        'INSERT INTO pets (id, user_id, name, species, breed, weight_kg, gender, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        id,
        req.user.id,
        name.trim(),
        species || '',
        breed || '',
        Number(weightKg) || null,
        gender || '',
        note || '',
        nowIso()
      )
    ok(res, { id })
  })

  app.delete('/pets/:id', auth, (req, res) => {
    getUserDb(req.user.id).prepare('DELETE FROM pets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
    ok(res, { ok: true })
  })

  app.get('/quarantine-docs', auth, (req, res) => {
    ok(res, {
      list: getUserDb(req.user.id)
        .prepare('SELECT * FROM quarantine_docs WHERE user_id = ? ORDER BY created_at DESC')
        .all(req.user.id)
    })
  })

  app.post('/quarantine-docs', auth, (req, res) => {
    const { title, fileId } = req.body || {}
    if (!title || !fileId) return fail(res, 400, '请填写名称并上传文件')
    const id = dbUuid()
    getUserDb(req.user.id)
      .prepare('INSERT INTO quarantine_docs (id, user_id, title, file_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, req.user.id, title, fileId, nowIso())
    ok(res, { id })
  })

  app.delete('/quarantine-docs/:id', auth, (req, res) => {
    getUserDb(req.user.id)
      .prepare('DELETE FROM quarantine_docs WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id)
    ok(res, { ok: true })
  })

  app.get('/orders/:id', auth, async (req, res) => {
    if (ownerOf('order', req.params.id) !== req.user.id) return fail(res, 404, '订单不存在')
    const order = getOrder(req.params.id)
    let routes = []
    if (order && order.sfWaybillNo) {
      try {
        routes = await sf.queryRoutes(order.sfWaybillNo)
      } catch (e) {
        routes = []
        order.routesError = e.message || '暂时查不到物流路径'
      }
    }
    ok(res, { ...order, routes })
  })

  app.post('/orders/:id/cancel', auth, async (req, res) => {
    try {
      if (ownerOf('order', req.params.id) !== req.user.id) return fail(res, 404, '订单不存在')
      const order = getOrder(req.params.id)
      const data = await cancelOrder({ order, sf, wechat })
      ok(res, { ...data, order: getOrder(req.params.id) })
    } catch (e) {
      fail(res, e.status || 500, e.message)
    }
  })

  app.post('/orders/:id/surcharge/pay', auth, async (req, res) => {
    if (ownerOf('order', req.params.id) !== req.user.id) return fail(res, 404, '订单不存在')
    try {
      paySurcharge(getOrder(req.params.id))
      ok(res, getOrder(req.params.id))
    } catch (e) {
      fail(res, e.status || 500, e.message)
    }
  })

  app.put('/orders/:id/invoice-title', auth, (req, res) => {
    if (ownerOf('order', req.params.id) !== req.user.id) return fail(res, 404, '订单不存在')
    const { title, taxNo, email } = req.body || {}
    getUserDb(req.user.id)
      .prepare(
        'UPDATE orders SET invoice_title = ?, invoice_tax_no = ?, invoice_email = ?, updated_at = ? WHERE id = ?'
      )
      .run(title || '', taxNo || '', email || '', nowIso(), req.params.id)
    ok(res, getOrder(req.params.id))
  })

  app.post('/orders/:id/invoice/issue', auth, async (req, res) => {
    if (ownerOf('order', req.params.id) !== req.user.id) return fail(res, 404, '订单不存在')
    try {
      const result = await issueInvoice(getOrder(req.params.id), invoiceAdapter)
      ok(res, result)
    } catch (e) {
      fail(res, e.status || 500, e.message)
    }
  })

  app.post('/admin/login', (req, res) => {
    const body = req.body || {}
    const username = String(body.username || '').trim()
    const password = String(body.password || '')
    if (username !== config.adminUser || !adminPasswordMatches(password)) {
      return fail(res, 401, '账号或密码错误')
    }
    const token = uuid()
    db.prepare('INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)').run(token, nowIso())
    ok(res, { token, username })
  })

  app.get('/admin/orders', adminAuth, (req, res) => {
    const status = req.query.status
    const rows = listOrderIndex(status || null)
    const list = rows
      .map((r) => {
        const order = getOrder(r.id)
        if (!order) return null
        const user = db.prepare('SELECT phone, nick_name FROM users WHERE id = ?').get(r.user_id)
        return withAdminQuote(r.user_id, {
          ...order,
          userId: r.user_id,
          userPhone: (user && user.phone) || '',
          userNick: (user && user.nick_name) || ''
        })
      })
      .filter(Boolean)
    ok(res, { list })
  })

  app.get('/admin/users', adminAuth, (_req, res) => {
    const users = db.prepare('SELECT id, openid, phone, nick_name, avatar_url, db_path, created_at FROM users ORDER BY created_at DESC').all()
    ok(res, {
      list: users.map((u) => ({
        id: u.id,
        openid: u.openid,
        phone: u.phone || '',
        nickName: u.nick_name || '',
        avatarUrl: u.avatar_url || '',
        dbPath: u.db_path || `users/${u.id}.sqlite`,
        createdAt: u.created_at
      })),
      files: listUserDbFiles()
    })
  })

  app.get('/admin/orders/:id', adminAuth, (req, res) => {
    const o = getOrder(req.params.id)
    if (!o) return fail(res, 404, '订单不存在')
    const hit = dbForResource('order', req.params.id)
    const raw = hit.udb.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)
    const user = db.prepare('SELECT phone, nick_name FROM users WHERE id = ?').get(hit.userId)
    ok(res, withAdminQuote(hit.userId, {
      ...o,
      rawSfError: raw.sf_error,
      userId: hit.userId,
      userPhone: (user && user.phone) || '',
      userNick: (user && user.nick_name) || ''
    }))
  })

  app.post('/admin/orders/:id/sf-retry', adminAuth, async (req, res) => {
    try {
      const order = await submitSfPickup({ orderId: req.params.id, sf, notify })
      if (!order) return fail(res, 404, '订单不存在')
      ok(res, order)
    } catch (e) {
      fail(res, e.status || 502, e.message)
    }
  })

  app.post('/admin/orders/:id/waybill', adminAuth, (req, res) => {
    try {
      const { waybillNo, sfOrderId } = req.body || {}
      const order = attachWaybill({ orderId: req.params.id, waybillNo, sfOrderId })
      if (!order) return fail(res, 404, '订单不存在')
      ok(res, order)
    } catch (e) {
      fail(res, e.status || 500, e.message)
    }
  })

  app.post('/admin/orders/:id/reweigh', adminAuth, (req, res) => {
    const kg = Number((req.body || {}).actualKg)
    if (!(kg > 0)) return fail(res, 400, '重量无效')
    const order = getOrder(req.params.id)
    if (!order) return fail(res, 404, '订单不存在')
    const result = applyReweigh(order, kg)
    ok(res, { result, order: getOrder(req.params.id) })
  })

  app.post('/admin/orders/:id/refund', adminAuth, async (req, res) => {
    const hit = dbForResource('order', req.params.id)
    if (!hit) return fail(res, 404, '订单不存在')
    await wechat.refund()
    hit.udb.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.REFUNDED, nowIso(), req.params.id)
    ok(res, getOrder(req.params.id))
  })

  app.post('/admin/orders/:id/surcharge', adminAuth, (req, res) => {
    const hit = dbForResource('order', req.params.id)
    if (!hit) return fail(res, 404, '订单不存在')
    const cents = Number((req.body || {}).surchargeCents)
    hit.udb
      .prepare(
        'UPDATE orders SET prev_transport_status = status, status = ?, surcharge_cents = ?, surcharge_paid = 0, updated_at = ? WHERE id = ?'
      )
      .run(STATUS.SURCHARGE_PENDING, cents, nowIso(), req.params.id)
    ok(res, getOrder(req.params.id))
  })

  app.post('/admin/orders/:id/mark-signed', adminAuth, (req, res) => {
    const hit = dbForResource('order', req.params.id)
    if (!hit) return fail(res, 404, '订单不存在')
    hit.udb.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.SIGNED, nowIso(), req.params.id)
    ok(res, getOrder(req.params.id))
  })

  app.post('/admin/password', (req, res) => {
    const body = req.body || {}
    const current = String(body.currentPassword || '')
    const next = String(body.newPassword || '')
    if (!adminPasswordMatches(current)) return fail(res, 400, '当前密码不正确')
    if (next.length < 6) return fail(res, 400, '新密码至少 6 位')
    if (next === current) return fail(res, 400, '新密码不能和当前密码相同')
    db.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run('admin_password_hash', hashAdminPassword(next))
    db.prepare('DELETE FROM admin_sessions').run()
    ok(res, { ok: true })
  })

  function normalizeVipPhone(value) {
    const digits = String(value || '').replace(/\D/g, '')
    if (digits.length === 13 && digits.startsWith('86')) return digits.slice(2)
    return digits
  }

  app.get('/admin/vips', adminAuth, (_req, res) => {
    const list = db.prepare('SELECT phone, name, created_at FROM vip_accounts ORDER BY created_at DESC').all()
    ok(res, {
      discountRate: Number(getSetting('vip_discount_rate')) || 0,
      list: list.map((row) => ({
        phone: row.phone,
        name: row.name || '',
        createdAt: row.created_at
      }))
    })
  })

  app.post('/admin/vips', adminAuth, (req, res) => {
    const phone = normalizeVipPhone((req.body || {}).phone)
    const name = String((req.body || {}).name || '').trim().slice(0, 32)
    if (!/^1\d{10}$/.test(phone)) return fail(res, 400, '请填写 11 位手机号')
    db.prepare(
      `INSERT INTO vip_accounts (phone, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET name = excluded.name`
    ).run(phone, name, nowIso())
    ok(res, { phone, name })
  })

  app.delete('/admin/vips/:phone', adminAuth, (req, res) => {
    const phone = normalizeVipPhone(req.params.phone)
    const changed = db.prepare('DELETE FROM vip_accounts WHERE phone = ?').run(phone)
    if (!changed.changes) return fail(res, 404, '这个手机号不是 VIP')
    ok(res, { phone })
  })

  app.get('/admin/settings', adminAuth, (_req, res) => {
    const data = settingsMap()
    delete data.admin_password_hash
    ok(res, data)
  })

  app.put('/admin/settings', adminAuth, (req, res) => {
    const body = req.body || {}
    const up = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    for (const [k, v] of Object.entries(body)) {
      if (k === 'admin_password_hash') continue
      if (k === 'vip_discount_rate') {
        const rate = Number(v)
        if (!(rate >= 0 && rate < 1)) return fail(res, 400, 'VIP 折扣请填 0 到 99 之间的百分数')
      }
      up.run(k, String(v))
    }
    const data = settingsMap()
    delete data.admin_password_hash
    ok(res, data)
  })

  app.use((err, _req, res, _next) => {
    console.error(err)
    fail(res, 500, err.message || 'server error')
  })

  return app
}
