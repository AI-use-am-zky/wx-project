import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('data/app.sqlite')
console.log('tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name).join(', '))
console.table(db.prepare('SELECT openid, phone, nick_name, avatar_url, created_at FROM users ORDER BY created_at').all())
