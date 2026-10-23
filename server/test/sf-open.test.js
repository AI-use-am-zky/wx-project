import test from 'node:test'
import assert from 'node:assert/strict'
import {
  javaUrlEncode,
  signMsgDigest,
  pickProduct,
  feeToCents,
  buildProductRecommendMsgData,
  buildCreateOrderMsgData,
  extractWaybillNo,
  statusFromSfOpCode
} from '../src/adapters/sf-open.js'

test('javaUrlEncode uppercases percent escapes like Java URLEncoder', () => {
  assert.equal(javaUrlEncode('a b'), 'a+b')
  assert.match(javaUrlEncode('中'), /^%[0-9A-F]{2}/)
})

test('signMsgDigest is Base64(MD5(msg+ts+check)) without URLEncode', () => {
  const msgData = '{"language":"zh-CN","orderId":"QIAO-20200618-004"}'
  const timestamp = '12312334453453'
  const checkWord = 'fjcg5PGKaNpPSHFAZ4QsCOkV71R3zVci'
  const digest = signMsgDigest(msgData, timestamp, checkWord)
  assert.equal(digest, 'OwYXm3XG9fjHK7A+/t7Ckw==')
})

test('pickProduct prefers T11 专享即日 then configured then pet/air', () => {
  const list = [
    { productCode: 'S2', productName: '顺丰标快', productType: '3', totalFee: 50, sortNo: 16 },
    {
      productCode: 'T11',
      productName: '专享即日',
      productDisplayName: '专享即日',
      expressType: '303',
      productType: '3',
      totalFee: 950,
      sortNo: 500
    },
    { productCode: 'SE0141', productName: '顺丰卡航', productType: '6', totalFee: 40, sortNo: 501 }
  ]
  assert.equal(pickProduct(list, ['T11']).productCode, 'T11')
  assert.equal(pickProduct(list, []).productCode, 'T11')
  assert.equal(feeToCents(list[1]), 95000)
})

test('buildProductRecommendMsgData fills required address fields', () => {
  const msg = buildProductRecommendMsgData(
    {
      sender: {
        name: '张三',
        phone: '13800000001',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        detail: '科技园一路1号'
      },
      receiver: {
        name: '李四',
        phone: '13900000002',
        province: '北京市',
        city: '北京市',
        district: '朝阳区',
        detail: '望京街2号'
      },
      weightKg: 5.5,
      species: 'dog',
      breed: '金毛',
      pickupDate: '2026-09-30'
    },
    { monthlyCard: '7551234567' }
  )
  assert.equal(msg.srcProvince, '广东省')
  assert.equal(msg.destCity, '北京市')
  assert.equal(msg.weight, 5.5)
  assert.equal(msg.paymentTerms, '1')
  assert.equal(msg.sendTime, '2026-09-30 10:00:00')
  assert.equal(msg.monthlyCard, '7551234567')
  assert.ok(msg.srcAddress.includes('南山区'))
  assert.ok(msg.commodityNameList[0].includes('活体动物'))
})

test('buildCreateOrderMsgData builds BSP create-order payload', () => {
  const msg = buildCreateOrderMsgData(
    {
      orderId: 'ord-test-1',
      sender: {
        name: '张三',
        phone: '13800000001',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        detail: '科技园一路1号'
      },
      receiver: {
        name: '李四',
        phone: '13900000002',
        province: '北京市',
        city: '北京市',
        district: '朝阳区',
        detail: '望京街2号'
      },
      weightKg: 8,
      species: 'dog',
      breed: '金毛',
      pickupDate: '2026-10-02',
      declaredValueCents: 300000
    },
    { monthlyCard: '7551234567', expressTypeId: 303 }
  )
  assert.equal(msg.orderId, 'ord-test-1')
  assert.equal(msg.expressTypeId, 303)
  assert.equal(msg.payMethod, 1)
  assert.equal(msg.monthlyCard, '7551234567')
  assert.equal(msg.contactInfoList.length, 2)
  assert.equal(msg.contactInfoList[0].contactType, 1)
  assert.equal(msg.contactInfoList[1].contactType, 2)
  assert.equal(msg.serviceList[0].name, 'INSURE')
  assert.equal(msg.serviceList[0].value, '3000')
  assert.ok(msg.cargoDetails[0].name.includes('活体动物'))
  assert.equal(msg.cargoDesc, '活体动物')
  assert.equal(msg.cargoDetails[0].unit, '只')
})

test('buildCreateOrderMsgData keeps normal cargo when cargoName is set', () => {
  const msg = buildCreateOrderMsgData(
    {
      orderId: 'lab-1',
      cargoName: '服装',
      cargoDesc: '服装',
      cargoUnit: '件',
      sender: { name: '甲', phone: '13800001101', province: '江苏省', city: '徐州市', district: '云龙区', detail: '和平路1号' },
      receiver: { name: '乙', phone: '13800001102', province: '江苏省', city: '苏州市', district: '姑苏区', detail: '人民路1号' },
      weightKg: 1
    },
    { expressTypeId: 2 }
  )
  assert.equal(msg.cargoDetails[0].name, '服装')
  assert.equal(msg.cargoDesc, '服装')
  assert.equal(msg.cargoDetails[0].unit, '件')
  assert.equal(msg.expressTypeId, 2)
})

test('extractWaybillNo prefers mother waybill', () => {
  assert.equal(
    extractWaybillNo({
      waybillNoInfoList: [
        { waybillType: 2, waybillNo: 'SF-CHILD' },
        { waybillType: 1, waybillNo: 'SF-MOTHER' }
      ]
    }),
    'SF-MOTHER'
  )
})

test('statusFromSfOpCode maps collect/transit/sign', () => {
  assert.equal(statusFromSfOpCode('50'), 'collected')
  assert.equal(statusFromSfOpCode('44'), 'in_transit')
  assert.equal(statusFromSfOpCode('80'), 'signed')
  assert.equal(statusFromSfOpCode('999'), null)
})
