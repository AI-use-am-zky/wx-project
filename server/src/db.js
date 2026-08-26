import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'
import { v4 as uuid } from 'uuid'
import { config } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '../data')
fs.mkdirSync(dataDir, { recursive: true })
const dbPath = path.join(dataDir, 'app.sqlite')

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
`)

function seedSettings() {
  const insert = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
  for (const [k, v] of Object.entries(config.defaults)) insert.run(k, String(v))
}

function seedRateCards() {
  const count = db.prepare('SELECT COUNT(*) c FROM rate_cards').get().c
  if (count > 0) return
  const ins = db.prepare('INSERT INTO rate_cards (id, from_city, to_city, min_kg, max_kg, sell_cents) VALUES (?, ?, ?, ?, ?, ?)')
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

export function nowIso() {
  return new Date().toISOString()
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
