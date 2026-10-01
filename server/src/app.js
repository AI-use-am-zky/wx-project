import express from 'express'
import cors from 'cors'
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
import { createSf, createSfOpenClient } from './adapters/sf-open.js'
import { createWechat } from './adapters/wechat.js'
import { createNotify } from './adapters/notify.js'
import { createInvoiceAdapter } from './adapters/invoice.js'
import {
  createQuote,
  publicQuote,
  createOrder,
  getOrder,
  markPaidAndSubmitSf,
  cancelOrder,
  applyReweigh,
  paySurcharge,
  issueInvoice
} from './service.js'
import { STATUS } from './domain/order-machine.js'
import {
  ensureDemoOrders,
  listDemoOrders,
  getDemoOrder,
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

const sf = createSf({
  mock: config.sfMock,
  quoteFail: config.sfQuoteFail,
  partnerId: config.sfPartnerId,
  checkWord: config.sfCheckWord,
  env: config.sfEnv,
  monthlyCard: config.sfMonthlyCard,
  preferredProductCodes: config.sfPreferredProductCodes,
  mockFactory: { createMockSf }
})
const wechat = createWechat()
const notify = createNotify({ webhookUrl: config.adminNotifyWebhook })
const invoiceAdapter = createInvoiceAdapter()

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

export function createApp() {
  const app = express()
  app.use(cors())
  // 支付回调必须先读原始 XML，不能走 json parser
  app.use('/pay/wx-notify', express.raw({ type: () => true, limit: '1mb' }))
  app.use(express.json({ limit: '8mb' }))
  app.use('/uploads', express.static(uploadDir))
  const adminDir = path.join(__dirname, '../../admin')
  app.use('/admin', express.static(adminDir))

  app.get('/health', (_req, res) => ok(res, { ok: true }))

  app.post('/auth/wx-login', async (req, res) => {
    try {
      const { code } = req.body || {}
      if (!code) return fail(res, 400, '缺少 code')
      // 官方：code → openid + session_key（session_key 只留服务端）
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
      const token = uuid()
      db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, nowIso())
      // 每位用户独立业务库：data/users/{userId}.sqlite
      const userDb = ensureUserDb(user.id)
      ensureDemoOrders(user.id)
      logOperation({
        userId: user.id,
        type: 'login',
        payload: { mock: config.wxMockLogin || !config.wxAppSecret, dbPath: userDb.path }
      })
      // 自定义登录态：只返回 token + 业务用户信息，不下发 session_key
      ok(res, {
        token,
        user: publicUser(user),
        needPhone: !user.phone,
        needProfile: !(user.nick_name && user.avatar_url),
        dbPath: userDb.path
      })
    } catch (e) {
      console.error('[wx-login]', e.message, e.data || '')
      fail(res, 500, e.message || '微信登录失败', e.data || null)
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
        return fail(res, 400, '请使用微信手机号授权')
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
      brandName: '宠途空运',
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
        await markPaidAndSubmitSf({ orderId: order.id, sf, notify })
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
      return fail(res, 400, '请在 wx-project/server/.env 填写 SF_PARTNER_ID 与 SF_CHECKWORD 后重启服务')
    }
    try {
      const client = createSfOpenClient({
        partnerId: config.sfPartnerId,
        checkWord: config.sfCheckWord,
        env: config.sfEnv,
        monthlyCard: config.sfMonthlyCard || undefined
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
    ensureDemoOrders(req.user.id)
    ok(res, getBadges(req.user.id))
  })

  app.post('/session/badges/seen', auth, (req, res) => {
    const tab = (req.body || {}).tab
    if (!tab) return fail(res, 400, '缺少 tab')
    ensureDemoOrders(req.user.id)
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
    await markPaidAndSubmitSf({ orderId: o.id, sf, notify })
    ok(res, getOrder(o.id))
  })

  app.get('/orders', auth, (req, res) => {
    ensureDemoOrders(req.user.id)
    const demo = listDemoOrders(req.user.id)
    const rows = getUserDb(req.user.id)
      .prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user.id)
    ok(res, { list: [...demo, ...rows.map((r) => getOrder(r.id))] })
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

  app.get('/orders/:id', auth, (req, res) => {
    const demo = getDemoOrder(req.params.id, req.user.id)
    if (demo) return ok(res, demo)
    if (ownerOf('order', req.params.id) !== req.user.id) return fail(res, 404, '订单不存在')
    ok(res, getOrder(req.params.id))
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
    if ((req.body || {}).password !== config.adminPassword) return fail(res, 401, '密码错误')
    const token = uuid()
    db.prepare('INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)').run(token, nowIso())
    ok(res, { token })
  })

  app.get('/admin/orders', adminAuth, (req, res) => {
    const status = req.query.status
    const rows = listOrderIndex(status || null)
    ok(res, { list: rows.map((r) => getOrder(r.id)).filter(Boolean) })
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
    ok(res, { ...o, rawSfError: raw.sf_error, userId: hit.userId })
  })

  app.post('/admin/orders/:id/sf-retry', adminAuth, async (req, res) => {
    const hit = dbForResource('order', req.params.id)
    if (!hit) return fail(res, 404, '订单不存在')
    const raw = hit.udb.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)
    if (!raw) return fail(res, 404, '订单不存在')
    hit.udb.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.PAID, nowIso(), raw.id)
    await markPaidAndSubmitSf({ orderId: raw.id, sf, notify })
    ok(res, getOrder(raw.id))
  })

  app.post('/admin/orders/:id/waybill', adminAuth, (req, res) => {
    const hit = dbForResource('order', req.params.id)
    if (!hit) return fail(res, 404, '订单不存在')
    const { waybillNo, sfOrderId } = req.body || {}
    hit.udb
      .prepare(
        'UPDATE orders SET sf_waybill_no = ?, sf_order_id = ?, status = ?, sf_error = NULL, updated_at = ? WHERE id = ?'
      )
      .run(waybillNo, sfOrderId || waybillNo, STATUS.BOOKED, nowIso(), req.params.id)
    ok(res, getOrder(req.params.id))
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

  app.get('/admin/settings', adminAuth, (_req, res) => ok(res, settingsMap()))

  app.put('/admin/settings', adminAuth, (req, res) => {
    const body = req.body || {}
    const up = db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    for (const [k, v] of Object.entries(body)) up.run(k, String(v))
    ok(res, settingsMap())
  })

  app.use((err, _req, res, _next) => {
    console.error(err)
    fail(res, 500, err.message || 'server error')
  })

  return app
}
