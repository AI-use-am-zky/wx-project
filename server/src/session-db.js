import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { v4 as uuid } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '../data')
fs.mkdirSync(dataDir, { recursive: true })

const sessionDbPath = path.join(dataDir, 'session.sqlite')
export const sessionDb = new DatabaseSync(sessionDbPath)
sessionDb.exec('PRAGMA journal_mode = WAL')

sessionDb.exec(`
CREATE TABLE IF NOT EXISTS demo_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tab_key TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS badge_reads (
  user_id TEXT NOT NULL,
  tab_key TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (user_id, tab_key)
);
CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS demo_seed (
  user_id TEXT PRIMARY KEY,
  seeded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_orders_user ON demo_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_user ON operations(user_id, created_at DESC);
`)

const CITIES = [
  { code: 'beijing', name: '北京', province: '北京市' },
  { code: 'shanghai', name: '上海', province: '上海市' },
  { code: 'guangzhou', name: '广州', province: '广东省' },
  { code: 'shenzhen', name: '深圳', province: '广东省' },
  { code: 'chengdu', name: '成都', province: '四川省' },
  { code: 'hangzhou', name: '杭州', province: '浙江省' },
  { code: 'wuhan', name: '武汉', province: '湖北省' },
  { code: 'xian', name: '西安', province: '陕西省' }
]

const PETS = [
  { species: 'cat', breed: '英国短毛猫', name: '奶茶' },
  { species: 'cat', breed: '布偶', name: '雪球' },
  { species: 'cat', breed: '中华田园猫', name: '橘子' },
  { species: 'dog', breed: '柯基', name: '土豆' },
  { species: 'dog', breed: '金毛', name: '阿福' },
  { species: 'dog', breed: '泰迪', name: '豆豆' },
  { species: 'dog', breed: '边牧', name: '皮皮' }
]

const PEOPLE = [
  { name: '张三', phone: '13800138001' },
  { name: '李四', phone: '13900139002' },
  { name: '王五', phone: '13700137003' },
  { name: '赵六', phone: '13600136004' },
  { name: '陈七', phone: '13500135005' }
]

const TAB_STATUSES = {
  pending: ['pending_pay'],
  transit: ['booked', 'collected', 'in_transit'],
  done: ['signed'],
  cancelled: ['cancelled', 'refunded']
}

const STATUS_EVENTS = {
  pending_pay: ['订单已创建，待支付'],
  booked: ['订单已支付', '已预约上门取件'],
  collected: ['订单已支付', '已预约上门取件', '宠物已揽收'],
  in_transit: ['订单已支付', '已预约上门取件', '宠物已揽收', '航班运输中'],
  signed: ['订单已支付', '已预约上门取件', '宠物已揽收', '航班运输中', '收件人已签收'],
  cancelled: ['订单已创建', '用户取消订单'],
  refunded: ['订单已支付', '订单已取消并退款']
}

function nowIso() {
  return new Date().toISOString()
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function makeAddress(city, person) {
  return {
    name: person.name,
    phone: person.phone,
    province: city.province,
    city: city.name,
    district: '示例区',
    detail: `${randInt(1, 88)}号楼 ${randInt(101, 2508)}室`
  }
}

function makeDemoOrder(userId, tabKey) {
  const status = pick(TAB_STATUSES[tabKey])
  const from = pick(CITIES)
  let to = pick(CITIES)
  while (to.code === from.code) to = pick(CITIES)
  const pet = pick(PETS)
  const sender = makeAddress(from, pick(PEOPLE))
  const receiver = makeAddress(to, pick(PEOPLE))
  const weightKg = Number((randInt(15, 180) / 10).toFixed(1))
  const paidCents = 68000 + randInt(0, 8) * 5000
  const createdAt = daysAgo(randInt(1, 20))
  const waybill = ['booked', 'collected', 'in_transit', 'signed'].includes(status)
    ? 'SF' + String(Date.now()).slice(-8) + String(randInt(10, 99))
    : null
  const texts = STATUS_EVENTS[status] || ['订单已创建']
  const timeline = texts.map((text, i) => ({
    type: i === 0 ? 'created' : 'track',
    text,
    at: daysAgo(Math.max(0, randInt(0, 12) - i)),
    extra: null
  }))
  const payload = {
    sender,
    receiver,
    species: pet.species,
    breed: pet.breed,
    petName: pet.name,
    weightKg,
    pickupDate: createdAt.slice(0, 10),
    crateMode: 'own',
    quarantineMode: 'self',
    insure: false,
    declaredValueCents: 0,
    petPhotos: [],
    cratePhotos: [],
    quarantinePhotos: [],
    sfWaybillNo: waybill,
    sfOrderId: waybill ? 'mock-' + waybill : null,
    lines: [{ key: 'air_dtd', name: '空运门到门', cents: paidCents }],
    timeline,
    demo: true
  }
  return {
    id: uuid(),
    userId,
    tabKey,
    status,
    payload,
    paidCents,
    createdAt,
    updatedAt: nowIso()
  }
}

function publicDemoOrder(row) {
  if (!row) return null
  const payload = JSON.parse(row.payload_json)
  const timeline = payload.timeline || []
  delete payload.timeline
  return {
    id: row.id,
    status: row.status,
    paidCents: row.paid_cents,
    surchargeCents: 0,
    surchargePaid: false,
    declaredWeightKg: payload.weightKg,
    actualWeightKg: null,
    sfWaybillNo: payload.sfWaybillNo || null,
    sfOrderId: payload.sfOrderId || null,
    sfError: null,
    invoiceTitle: null,
    invoiceTaxNo: null,
    invoiceEmail: null,
    invoiceStatus: row.status === 'signed' ? 'draft' : null,
    prev_transport_status: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...payload,
    timeline,
    demo: true,
    tabKey: row.tab_key
  }
}

export function logOperation({ userId, type, payload }) {
  sessionDb.prepare(
    'INSERT INTO operations (id, user_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(uuid(), userId || null, type, payload ? JSON.stringify(payload) : null, nowIso())
}

export function listOperations(userId, limit = 100) {
  const rows = userId
    ? sessionDb.prepare(
        'SELECT * FROM operations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(userId, limit)
    : sessionDb.prepare('SELECT * FROM operations ORDER BY created_at DESC LIMIT ?').all(limit)
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    type: r.type,
    payload: r.payload_json ? JSON.parse(r.payload_json) : null,
    createdAt: r.created_at
  }))
}

export function ensureDemoOrders(userId) {
  if (!userId) return { seeded: false, counts: {} }
  const existed = sessionDb.prepare('SELECT user_id FROM demo_seed WHERE user_id = ?').get(userId)
  if (existed) return { seeded: false, counts: countByTab(userId) }

  const insertOrder = sessionDb.prepare(
    `INSERT INTO demo_orders (id, user_id, tab_key, status, payload_json, paid_cents, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertSeed = sessionDb.prepare('INSERT INTO demo_seed (user_id, seeded_at) VALUES (?, ?)')

  const counts = { pending: 0, transit: 0, done: 0, cancelled: 0 }
  sessionDb.exec('BEGIN')
  try {
    for (const tab of Object.keys(TAB_STATUSES)) {
      const n = randInt(1, 5)
      counts[tab] = n
      for (let i = 0; i < n; i++) {
        const o = makeDemoOrder(userId, tab)
        insertOrder.run(
          o.id,
          o.userId,
          o.tabKey,
          o.status,
          JSON.stringify(o.payload),
          o.paidCents,
          o.createdAt,
          o.updatedAt
        )
      }
    }
    insertSeed.run(userId, nowIso())
    sessionDb.exec('COMMIT')
  } catch (e) {
    sessionDb.exec('ROLLBACK')
    throw e
  }
  logOperation({ userId, type: 'demo_seed', payload: { counts } })
  return { seeded: true, counts }
}

function countByTab(userId) {
  const rows = sessionDb.prepare(
    'SELECT tab_key, COUNT(*) c FROM demo_orders WHERE user_id = ? GROUP BY tab_key'
  ).all(userId)
  const counts = { pending: 0, transit: 0, done: 0, cancelled: 0 }
  for (const r of rows) counts[r.tab_key] = r.c
  return counts
}

export function listDemoOrders(userId) {
  if (!userId) return []
  const rows = sessionDb.prepare(
    'SELECT * FROM demo_orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId)
  return rows.map(publicDemoOrder)
}

export function getDemoOrder(id, userId) {
  const row = userId
    ? sessionDb.prepare('SELECT * FROM demo_orders WHERE id = ? AND user_id = ?').get(id, userId)
    : sessionDb.prepare('SELECT * FROM demo_orders WHERE id = ?').get(id)
  return publicDemoOrder(row)
}

export function getBadges(userId) {
  const counts = countByTab(userId)
  const reads = sessionDb.prepare('SELECT tab_key FROM badge_reads WHERE user_id = ?').all(userId)
  const readSet = new Set(reads.map((r) => r.tab_key))
  const out = {}
  for (const tab of Object.keys(TAB_STATUSES)) {
    const count = counts[tab] || 0
    out[tab] = { count, unread: count > 0 && !readSet.has(tab) }
  }
  return out
}

export function markBadgeSeen(userId, tab) {
  if (!TAB_STATUSES[tab]) return getBadges(userId)
  sessionDb.prepare(
    `INSERT INTO badge_reads (user_id, tab_key, read_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id, tab_key) DO UPDATE SET read_at = excluded.read_at`
  ).run(userId, tab, nowIso())
  logOperation({ userId, type: 'badge_seen', payload: { tab } })
  return getBadges(userId)
}

export { TAB_STATUSES }
