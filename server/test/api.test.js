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

test('real login requires a phone code', async () => {
  config.wxMockLogin = false
  const app = createApp()
  const s = await listen(app)
  try {
    const { port } = s.address()
    const res = await fetch(`http://127.0.0.1:${port}/auth/wx-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'no-phone' })
    })
    assert.equal(res.status, 400)
  } finally {
    config.wxMockLogin = true
    s.close()
  }
})

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
    assert.ok(login.data.user.phone)
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
    assert.equal(paid.data.status, 'paid')
    assert.equal(paid.data.sfWaybillNo, null)
    const denied = await json(await fetch(`http://127.0.0.1:${port}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nope', password: config.adminPassword })
    }))
    assert.equal(denied.code, 401)
    const admin = await json(await fetch(`http://127.0.0.1:${port}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.adminUser, password: config.adminPassword })
    }))
    assert.equal(admin.code, 0)
    const adminHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin.data.token }
    const listed = await json(await fetch(`http://127.0.0.1:${port}/admin/orders`, { headers: adminHeaders }))
    const mine = (listed.data.list || []).find((item) => item.id === order.data.orderId)
    assert.equal(mine.quoteSource, 'sf')
    assert.ok(mine.sfCostCents > 0)
    const badPwd = await json(await fetch(`http://127.0.0.1:${port}/admin/password`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ currentPassword: 'wrong-pass', newPassword: '123456' })
    }))
    assert.equal(badPwd.code, 400)
    const submitted = await json(await fetch(`http://127.0.0.1:${port}/admin/orders/${order.data.orderId}/waybill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + admin.data.token },
      body: JSON.stringify({ waybillNo: 'SF1000000000001' })
    }))
    assert.equal(submitted.code, 0)
    assert.equal(submitted.data.status, 'booked')
    assert.equal(submitted.data.sfWaybillNo, 'SF1000000000001')
  } finally {
    s.close()
  }
})

test('new users start with an empty order list and separate databases', async () => {
  const app = createApp()
  const s = await listen(app)
  try {
    const { port } = s.address()
    const login = async (code) => json(await fetch(`http://127.0.0.1:${port}/auth/wx-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    }))
    const a = await login('user-a-' + Date.now())
    const b = await login('user-b-' + Date.now())
    assert.equal(a.code, 0)
    assert.equal(b.code, 0)
    assert.notEqual(a.data.user.id, b.data.user.id)
    assert.equal(a.data.dbPath, `users/${a.data.user.id}.sqlite`)
    assert.equal(b.data.dbPath, `users/${b.data.user.id}.sqlite`)
    const orders = await json(await fetch(`http://127.0.0.1:${port}/orders`, {
      headers: { Authorization: 'Bearer ' + a.data.token }
    }))
    assert.equal(orders.code, 0)
    assert.deepEqual(orders.data.list, [])
    const badges = await json(await fetch(`http://127.0.0.1:${port}/session/badges`, {
      headers: { Authorization: 'Bearer ' + a.data.token }
    }))
    for (const tab of ['pending', 'transit', 'done', 'cancelled']) {
      assert.equal(badges.data[tab].count, 0)
    }
  } finally {
    s.close()
  }
})
