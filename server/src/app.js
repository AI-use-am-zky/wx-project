import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import { config } from './config.js'
import { db, nowIso, uuid as dbUuid, getSetting, settingsMap } from './db.js'
import { ok, fail, validAddress, BREEDS } from './http.js'
import { createMockSf } from './adapters/sf-mock.js'
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
  listOperations
} from './session-db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadDir = path.join(os.tmpdir(), 'pet-air-uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, uuid() + path.extname(file.originalname || '.jpg'))
})
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } })

const sf = createMockSf({ quoteFail: config.sfQuoteFail })
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

export function createApp() {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '8mb' }))
  app.use('/uploads', express.static(uploadDir))
  const adminDir = path.join(__dirname, '../../admin')
  app.use('/admin', express.static(adminDir))

  app.get('/health', (_req, res) => ok(res, { ok: true }))

  app.post('/auth/wx-login', async (req, res) => {
    try {
      const { code } = req.body || {}
      if (!code) return fail(res, 400, '缺少 code')
      const sess = await wechat.code2session(code)
      let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(sess.openid)
      if (!user) {
        const id = dbUuid()
        db.prepare('INSERT INTO users (id, openid, phone, created_at) VALUES (?, ?, ?, ?)').run(id, sess.openid, null, nowIso())
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
      }
      const token = uuid()
      db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, nowIso())
      ensureDemoOrders(user.id)
      logOperation({ userId: user.id, type: 'login', payload: { mock: true } })
      ok(res, { token, user: { id: user.id, phone: user.phone }, needPhone: !user.phone })
    } catch (e) {
      fail(res, 500, e.message)
    }
  })

  app.post('/auth/wx-phone', auth, async (req, res) => {
    const { code } = req.body || {}
    const phone = code ? (await wechat.decryptPhone(code)).phone : req.body.phone
    if (!phone) return fail(res, 400, '无法获取手机号')
    db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone, req.user.id)
    ok(res, { phone })
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
      brandName: '宠途空运'
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
    const rows = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
    ok(res, { list: rows })
  })

  app.post('/addresses', auth, (req, res) => {
    const a = req.body || {}
    if (!validAddress(a)) return fail(res, 400, '地址不完整')
    const id = dbUuid()
    db.prepare(
      `INSERT INTO addresses (id, user_id, role_hint, name, phone, province, city, district, detail, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.user.id, a.role_hint || null, a.name, a.phone, a.province, a.city, a.district, a.detail, a.lat || null, a.lng || null, nowIso())
    ok(res, { id })
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
    db.prepare('INSERT INTO uploads (id, user_id, filename, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      req.user.id,
      req.file.filename,
      nowIso()
    )
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
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id)
    if (!o) return fail(res, 404, '订单不存在')
    if (o.status !== STATUS.PENDING_PAY) return fail(res, 400, '订单状态不可支付')
    await markPaidAndSubmitSf({ orderId: o.id, sf, notify })
    ok(res, getOrder(o.id))
  })

  app.get('/orders', auth, (req, res) => {
    ensureDemoOrders(req.user.id)
    const demo = listDemoOrders(req.user.id)
    const rows = db.prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
    ok(res, { list: [...demo, ...rows.map((r) => getOrder(r.id))] })
  })

  app.get('/pets', auth, (req, res) => {
    ok(res, { list: db.prepare('SELECT * FROM pets WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id) })
  })

  app.post('/pets', auth, (req, res) => {
    const { name, species, breed, weightKg, gender, note } = req.body || {}
    if (!name || !String(name).trim()) return fail(res, 400, '请填写宠物名')
    const id = dbUuid()
    db.prepare(
      'INSERT INTO pets (id, user_id, name, species, breed, weight_kg, gender, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, req.user.id, name.trim(), species || '', breed || '', Number(weightKg) || null, gender || '', note || '', nowIso())
    ok(res, { id })
  })

  app.delete('/pets/:id', auth, (req, res) => {
    db.prepare('DELETE FROM pets WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
    ok(res, { ok: true })
  })

  app.get('/quarantine-docs', auth, (req, res) => {
    ok(res, { list: db.prepare('SELECT * FROM quarantine_docs WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id) })
  })

  app.post('/quarantine-docs', auth, (req, res) => {
    const { title, fileId } = req.body || {}
    if (!title || !fileId) return fail(res, 400, '请填写名称并上传文件')
    const id = dbUuid()
    db.prepare('INSERT INTO quarantine_docs (id, user_id, title, file_id, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id,
      req.user.id,
      title,
      fileId,
      nowIso()
    )
    ok(res, { id })
  })

  app.delete('/quarantine-docs/:id', auth, (req, res) => {
    db.prepare('DELETE FROM quarantine_docs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id)
    ok(res, { ok: true })
  })

  app.get('/orders/:id', auth, (req, res) => {
    const demo = getDemoOrder(req.params.id, req.user.id)
    if (demo) return ok(res, demo)
    const raw = db.prepare('SELECT user_id FROM orders WHERE id = ?').get(req.params.id)
    if (!raw || raw.user_id !== req.user.id) return fail(res, 404, '订单不存在')
    ok(res, getOrder(req.params.id))
  })

  app.post('/orders/:id/cancel', auth, async (req, res) => {
    try {
      const raw = db.prepare('SELECT user_id FROM orders WHERE id = ?').get(req.params.id)
      if (!raw || raw.user_id !== req.user.id) return fail(res, 404, '订单不存在')
      const order = getOrder(req.params.id)
      const data = await cancelOrder({ order, sf, wechat })
      ok(res, { ...data, order: getOrder(req.params.id) })
    } catch (e) {
      fail(res, e.status || 500, e.message)
    }
  })

  app.post('/orders/:id/surcharge/pay', auth, async (req, res) => {
    const raw = db.prepare('SELECT user_id FROM orders WHERE id = ?').get(req.params.id)
    if (!raw || raw.user_id !== req.user.id) return fail(res, 404, '订单不存在')
    try {
      paySurcharge(getOrder(req.params.id))
      ok(res, getOrder(req.params.id))
    } catch (e) {
      fail(res, e.status || 500, e.message)
    }
  })

  app.put('/orders/:id/invoice-title', auth, (req, res) => {
    const raw = db.prepare('SELECT user_id FROM orders WHERE id = ?').get(req.params.id)
    if (!raw || raw.user_id !== req.user.id) return fail(res, 404, '订单不存在')
    const { title, taxNo, email } = req.body || {}
    db.prepare('UPDATE orders SET invoice_title = ?, invoice_tax_no = ?, invoice_email = ?, updated_at = ? WHERE id = ?').run(
      title || '',
      taxNo || '',
      email || '',
      nowIso(),
      req.params.id
    )
    ok(res, getOrder(req.params.id))
  })

  app.post('/orders/:id/invoice/issue', auth, async (req, res) => {
    const raw = db.prepare('SELECT user_id FROM orders WHERE id = ?').get(req.params.id)
    if (!raw || raw.user_id !== req.user.id) return fail(res, 404, '订单不存在')
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
    const rows = status
      ? db.prepare('SELECT id FROM orders WHERE status = ? ORDER BY created_at DESC').all(status)
      : db.prepare('SELECT id FROM orders ORDER BY created_at DESC').all()
    ok(res, { list: rows.map((r) => getOrder(r.id)) })
  })

  app.get('/admin/orders/:id', adminAuth, (req, res) => {
    const o = getOrder(req.params.id)
    if (!o) return fail(res, 404, '订单不存在')
    const raw = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)
    ok(res, { ...o, rawSfError: raw.sf_error })
  })

  app.post('/admin/orders/:id/sf-retry', adminAuth, async (req, res) => {
    const raw = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)
    if (!raw) return fail(res, 404, '订单不存在')
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.PAID, nowIso(), raw.id)
    await markPaidAndSubmitSf({ orderId: raw.id, sf, notify })
    ok(res, getOrder(raw.id))
  })

  app.post('/admin/orders/:id/waybill', adminAuth, (req, res) => {
    const { waybillNo, sfOrderId } = req.body || {}
    db.prepare('UPDATE orders SET sf_waybill_no = ?, sf_order_id = ?, status = ?, sf_error = NULL, updated_at = ? WHERE id = ?').run(
      waybillNo,
      sfOrderId || waybillNo,
      STATUS.BOOKED,
      nowIso(),
      req.params.id
    )
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
    await wechat.refund()
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.REFUNDED, nowIso(), req.params.id)
    ok(res, getOrder(req.params.id))
  })

  app.post('/admin/orders/:id/surcharge', adminAuth, (req, res) => {
    const cents = Number((req.body || {}).surchargeCents)
    db.prepare(
      'UPDATE orders SET prev_transport_status = status, status = ?, surcharge_cents = ?, surcharge_paid = 0, updated_at = ? WHERE id = ?'
    ).run(STATUS.SURCHARGE_PENDING, cents, nowIso(), req.params.id)
    ok(res, getOrder(req.params.id))
  })

  app.post('/admin/orders/:id/mark-signed', adminAuth, (req, res) => {
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.SIGNED, nowIso(), req.params.id)
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
