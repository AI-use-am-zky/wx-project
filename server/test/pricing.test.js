import test from 'node:test'
import assert from 'node:assert/strict'
import { priceFromSfCost, priceFromRateCard, applyVipDiscount, surchargeFromReweigh, refundAmount } from '../src/domain/pricing.js'
import { canIssueInvoice, isCollectedOrAfter } from '../src/domain/order-machine.js'

test('sf markup uses max of percent and min fee', () => {
  const p = priceFromSfCost(100000, 0.15, 15000)
  assert.equal(p.serviceFeeCents, 15000)
  assert.equal(p.sellFreightCents, 115000)
  assert.equal(p.quoteSource, 'sf')
})

test('rate card sell price has zero service line', () => {
  const p = priceFromRateCard(88000)
  assert.equal(p.serviceFeeCents, 0)
  assert.equal(p.totalCents, 88000)
  assert.equal(p.quoteSource, 'rate_card')
})

test('vip discount reduces customer freight and keeps sf cost', () => {
  const base = priceFromSfCost(100000, 0.15, 15000)
  const vip = applyVipDiscount(base, 0.1)
  assert.equal(vip.vip, true)
  assert.equal(vip.sfCostCents, 100000)
  assert.equal(vip.sellFreightCents, 103500)
  assert.equal(vip.serviceFeeCents, 3500)
  const plain = applyVipDiscount(base, 0)
  assert.equal(plain.vip, false)
  assert.equal(plain.sellFreightCents, 115000)
})

test('reweigh ignores 0.9kg', () => {
  const r = surchargeFromReweigh({ declaredKg: 5, actualKg: 5.9, sellFreightCents: 50000, ignoreKg: 1 })
  assert.equal(r.ignored, true)
})

test('reweigh 1.1kg requires surcharge', () => {
  const r = surchargeFromReweigh({ declaredKg: 5, actualKg: 6.1, sellFreightCents: 50000, ignoreKg: 1 })
  assert.equal(r.ignored, false)
  assert.ok(r.surchargeCents >= 100)
})

test('refund full without waybill', () => {
  const r = refundAmount({ paidCents: 10000, hasWaybill: false, collected: false, cancelFeeCents: 5000 })
  assert.equal(r.refundCents, 10000)
})

test('refund deducts fee with waybill not collected', () => {
  const r = refundAmount({ paidCents: 10000, hasWaybill: true, collected: false, cancelFeeCents: 5000 })
  assert.equal(r.refundCents, 5000)
})

test('no self refund after collect', () => {
  const r = refundAmount({ paidCents: 10000, hasWaybill: true, collected: true, cancelFeeCents: 5000 })
  assert.equal(r.allowed, false)
})

test('invoice only after signed', () => {
  assert.equal(canIssueInvoice('signed', 'booked'), true)
  assert.equal(canIssueInvoice('booked', 'booked'), false)
  assert.equal(isCollectedOrAfter('in_transit'), true)
})
