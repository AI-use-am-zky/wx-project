const { TREE, findProvince, storeCityName } = require('./regions')

const MOBILE_RE = /^1[3-9]\d{9}$/
const MOBILE_FIND = /1[3-9]\d{9}/

function isMobile(phone) {
  return MOBILE_RE.test(String(phone || '').trim())
}

function looksLikeFullAddress(text) {
  const s = String(text || '')
  if (MOBILE_FIND.test(s)) return true
  if (/省|自治区|特别行政区/.test(s)) return true
  if (/(北京|上海|天津|重庆)市?/.test(s) && /区|县|街道|路|号/.test(s)) return true
  return false
}

function parseAddress(text) {
  let raw = String(text || '').replace(/[，,；;、]/g, ' ').replace(/\s+/g, ' ').trim()
  const out = { name: '', phone: '', province: '', city: '', district: '', detail: '' }
  if (!raw) return out

  const phoneMatch = raw.match(MOBILE_FIND)
  if (phoneMatch) {
    out.phone = phoneMatch[0]
    raw = raw.replace(phoneMatch[0], ' ').replace(/\s+/g, ' ').trim()
  }

  let rest = raw
  for (const p of TREE) {
    const keys = [p.name].concat(p.alias || [])
    keys.sort((a, b) => b.length - a.length)
    const hit = keys.find((k) => rest.includes(k))
    if (!hit) continue
    out.province = p.name
    rest = rest.replace(hit, ' ')
    const cities = (p.cities || []).slice().sort((a, b) => b.length - a.length)
      for (const c of cities) {
        const shortName = c.replace(/市$/, '')
        if (rest.includes(c) || (shortName && rest.includes(shortName))) {
          out.city = storeCityName(c)
          rest = rest.replace(c, ' ').replace(shortName, ' ')
          break
        }
      }
      if (!out.city && /市$/.test(p.name)) out.city = storeCityName(p.name)
      break
  }

  rest = rest.replace(/\s+/g, ' ').trim()
  const distMatch = rest.match(/(\S{1,8}(?:区|县|市|旗|镇))/)
  if (distMatch) {
    out.district = distMatch[1]
    rest = rest.replace(distMatch[1], ' ').replace(/\s+/g, ' ').trim()
  }

  const nameStart = rest.match(/^([\u4e00-\u9fa5]{2,4})\s+/)
  if (nameStart) {
    out.name = nameStart[1]
    rest = rest.slice(nameStart[0].length).trim()
  } else {
    const nameEnd = rest.match(/\s+([\u4e00-\u9fa5]{2,4})$/)
    if (nameEnd) {
      out.name = nameEnd[1]
      rest = rest.slice(0, -nameEnd[0].length).trim()
    }
  }

  out.detail = rest
  return out
}

function mergeParsed(current, parsed) {
  const next = { ...current }
  ;['name', 'phone', 'province', 'city', 'district', 'detail'].forEach((k) => {
    if (parsed[k]) next[k] = parsed[k]
  })
  return next
}

module.exports = { isMobile, looksLikeFullAddress, parseAddress, mergeParsed, MOBILE_RE }
