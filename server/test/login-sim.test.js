import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { config } from '../src/config.js'
import { createApp } from '../src/app.js'
import { userSqlitePath } from '../src/db.js'

function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
}

test('simulate devtools login then real phone on the same wechat account', async () => {
  const previous = {
    wxMockLogin: config.wxMockLogin,
    wxAppId: config.wxAppId,
    wxAppSecret: config.wxAppSecret,
    allowDevtoolsLogin: config.allowDevtoolsLogin,
    devtoolsPhone: config.devtoolsPhone,
    fetch: global.fetch
  }
  config.wxMockLogin = false
  config.wxAppId = 'wx-sim'
  config.wxAppSecret = 'sim-secret'
  config.allowDevtoolsLogin = true
  config.devtoolsPhone = '13800138000'

  global.fetch = async (url, opts = {}) => {
    const target = String(url)
    if (target.startsWith('http://127.0.0.1') || target.startsWith('http://localhost')) {
      return previous.fetch(url, opts)
    }
    if (target.includes('jscode2session')) {
      const jsCode = new URL(target).searchParams.get('js_code')
      return { json: async () => ({ openid: 'oid-' + jsCode, session_key: 'sk', unionid: null }) }
    }
    if (target.includes('/cgi-bin/token')) {
      return { json: async () => ({ access_token: 'tok', expires_in: 7200 }) }
    }
    if (target.includes('getuserphonenumber')) {
      const body = JSON.parse(opts.body || '{}')
      if (body.code !== 'phone-code-ok') {
        return { json: async () => ({ errcode: 40029, errmsg: 'invalid code' }) }
      }
      return {
        json: async () => ({ errcode: 0, phone_info: { purePhoneNumber: '13900001111' } })
      }
    }
    throw new Error('unexpected fetch ' + target)
  }

  const app = createApp()
  const s = await listen(app)
  try {
    const { port } = s.address()
    const post = (body) =>
      fetch(`http://127.0.0.1:${port}/auth/wx-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(async (res) => ({ status: res.status, body: await res.json() }))

    const stamp = String(Date.now())
    const codeA = 'wx-user-a-' + stamp
    const codeB = 'wx-user-b-' + stamp
    const denied = await post({ code: codeA })
    assert.equal(denied.status, 400)

    const forwarded = await fetch(`http://127.0.0.1:${port}/auth/wx-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '1.2.3.4' },
      body: JSON.stringify({ code: codeA, devtools: true })
    }).then(async (res) => ({ status: res.status, body: await res.json() }))
    assert.equal(forwarded.status, 400)

    const first = await post({ code: codeA, devtools: true })
    assert.equal(first.status, 200)
    assert.equal(first.body.code, 0)
    assert.equal(first.body.data.user.phone, '13800138000')
    assert.ok(first.body.data.token)
    assert.ok(fs.existsSync(userSqlitePath(first.body.data.user.id)))
    const userId = first.body.data.user.id
    const dbPath = path.resolve(userSqlitePath(userId))

    const again = await post({ code: codeA, devtools: true })
    assert.equal(again.body.data.user.id, userId)
    assert.equal(again.body.data.user.phone, '13800138000')

    const other = await post({ code: codeB, devtools: true })
    assert.notEqual(other.body.data.user.id, userId)

    const phone = await post({ code: codeA, phoneCode: 'phone-code-ok' })
    assert.equal(phone.status, 200)
    assert.equal(phone.body.data.user.id, userId)
    assert.equal(phone.body.data.user.phone, '13900001111')

    const me = await fetch(`http://127.0.0.1:${port}/auth/me`, {
      headers: { Authorization: 'Bearer ' + phone.body.data.token }
    }).then((res) => res.json())
    assert.equal(me.data.user.id, userId)
    assert.equal(me.data.user.phone, '13900001111')
    assert.equal(me.data.needPhone, false)

    console.log(
      JSON.stringify({
        userId,
        simulatorPhone: '13800138000',
        realPhone: '13900001111',
        sameAccount: true,
        dbPath
      })
    )
  } finally {
    config.wxMockLogin = previous.wxMockLogin
    config.wxAppId = previous.wxAppId
    config.wxAppSecret = previous.wxAppSecret
    config.allowDevtoolsLogin = previous.allowDevtoolsLogin
    config.devtoolsPhone = previous.devtoolsPhone
    global.fetch = previous.fetch
    s.close()
  }
})
