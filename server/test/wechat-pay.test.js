import test from 'node:test'
import assert from 'node:assert/strict'
import {
  signWxPayV2,
  objectToXml,
  xmlToObject,
  orderIdToOutTradeNo,
  outTradeNoToOrderId
} from '../src/adapters/wechat.js'

test('wx pay v2 sign is stable MD5 upper', () => {
  const sign = signWxPayV2(
    { appid: 'wx123', mch_id: '190000', nonce_str: 'abc', body: 'test' },
    '192006250b4c09247ec02edce69f6a2d'
  )
  assert.equal(sign.length, 32)
  assert.equal(sign, sign.toUpperCase())
})

test('xml roundtrip and order id mapping', () => {
  const id = '3c2fdf01-4456-442b-9df9-9cac01ab79f6'
  const out = orderIdToOutTradeNo(id)
  assert.equal(out.length, 32)
  assert.equal(outTradeNoToOrderId(out), id)
  const xml = objectToXml({ return_code: 'SUCCESS', out_trade_no: out })
  const obj = xmlToObject(xml)
  assert.equal(obj.return_code, 'SUCCESS')
  assert.equal(obj.out_trade_no, out)
})
