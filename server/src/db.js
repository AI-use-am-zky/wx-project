import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { v4 as uuid } from 'uuid'
import { config } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const dataDir = path.join(__dirname, '../data')
export const usersDir = path.join(dataDir, 'users')
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(usersDir, { recursive: true })

const dbPath = path.join(dataDir, 'app.sqlite')

/** 全局库：账号、会话、价表、跨用户索引 */
export const db = new DatabaseSync(dbPath)
db.exec('PRAGMA journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  openid TEXT UNIQUE NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_cards (
  id TEXT PRIMARY KEY,
  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  min_kg REAL NOT NULL,
  max_kg REAL NOT NULL,
  sell_cents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crate_skus (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size_hint TEXT NOT NULL,
  price_cents INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS resource_index (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS idx_resource_user ON resource_index(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_resource_kind ON resource_index(kind, created_at DESC);
`)

for (const col of ['session_key', 'unionid', 'nick_name', 'avatar_url', 'db_path']) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`)
  } catch {
    /* exists */
  }
}

/** 旧版全局业务表：仅用于一次性迁移到用户库 */
db.exec(`
CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, role_hint TEXT,
  name TEXT NOT NULL, phone TEXT NOT NULL, province TEXT NOT NULL, city TEXT NOT NULL,
  district TEXT NOT NULL, detail TEXT NOT NULL, lat REAL, lng REAL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload_json TEXT NOT NULL,
  sf_cost_cents INTEGER, sell_freight_cents INTEGER NOT NULL, service_fee_cents INTEGER NOT NULL,
  quote_source TEXT NOT NULL, expires_at TEXT NOT NULL, raw_sf_json TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, quote_id TEXT, status TEXT NOT NULL,
  prev_transport_status TEXT, payload_json TEXT NOT NULL, paid_cents INTEGER NOT NULL DEFAULT 0,
  surcharge_cents INTEGER NOT NULL DEFAULT 0, surcharge_paid INTEGER NOT NULL DEFAULT 0,
  declared_weight_kg REAL, actual_weight_kg REAL, sf_waybill_no TEXT, sf_order_id TEXT, sf_error TEXT,
  invoice_title TEXT, invoice_tax_no TEXT, invoice_email TEXT, invoice_status TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL,
  at TEXT NOT NULL, extra_json TEXT
);
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY, user_id TEXT, filename TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, species TEXT, breed TEXT,
  weight_kg REAL, gender TEXT, note TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quarantine_docs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, file_id TEXT, created_at TEXT NOT NULL
);
`)

const USER_SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  user_id TEXT PRIMARY KEY,
  openid TEXT,
  phone TEXT,
  nick_name TEXT,
  avatar_url TEXT,
  unionid TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_hint TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  province TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  detail TEXT NOT NULL,
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  sf_cost_cents INTEGER,
  sell_freight_cents INTEGER NOT NULL,
  service_fee_cents INTEGER NOT NULL,
  quote_source TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  raw_sf_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  quote_id TEXT,
  status TEXT NOT NULL,
  prev_transport_status TEXT,
  payload_json TEXT NOT NULL,
  paid_cents INTEGER NOT NULL DEFAULT 0,
  surcharge_cents INTEGER NOT NULL DEFAULT 0,
  surcharge_paid INTEGER NOT NULL DEFAULT 0,
  declared_weight_kg REAL,
  actual_weight_kg REAL,
  sf_waybill_no TEXT,
  sf_order_id TEXT,
  sf_error TEXT,
  invoice_title TEXT,
  invoice_tax_no TEXT,
  invoice_email TEXT,
  invoice_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL,
  extra_json TEXT
);
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  species TEXT,
  breed TEXT,
  weight_kg REAL,
  gender TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quarantine_docs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  file_id TEXT,
  created_at TEXT NOT NULL
);
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
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

const userDbCache = new Map()

export function nowIso() {
  return new Date().toISOString()
}

export function userSqlitePath(userId) {
  return path.join(usersDir, `${userId}.sqlite`)
}

function initUserSchema(udb) {
  udb.exec(USER_SCHEMA)
}

export function getUserDb(userId) {
  if (!userId) throw new Error('缺少 userId')
  let udb = userDbCache.get(userId)
  if (udb) return udb
  const p = userSqlitePath(userId)
  const existed = fs.existsSync(p)
  udb = new DatabaseSync(p)
  udb.exec('PRAGMA journal_mode = WAL')
  initUserSchema(udb)
  userDbCache.set(userId, udb)
  if (!existed) {
    udb.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('created_at', nowIso())
  }
  return udb
}

export function indexResource(kind, id, userId) {
  db.prepare(
    `INSERT INTO resource_index (kind, id, user_id, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(kind, id) DO UPDATE SET user_id = excluded.user_id`
  ).run(kind, id, userId, nowIso())
}

export function ownerOf(kind, id) {
  const row = db.prepare('SELECT user_id FROM resource_index WHERE kind = ? AND id = ?').get(kind, id)
  return row ? row.user_id : null
}

export function dbForResource(kind, id) {
  const userId = ownerOf(kind, id)
  if (!userId) return null
  return { userId, udb: getUserDb(userId) }
}

export function syncUserProfile(user) {
  if (!user || !user.id) return
  const udb = getUserDb(user.id)
  const now = nowIso()
  udb.prepare(
    `INSERT INTO profile (user_id, openid, phone, nick_name, avatar_url, unionid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       openid = excluded.openid,
       phone = excluded.phone,
       nick_name = excluded.nick_name,
       avatar_url = excluded.avatar_url,
       unionid = excluded.unionid,
       updated_at = excluded.updated_at`
  ).run(
    user.id,
    user.openid || null,
    user.phone || null,
    user.nick_name || null,
    user.avatar_url || null,
    user.unionid || null,
    user.created_at || now,
    now
  )
}

function migrateLegacySessionDb(udb, userId) {
  const sessionPath = path.join(dataDir, 'session.sqlite')
  if (!fs.existsSync(sessionPath)) return
  let sdb
  try {
    sdb = new DatabaseSync(sessionPath)
  } catch {
    return
  }
  try {
    for (const r of sdb.prepare('SELECT * FROM demo_orders WHERE user_id = ?').all(userId)) {
      udb.prepare(
        `INSERT OR IGNORE INTO demo_orders (id, user_id, tab_key, status, payload_json, paid_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(r.id, r.user_id, r.tab_key, r.status, r.payload_json, r.paid_cents, r.created_at, r.updated_at)
    }
    for (const r of sdb.prepare('SELECT * FROM badge_reads WHERE user_id = ?').all(userId)) {
      udb.prepare('INSERT OR IGNORE INTO badge_reads (user_id, tab_key, read_at) VALUES (?, ?, ?)').run(
        r.user_id,
        r.tab_key,
        r.read_at
      )
    }
    for (const r of sdb.prepare('SELECT * FROM operations WHERE user_id = ?').all(userId)) {
      udb.prepare(
        'INSERT OR IGNORE INTO operations (id, user_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(r.id, r.user_id, r.type, r.payload_json, r.created_at)
    }
    for (const r of sdb.prepare('SELECT * FROM demo_seed WHERE user_id = ?').all(userId)) {
      udb.prepare('INSERT OR IGNORE INTO demo_seed (user_id, seeded_at) VALUES (?, ?)').run(r.user_id, r.seeded_at)
    }
  } finally {
    try {
      sdb.close()
    } catch {
      /* ignore */
    }
  }
}

function migrateFromGlobal(udb, userId) {
  const done = udb.prepare('SELECT value FROM meta WHERE key = ?').get('migrated_from_global')
  if (done) return

  for (const r of db.prepare('SELECT * FROM addresses WHERE user_id = ?').all(userId)) {
    udb.prepare(
      `INSERT OR IGNORE INTO addresses (id, user_id, role_hint, name, phone, province, city, district, detail, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(r.id, r.user_id, r.role_hint, r.name, r.phone, r.province, r.city, r.district, r.detail, r.lat, r.lng, r.created_at)
  }
  for (const r of db.prepare('SELECT * FROM quotes WHERE user_id = ?').all(userId)) {
    udb.prepare(
      `INSERT OR IGNORE INTO quotes (id, user_id, payload_json, sf_cost_cents, sell_freight_cents, service_fee_cents, quote_source, expires_at, raw_sf_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      r.id,
      r.user_id,
      r.payload_json,
      r.sf_cost_cents,
      r.sell_freight_cents,
      r.service_fee_cents,
      r.quote_source,
      r.expires_at,
      r.raw_sf_json,
      r.created_at
    )
    indexResource('quote', r.id, userId)
  }
  for (const r of db.prepare('SELECT * FROM orders WHERE user_id = ?').all(userId)) {
    udb.prepare(
      `INSERT OR IGNORE INTO orders (id, user_id, quote_id, status, prev_transport_status, payload_json, paid_cents, surcharge_cents, surcharge_paid, declared_weight_kg, actual_weight_kg, sf_waybill_no, sf_order_id, sf_error, invoice_title, invoice_tax_no, invoice_email, invoice_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      r.id,
      r.user_id,
      r.quote_id,
      r.status,
      r.prev_transport_status,
      r.payload_json,
      r.paid_cents,
      r.surcharge_cents,
      r.surcharge_paid,
      r.declared_weight_kg,
      r.actual_weight_kg,
      r.sf_waybill_no,
      r.sf_order_id,
      r.sf_error,
      r.invoice_title,
      r.invoice_tax_no,
      r.invoice_email,
      r.invoice_status,
      r.created_at,
      r.updated_at
    )
    indexResource('order', r.id, userId)
    for (const e of db.prepare('SELECT * FROM order_events WHERE order_id = ?').all(r.id)) {
      udb.prepare(
        'INSERT OR IGNORE INTO order_events (id, order_id, type, text, at, extra_json) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(e.id, e.order_id, e.type, e.text, e.at, e.extra_json)
    }
  }
  for (const r of db.prepare('SELECT * FROM uploads WHERE user_id = ?').all(userId)) {
    udb.prepare('INSERT OR IGNORE INTO uploads (id, user_id, filename, created_at) VALUES (?, ?, ?, ?)').run(
      r.id,
      r.user_id,
      r.filename,
      r.created_at
    )
  }
  for (const r of db.prepare('SELECT * FROM pets WHERE user_id = ?').all(userId)) {
    udb.prepare(
      `INSERT OR IGNORE INTO pets (id, user_id, name, species, breed, weight_kg, gender, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(r.id, r.user_id, r.name, r.species, r.breed, r.weight_kg, r.gender, r.note, r.created_at)
  }
  for (const r of db.prepare('SELECT * FROM quarantine_docs WHERE user_id = ?').all(userId)) {
    udb.prepare(
      'INSERT OR IGNORE INTO quarantine_docs (id, user_id, title, file_id, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(r.id, r.user_id, r.title, r.file_id, r.created_at)
  }

  migrateLegacySessionDb(udb, userId)
  udb.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('migrated_from_global', nowIso())
}

/**
 * 登录后调用：创建/打开该用户专属库，同步资料并迁移旧数据。
 */
export function ensureUserDb(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  if (!user) throw new Error('用户不存在')
  const udb = getUserDb(userId)
  syncUserProfile(user)
  migrateFromGlobal(udb, userId)
  const rel = path.join('users', `${userId}.sqlite`).replace(/\\/g, '/')
  db.prepare('UPDATE users SET db_path = ? WHERE id = ?').run(rel, userId)
  return { path: rel, absolute: userSqlitePath(userId), udb }
}

export function listOrderIndex(status) {
  const ids = db.prepare(`SELECT id, user_id FROM resource_index WHERE kind = 'order' ORDER BY created_at DESC`).all()
  if (!status) return ids
  const out = []
  for (const row of ids) {
    const o = getUserDb(row.user_id).prepare('SELECT id, status FROM orders WHERE id = ?').get(row.id)
    if (o && o.status === status) out.push({ id: o.id, user_id: row.user_id })
  }
  return out
}

function seedSettings() {
  const insert = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(config.defaults)) insert.run(k, String(v))
}

function seedRateCards() {
  const count = db.prepare('SELECT COUNT(*) c FROM rate_cards').get().c
  if (count > 0) return
  const ins = db.prepare(
    'INSERT INTO rate_cards (id, from_city, to_city, min_kg, max_kg, sell_cents) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const cities = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '西安']
  for (const a of cities) {
    for (const b of cities) {
      if (a === b) continue
      ins.run(uuid(), a, b, 0, 8, 68000)
      ins.run(uuid(), a, b, 8, 20, 98000)
      ins.run(uuid(), a, b, 20, 999, 158000)
    }
  }
}

function seedCrates() {
  const count = db.prepare('SELECT COUNT(*) c FROM crate_skus').get().c
  if (count > 0) return
  const ins = db.prepare('INSERT INTO crate_skus (id, name, size_hint, price_cents) VALUES (?, ?, ?, ?)')
  ins.run('crate-s', '航空箱 S', '适合小型猫狗', 18000)
  ins.run('crate-m', '航空箱 M', '适合中型犬', 28000)
  ins.run('crate-l', '航空箱 L', '适合大型犬（以顺丰限规为准）', 42000)
}

seedSettings()
seedRateCards()
seedCrates()

try {
  for (const u of db.prepare('SELECT id FROM users').all()) {
    ensureUserDb(u.id)
  }
} catch (e) {
  console.warn('[db] ensure existing user dbs:', e.message)
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
  return row ? row.value : config.defaults[key]
}

export function settingsMap() {
  const rows = db.prepare('SELECT key, value FROM app_settings').all()
  const m = { ...config.defaults }
  for (const r of rows) m[r.key] = r.value
  return m
}

export { uuid }
