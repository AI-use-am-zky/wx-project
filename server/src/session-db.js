import { v4 as uuid } from 'uuid'
import { db, getUserDb, usersDir } from './db.js'
import fs from 'fs'
import path from 'path'

function nowIso() {
  return new Date().toISOString()
}

const TAB_STATUSES = {
  pending: ['pending_pay'],
  transit: ['booked', 'collected', 'in_transit'],
  done: ['signed'],
  cancelled: ['cancelled', 'refunded']
}

export function logOperation({ userId, type, payload }) {
  if (!userId) return
  const udb = getUserDb(userId)
  udb.prepare(
    'INSERT INTO operations (id, user_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(uuid(), userId, type, payload ? JSON.stringify(payload) : null, nowIso())
}

export function listOperations(userId, limit = 100) {
  if (userId) {
    const rows = getUserDb(userId)
      .prepare('SELECT * FROM operations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit)
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      payload: r.payload_json ? JSON.parse(r.payload_json) : null,
      createdAt: r.created_at
    }))
  }
  const out = []
  for (const u of db.prepare('SELECT id FROM users').all()) {
    try {
      const rows = getUserDb(u.id)
        .prepare('SELECT * FROM operations ORDER BY created_at DESC LIMIT ?')
        .all(limit)
      for (const r of rows) {
        out.push({
          id: r.id,
          userId: r.user_id,
          type: r.type,
          payload: r.payload_json ? JSON.parse(r.payload_json) : null,
          createdAt: r.created_at
        })
      }
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit)
}

function countByTab(userId) {
  const counts = { pending: 0, transit: 0, done: 0, cancelled: 0 }
  const rows = getUserDb(userId)
    .prepare('SELECT status, COUNT(*) c FROM orders WHERE user_id = ? GROUP BY status')
    .all(userId)
  for (const row of rows) {
    for (const [tab, statuses] of Object.entries(TAB_STATUSES)) {
      if (statuses.includes(row.status)) counts[tab] += row.c
    }
  }
  return counts
}

export function getBadges(userId) {
  const counts = countByTab(userId)
  const reads = getUserDb(userId).prepare('SELECT tab_key FROM badge_reads WHERE user_id = ?').all(userId)
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
  getUserDb(userId)
    .prepare(
      `INSERT INTO badge_reads (user_id, tab_key, read_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, tab_key) DO UPDATE SET read_at = excluded.read_at`
    )
    .run(userId, tab, nowIso())
  logOperation({ userId, type: 'badge_seen', payload: { tab } })
  return getBadges(userId)
}

export function listUserDbFiles() {
  if (!fs.existsSync(usersDir)) return []
  return fs
    .readdirSync(usersDir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({
      file: f,
      userId: f.replace(/\.sqlite$/, ''),
      path: path.join('users', f).replace(/\\/g, '/')
    }))
}

export { TAB_STATUSES }
