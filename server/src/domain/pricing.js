/** 金额单位：分。询价成功：服务费 = max(成本 * 比例, 最低服务费)，售价运费 = 成本 + 服务费 */
export function priceFromSfCost(sfCostCents, markupRate, minServiceFeeCents) {
  const cost = Math.max(0, Math.round(Number(sfCostCents) || 0))
  const rate = Number(markupRate)
  const minFee = Math.max(0, Math.round(Number(minServiceFeeCents) || 0))
  const serviceFee = Math.max(Math.round(cost * rate), minFee)
  return {
    quoteSource: 'sf',
    sfCostCents: cost,
    sellFreightCents: cost + serviceFee,
    serviceFeeCents: serviceFee,
    totalCents: cost + serviceFee
  }
}

/** 询价失败：价表已是含服务费的卖价，服务费行 0 */
export function priceFromRateCard(rateCardSellCents) {
  const sell = Math.max(0, Math.round(Number(rateCardSellCents) || 0))
  return {
    quoteSource: 'rate_card',
    sfCostCents: null,
    sellFreightCents: sell,
    serviceFeeCents: 0,
    totalCents: sell
  }
}

export function surchargeFromReweigh({ declaredKg, actualKg, sellFreightCents, ignoreKg }) {
  const declared = Number(declaredKg)
  const actual = Number(actualKg)
  const ignore = Number(ignoreKg)
  const delta = Math.abs(actual - declared)
  if (delta <= ignore) {
    return { ignored: true, extraKg: 0, surchargeCents: 0 }
  }
  const extraKg = actual - declared
  if (extraKg <= 0) {
    return { ignored: false, extraKg, surchargeCents: 0, lighter: true }
  }
  const perKg = declared > 0 ? sellFreightCents / declared : sellFreightCents
  const surchargeCents = Math.max(100, Math.round(extraKg * perKg))
  return { ignored: false, extraKg, surchargeCents, lighter: false }
}

export function refundAmount({ paidCents, hasWaybill, collected, cancelFeeCents }) {
  if (collected) return { allowed: false, refundCents: 0, reason: 'collected' }
  if (!hasWaybill) return { allowed: true, refundCents: paidCents, feeCents: 0 }
  const fee = Math.min(paidCents, Math.round(Number(cancelFeeCents) || 0))
  return { allowed: true, refundCents: Math.max(0, paidCents - fee), feeCents: fee }
}
