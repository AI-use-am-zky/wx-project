import { db, uuid, nowIso, getSetting } from './db.js'
import { priceFromSfCost, priceFromRateCard, surchargeFromReweigh, refundAmount } from './domain/pricing.js'
import { STATUS, isCollectedOrAfter, canIssueInvoice, transportStatusAfterSurcharge } from './domain/order-machine.js'
import { validAddress, requireFields, BREEDS, ADDON_QUARANTINE_CENTS, insureFeeCents } from './http.js'

export function lookupRateCard(fromCity, toCity, weightKg) {
  const row = db.prepare(
    `SELECT * FROM rate_cards WHERE from_city = ? AND to_city = ? AND min_kg <= ? AND max_kg > ? ORDER BY min_kg DESC LIMIT 1`
  ).get(fromCity, toCity, weightKg, weightKg)
  if (row) return row.sell_cents
  const any = db.prepare('SELECT sell_cents FROM rate_cards ORDER BY sell_cents DESC LIMIT 1').get()
  return any ? any.sell_cents : 88000
}

export function addEvent(orderId, type, text, extra) {
  db.prepare(
    'INSERT INTO order_events (id, order_id, type, text, at, extra_json) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuid(), orderId, type, text, nowIso(), extra ? JSON.stringify(extra) : null)
}

export function getEvents(orderId) {
  return db.prepare('SELECT type, text, at, extra_json FROM order_events WHERE order_id = ? ORDER BY at DESC').all(orderId)
    .map((e) => ({ type: e.type, text: e.text, at: e.at, extra: e.extra_json ? JSON.parse(e.extra_json) : null }))
}

export async function createQuote({ userId, sender, receiver, species, breed, weightKg, pickupDate, petName, petNote, sf }) {
  if (!validAddress(sender) || !validAddress(receiver)) {
    const err = new Error('寄件和收件地址须填写到门牌')
    err.status = 400
    throw err
  }
  requireFields({ species, breed, pickupDate }, ['species', 'breed', 'pickupDate'])
  const kg = Number(weightKg)
  if (!(kg > 0)) {
    const err = new Error('体重须大于 0')
    err.status = 400
    throw err
  }
  const markup = Number(getSetting('markup_rate'))
  const minFee = Number(getSetting('min_service_fee_cents'))
  let priced
  let rawSf = null
  try {
    const q = await sf.quotePetAir({
      fromCity: sender.city,
      toCity: receiver.city,
      weightKg: kg,
      species,
      breed
    })
    priced = priceFromSfCost(q.costCents, markup, minFee)
    rawSf = q.raw
  } catch {
    priced = priceFromRateCard(lookupRateCard(sender.city, receiver.city, kg))
  }
  const id = uuid()
  const expires = new Date(Date.now() + 25 * 60 * 1000).toISOString()
  const payload = { sender, receiver, species, breed, weightKg: kg, pickupDate, petName: petName || '', petNote: petNote || '' }
  db.prepare(
    `INSERT INTO quotes (id, user_id, payload_json, sf_cost_cents, sell_freight_cents, service_fee_cents, quote_source, expires_at, raw_sf_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    JSON.stringify(payload),
    priced.sfCostCents,
    priced.sellFreightCents,
    priced.serviceFeeCents,
    priced.quoteSource,
    expires,
    rawSf ? JSON.stringify(rawSf) : null,
    nowIso()
  )
  return publicQuote(id)
}

export function publicQuote(id) {
  const q = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id)
  if (!q) return null
  const payload = JSON.parse(q.payload_json)
  return {
    id: q.id,
    ...payload,
    sfCostCents: q.sf_cost_cents,
    sellFreightCents: q.sell_freight_cents,
    serviceFeeCents: q.service_fee_cents,
    quoteSource: q.quote_source,
    expiresAt: q.expires_at,
    doorToDoor: true,
    lines: quoteLines(q)
  }
}

function quoteLines(q) {
  const lines = [{ key: 'air_dtd', name: '空运门到门', cents: q.sell_freight_cents }]
  if (q.quote_source === 'sf' && q.service_fee_cents > 0) {
    lines.push({ key: 'service', name: '服务费（含加价）', cents: q.service_fee_cents, note: '已计入上行售价' })
  }
  return lines
}

export function computeAddons({ crateMode, crateSkuId, quarantineMode, insure, declaredValueCents }) {
  let crateCents = 0
  let crate = null
  if (crateMode === 'buy') {
    crate = db.prepare('SELECT * FROM crate_skus WHERE id = ?').get(crateSkuId)
    if (!crate) {
      const err = new Error('请选择航空箱型号')
      err.status = 400
      throw err
    }
    crateCents = crate.price_cents
  }
  const quarantineCents = quarantineMode === 'agency' ? ADDON_QUARANTINE_CENTS : 0
  const insureCents = insure ? insureFeeCents(declaredValueCents) : 0
  return { crateCents, crate, quarantineCents, insureCents }
}

export function validateFulfillment(body) {
  const petPhotos = body.petPhotos || []
  if (!petPhotos.length) {
    const err = new Error('请上传至少一张宠物近照')
    err.status = 400
    throw err
  }
  const crateMode = body.crateMode === 'buy' ? 'buy' : 'own'
  if (crateMode === 'own' && !(body.cratePhotos || []).length) {
    const err = new Error('自备航空箱须上传箱照')
    err.status = 400
    throw err
  }
  if (crateMode === 'buy' && !body.crateSkuId) {
    const err = new Error('请选择要购买的航空箱')
    err.status = 400
    throw err
  }
  const quarantineMode = body.quarantineMode === 'agency' ? 'agency' : 'self'
  if (quarantineMode === 'self' && !(body.quarantinePhotos || []).length) {
    const err = new Error('请上传检疫证明')
    err.status = 400
    throw err
  }
  if (quarantineMode === 'agency') {
    const a = body.agency || {}
    requireFields(a, ['name', 'phone', 'petName'])
  }
  if (body.insure && !(Number(body.declaredValueCents) > 0)) {
    const err = new Error('保价须填写声明价值')
    err.status = 400
    throw err
  }
}

export async function createOrder({ userId, body, sf, wechat, notify }) {
  requireFields(body, ['quoteId', 'agreementVersion'])
  const version = getSetting('transport_agreement_version')
  if (body.agreementVersion !== version) {
    const err = new Error('请同意最新运输协议')
    err.status = 400
    throw err
  }
  const q = db.prepare('SELECT * FROM quotes WHERE id = ? AND user_id = ?').get(body.quoteId, userId)
  if (!q) {
    const err = new Error('报价不存在')
    err.status = 404
    throw err
  }
  if (new Date(q.expires_at).getTime() < Date.now()) {
    const err = new Error('报价已过期，请重新估价')
    err.status = 400
    throw err
  }
  validateFulfillment(body)
  const addons = computeAddons(body)
  const freight = q.sell_freight_cents
  const addonsTotal = addons.crateCents + addons.quarantineCents + addons.insureCents
  const paidCents = freight + addonsTotal
  const quotePayload = JSON.parse(q.payload_json)
  const orderId = uuid()
  const payload = {
    ...quotePayload,
    crateMode: body.crateMode === 'buy' ? 'buy' : 'own',
    crateSkuId: body.crateSkuId || null,
    quarantineMode: body.quarantineMode === 'agency' ? 'agency' : 'self',
    agency: body.agency || null,
    insure: Boolean(body.insure),
    declaredValueCents: body.insure ? Number(body.declaredValueCents) : 0,
    petPhotos: body.petPhotos,
    cratePhotos: body.cratePhotos || [],
    quarantinePhotos: body.quarantinePhotos || [],
    addons,
    lines: [
      { key: 'air_dtd', name: '空运门到门', cents: freight },
      ...(addons.crateCents ? [{ key: 'crate', name: '航空箱（买断）', cents: addons.crateCents }] : []),
      ...(addons.quarantineCents ? [{ key: 'quarantine', name: '代办检疫', cents: addons.quarantineCents }] : []),
      ...(addons.insureCents ? [{ key: 'insure', name: '顺丰保价', cents: addons.insureCents }] : [])
    ]
  }
  db.prepare(
    `INSERT INTO orders (id, user_id, quote_id, status, payload_json, paid_cents, declared_weight_kg, invoice_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(orderId, userId, q.id, STATUS.PENDING_PAY, JSON.stringify(payload), paidCents, quotePayload.weightKg, 'draft', nowIso(), nowIso())
  addEvent(orderId, 'created', '订单已创建，待支付')
  const payParams = wechat.mockPayParams(orderId)
  return { orderId, paidCents, payParams, payMock: true }
}

export function getOrder(id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
  if (!o) return null
  return decorateOrder(o)
}

function decorateOrder(o) {
  const payload = JSON.parse(o.payload_json)
  return {
    id: o.id,
    status: o.status,
    paidCents: o.paid_cents,
    surchargeCents: o.surcharge_cents,
    surchargePaid: Boolean(o.surcharge_paid),
    declaredWeightKg: o.declared_weight_kg,
    actualWeightKg: o.actual_weight_kg,
    sfWaybillNo: o.sf_waybill_no,
    sfOrderId: o.sf_order_id,
    sfError: o.sf_error,
    invoiceTitle: o.invoice_title,
    invoiceTaxNo: o.invoice_tax_no,
    invoiceEmail: o.invoice_email,
    invoiceStatus: o.invoice_status,
    prev_transport_status: o.prev_transport_status,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    ...payload,
    timeline: getEvents(o.id)
  }
}

export async function markPaidAndSubmitSf({ orderId, sf, notify }) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
  if (!o) return
  if (o.status !== STATUS.PENDING_PAY && o.status !== STATUS.PAID) return
  const payload = JSON.parse(o.payload_json)
  db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(STATUS.SF_SUBMITTING, nowIso(), orderId)
  addEvent(orderId, 'paid', '支付成功')
  notify.send('order.paid', { orderId, summary: '新单已支付' })
  try {
    const created = await sf.createOrder({
      sender: payload.sender,
      receiver: payload.receiver,
      species: payload.species,
      breed: payload.breed,
      weightKg: payload.weightKg,
      pickupDate: payload.pickupDate,
      declaredValueCents: payload.declaredValueCents
    })
    db.prepare(
      'UPDATE orders SET status = ?, sf_waybill_no = ?, sf_order_id = ?, sf_error = NULL, updated_at = ? WHERE id = ?'
    ).run(STATUS.BOOKED, created.waybillNo, created.sfOrderId, nowIso(), orderId)
    addEvent(orderId, 'sf_ok', `顺丰已下单，运单号 ${created.waybillNo}`)
    addEvent(orderId, 'pickup_scheduled', `已预约上门取件日 ${payload.pickupDate}，具体时段由顺丰安排`)
  } catch (e) {
    db.prepare('UPDATE orders SET status = ?, sf_error = ?, updated_at = ? WHERE id = ?').run(
      STATUS.SF_FAILED,
      e.message || 'sf error',
      nowIso(),
      orderId
    )
    addEvent(orderId, 'sf_fail', '顺丰下单失败，已转人工处理，不会自动退款')
    notify.send('order.sf_failed', { orderId, summary: e.message || '下单失败' })
  }
}

export async function cancelOrder({ order, sf, wechat }) {
  if (isCollectedOrAfter(order.status)) {
    const err = new Error('已揽收不可自助退款，请走改期流程')
    err.status = 400
    throw err
  }
  if (order.status === STATUS.PENDING_PAY) {
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.CANCELLED, nowIso(), order.id)
    addEvent(order.id, 'cancel_ok', '未支付订单已取消')
    return { refundCents: 0 }
  }
  const hasWaybill = Boolean(order.sfWaybillNo)
  const fee = Number(getSetting('cancel_fee_before_collect_cents'))
  const r = refundAmount({
    paidCents: order.paidCents,
    hasWaybill,
    collected: false,
    cancelFeeCents: fee
  })
  if (hasWaybill) {
    try {
      await sf.cancelOrder(order.sfOrderId)
    } catch (e) {
      db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.CANCEL_REQUESTED, nowIso(), order.id)
      addEvent(order.id, 'cancel_requested', '已申请取消，顺丰撤单失败，待人工处理')
      const err = new Error('顺丰暂无法撤单，已转人工处理')
      err.status = 409
      throw err
    }
  }
  await wechat.refund()
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(STATUS.REFUNDED, nowIso(), order.id)
  addEvent(order.id, 'cancel_ok', hasWaybill ? `已取消，扣除手续费 ${(fee / 100).toFixed(2)} 元` : '已全额退款')
  return r
}

export function applyReweigh(order, actualKg) {
  const ignore = Number(getSetting('reweigh_ignore_kg'))
  const result = surchargeFromReweigh({
    declaredKg: order.declaredWeightKg,
    actualKg,
    sellFreightCents: (order.lines || []).find((l) => l.key === 'air_dtd')?.cents || order.paidCents,
    ignoreKg: ignore
  })
  db.prepare('UPDATE orders SET actual_weight_kg = ?, updated_at = ? WHERE id = ?').run(actualKg, nowIso(), order.id)
  if (result.ignored || result.lighter || result.surchargeCents === 0) {
    addEvent(order.id, 'reweigh', `复秤 ${actualKg}kg，1kg 内忽略或无需补差`)
    return result
  }
  db.prepare(
    'UPDATE orders SET status = ?, prev_transport_status = ?, surcharge_cents = ?, surcharge_paid = 0, updated_at = ? WHERE id = ?'
  ).run(STATUS.SURCHARGE_PENDING, order.status, result.surchargeCents, nowIso(), order.id)
  addEvent(order.id, 'surcharge', `复秤超差，需补差 ${(result.surchargeCents / 100).toFixed(2)} 元`)
  return result
}

export function paySurcharge(order) {
  if (order.status !== STATUS.SURCHARGE_PENDING) {
    const err = new Error('当前无需补差')
    err.status = 400
    throw err
  }
  const next = transportStatusAfterSurcharge(order.prev_transport_status)
  db.prepare('UPDATE orders SET status = ?, surcharge_paid = 1, paid_cents = paid_cents + surcharge_cents, updated_at = ? WHERE id = ?')
    .run(next, nowIso(), order.id)
  addEvent(order.id, 'surcharge_paid', '补差支付成功')
}

export async function issueInvoice(order, invoiceAdapter) {
  if (!canIssueInvoice(order.status, order.status)) {
    /* refunding check */
  }
  if (order.status !== STATUS.SIGNED) {
    const err = new Error('签收后方可开具发票')
    err.status = 400
    throw err
  }
  const raw = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id)
  if (raw.status === STATUS.REFUNDING) {
    const err = new Error('退款处理中不可开票')
    err.status = 400
    throw err
  }
  const result = await invoiceAdapter.issue(order)
  db.prepare('UPDATE orders SET invoice_status = ?, updated_at = ? WHERE id = ?').run(result.issued ? 'issued' : 'draft', nowIso(), order.id)
  addEvent(order.id, 'invoice', result.mark || '发票已受理')
  return result
}

export { BREEDS }
