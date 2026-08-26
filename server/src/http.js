export function ok(res, data) {
  res.json({ code: 0, message: 'ok', data })
}

export function fail(res, status, message, extra) {
  res.status(status).json({ code: status, message, data: extra || null })
}

export function requireFields(obj, fields) {
  for (const f of fields) {
    const v = obj[f]
    if (v === undefined || v === null || String(v).trim() === '') {
      const err = new Error(`缺少字段：${f}`)
      err.status = 400
      throw err
    }
  }
}

export function validAddress(a) {
  if (!a) return false
  return ['name', 'phone', 'province', 'city', 'district', 'detail'].every(
    (k) => a[k] && String(a[k]).trim()
  )
}

export function centsToYuan(cents) {
  return (Math.round(cents) / 100).toFixed(2)
}

export const BREEDS = [
  { species: 'dog', name: '狗', breeds: ['中华田园犬', '金毛', '柯基', '泰迪', '边牧', '其他犬'] },
  { species: 'cat', name: '猫', breeds: ['中华田园猫', '英国短毛猫', '布偶', '美短', '其他猫'] },
  { species: 'other', name: '其他（顺丰允许的小宠）', breeds: ['兔', '其他'] }
]

export const ADDON_QUARANTINE_CENTS = 20000

export function insureFeeCents(declaredValueCents) {
  const v = Number(declaredValueCents) || 0
  return Math.max(100, Math.round(v * 0.01))
}
