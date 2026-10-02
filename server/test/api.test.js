import test from 'node:test'
import assert from 'node:assert/strict'
import { config } from '../src/config.js'
import { createApp } from '../src/app.js'

// 单测强制 mock，避免依赖真实微信密钥 / 顺丰生产接口
config.wxMockLogin = true
config.payMock = true
config.sfMock = true


function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
}

async function json(res) {
  const data = await res.json()
  return data
}

test('quotes require login', async () => {
  const app = createApp()
  const s = await listen(app)
  try {
    const { port } = s.address()
    const res = await fetch(`http://127.0.0.1:${port}/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(res.status, 401)
  } finally {
    s.close()
  }
})

test('quote rejects incomplete address', async () => {
  const app = createApp()
  const s = await listen(app)
  try {
    const { port } = s.address()
    const login = await fetch(`http://127.0.0.1:${port}/auth/wx-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'test-code-1' })
    })
    const { data } = await json(login)
    const res = await fetch(`http://127.0.0.1:${port}/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + data.token },
      body: JSON.stringify({
        sender: { name: 'a', phone: '1', province: '京', city: '北京', district: '', detail: '' },
        receiver: { name: 'b', phone: '2', province: '沪', city: '上海', district: '黄浦', detail: '南京路1号' },
        species: 'cat',
        breed: '英短',
        weightKg: 4,
        pickupDate: '2026-09-01'
      })
    })
    assert.equal(res.status, 400)
  } finally {
    s.close()
  }
})

test('happy quote and mock pay', async () => {
  const app = createApp()
  const s = await listen(app)
  try {
    const { port } = s.address()
    const login = await json(await fetch(`http://127.0.0.1:${port}/auth/wx-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'test-code-2' })
    }))
    const token = login.data.token
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
    const addr = {
      name: '张三',
      phone: '13800138000',
      province: '北京市',
      city: '北京',
      district: '朝阳区',
      detail: '某小区1号楼'
    }
    const addr2 = { ...addr, name: '李四', city: '上海', province: '上海市', district: '浦东新区', detail: '某路2号' }
    const q = await json(await fetch(`http://127.0.0.1:${port}/quotes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sender: addr, receiver: addr2, species: 'cat', breed: '英短', weightKg: 4, pickupDate: '2026-09-01' })
    }))
    assert.equal(q.code, 0)
    assert.ok(q.data.sellFreightCents > 0)
    const order = await json(await fetch(`http://127.0.0.1:${port}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        quoteId: q.data.id,
        agreementVersion: 'v1',
        petPhotos: ['p1'],
        crateMode: 'own',
        cratePhotos: ['c1'],
        quarantineMode: 'self',
        quarantinePhotos: ['q1'],
        insure: false
      })
    }))
    assert.equal(order.code, 0)
    const paid = await json(await fetch(`http://127.0.0.1:${port}/orders/${order.data.orderId}/mock-pay`, { method: 'POST', headers }))
    assert.equal(paid.code, 0)
    assert.ok(['booked', 'sf_failed'].includes(paid.data.status))
  } finally {
    s.close()
  }
})

test('demo orders seed badges and session ops', async () => {
  const app = createApp()
  const s = await listen(app)
  try {
    const { port } = s.address()
    const login = await json(await fetch(`http://127.0.0.1:${port}/auth/wx-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'demo-seed-' + Date.now() })
    }))
    const token = login.data.token
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    const badges = await json(await fetch(`http://127.0.0.1:${port}/session/badges`, { headers }))
    assert.equal(badges.code, 0)
    for (const tab of ['pending', 'transit', 'done', 'cancelled']) {
      assert.ok(badges.data[tab].count >= 1 && badges.data[tab].count <= 5)
      assert.equal(badges.data[tab].unread, true)
    }
    const orders = await json(await fetch(`http://127.0.0.1:${port}/orders`, { headers }))
    assert.ok(orders.data.list.length >= 4)
    const first = orders.data.list[0]
    const detail = await json(await fetch(`http://127.0.0.1:${port}/orders/${first.id}`, { headers }))
    assert.equal(detail.code, 0)
    assert.equal(detail.data.demo, true)
    const seen = await json(await fetch(`http://127.0.0.1:${port}/session/badges/seen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tab: 'pending' })
    }))
    assert.equal(seen.data.pending.unread, false)
    const ops = await json(await fetch(`http://127.0.0.1:${port}/session/ops`, { headers }))
    assert.ok(ops.data.list.some((o) => o.type === 'badge_seen'))
  } finally {
    s.close()
  }
})
