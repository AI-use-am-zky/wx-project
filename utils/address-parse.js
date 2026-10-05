const { TREE } = require('./regions')

const MOBILE_RE = /^1[3-9]\d{9}$/
const MOBILE_RUN = /1[3-9]\d{9}/g
const MOBILE_GROUPED = /1[3-9]\d[\s-]\d{4}[\s-]\d{4}/g
const LABEL_RE = /收件人|收货人|联系人|姓名|手机号码|手机号|手机|电话|所在地区|详细地址|地址|邮编/g
const NOT_PERSON = /[省市区县旗镇乡村路街巷道号弄栋单元室楼层组]/
const FAKE_DISTRICT = /(小区|社区|校区|园区|景区|度假区|别墅区)$/
const DISTRICT_SUFFIXES = ['自治县', '自治旗', '新区', '县', '区', '旗', '镇']

function isMobile(phone) {
  return MOBILE_RE.test(String(phone || '').trim())
}

function looksLikeFullAddress(text) {
  const s = String(text || '')
  MOBILE_RUN.lastIndex = 0
  MOBILE_GROUPED.lastIndex = 0
  if (MOBILE_RUN.test(s) || MOBILE_GROUPED.test(s)) return true
  if (/省|自治区|特别行政区/.test(s)) return true
  if (/(北京|上海|天津|重庆)市?/.test(s) && /区|县|街道|路|号/.test(s)) return true
  if (/[\u4e00-\u9fa5]{2,8}市/.test(s) && /区|县|路|街|号|小区/.test(s)) return true
  return false
}

function isPersonName(token) {
  return /^[\u4e00-\u9fa5]{2,}$/.test(token) && !NOT_PERSON.test(token)
}

function maskName(name) {
  const chars = Array.from(name)
  if (chars.length <= 4) return name
  return chars.slice(0, 4).join('') + '*'.repeat(chars.length - 4)
}

function normalize(text) {
  return String(text || '')
    .replace(LABEL_RE, ' ')
    .replace(/[，,；;、：:\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function phoneCandidates(text) {
  const found = []
  function collect(re) {
    re.lastIndex = 0
    let match = re.exec(text)
    while (match) {
      const start = match.index
      const end = start + match[0].length
      const before = start > 0 ? text[start - 1] : ''
      const after = end < text.length ? text[end] : ''
      if (!/\d/.test(before) && !/\d/.test(after)) {
        const phone = match[0].replace(/[\s-]/g, '')
        if (MOBILE_RE.test(phone)) found.push({ start, end, phone, raw: match[0] })
      }
      match = re.exec(text)
    }
  }
  collect(MOBILE_RUN)
  collect(MOBILE_GROUPED)
  return found
}

function takePhone(text) {
  const found = phoneCandidates(text)
  if (!found.length) return { phone: '', rest: text }
  const match = found[found.length - 1]
  const rest = (text.slice(0, match.start) + ' ' + text.slice(match.end)).replace(/\s+/g, ' ').trim()
  return { phone: match.phone, rest }
}

function hasRegion(text) {
  return /省|市|区|县|自治区|路|街|号|小区|镇/.test(text)
}

function nameFromToken(token) {
  const match = String(token || '').match(/^([\u4e00-\u9fa5]{2,})(\d*)$/)
  if (!match || !isPersonName(match[1])) return ''
  return match[1]
}

function takeName(text) {
  const parts = text.split(/\s+/).filter(Boolean)
  const head = nameFromToken(parts[0])
  if (parts.length >= 2 && head && hasRegion(parts.slice(1).join(''))) {
    return { name: maskName(head), rest: parts.slice(1).join('') }
  }
  const tail = nameFromToken(parts[parts.length - 1])
  if (parts.length >= 2 && tail && hasRegion(parts.slice(0, -1).join(''))) {
    return { name: maskName(tail), rest: parts.slice(0, -1).join('') }
  }
  const compact = text.replace(/\s+/g, '')
  let found = null
  for (const province of TREE) {
    for (const key of [province.name].concat(province.alias || [])) {
      const at = compact.indexOf(key)
      if (at < 2) continue
      const rawPrefix = compact.slice(0, at)
      const prefix = rawPrefix.replace(/\d+$/, '')
      if (!isPersonName(prefix) || !/^\d*$/.test(rawPrefix.slice(prefix.length))) continue
      if (!found || at < found.at || (at === found.at && key.length > found.key.length)) {
        found = { at, prefix, keyLen: key.length }
      }
    }
  }
  if (found) return { name: maskName(found.prefix), rest: compact.slice(found.at) }
  return { name: '', rest: compact }
}

function takeProvince(text) {
  let found = null
  for (const province of TREE) {
    const keys = [province.name].concat(province.alias || []).sort((a, b) => b.length - a.length)
    for (const key of keys) {
      const at = text.indexOf(key)
      if (at < 0) continue
      if (!found || at < found.at || (at === found.at && key.length > found.key.length)) {
        found = { province, key, at }
      }
    }
  }
  if (!found) return { province: null, rest: text }
  const rest = (text.slice(0, found.at) + text.slice(found.at + found.key.length)).trim()
  return { province: found.province, rest }
}

function takeCity(province, text) {
  if (!province) return { city: '', rest: text }
  const cities = (province.cities || []).slice().sort((a, b) => b.length - a.length)
  for (const city of cities) {
    const shortName = city.replace(/市$/, '')
    const key = text.includes(city) ? city : shortName && text.includes(shortName) ? shortName : ''
    if (!key) continue
    const at = text.indexOf(key)
    const rest = (text.slice(0, at) + text.slice(at + key.length)).trim()
    return { city, rest }
  }
  if (/市$/.test(province.name)) return { city: province.name, rest: text }
  return { city: '', rest: text }
}

function takeDistrict(text) {
  let best = ''
  for (const suffix of DISTRICT_SUFFIXES) {
    for (let stemLen = 1; stemLen <= 6; stemLen++) {
      const stem = text.slice(0, stemLen)
      if (!/^[\u4e00-\u9fa5]+$/.test(stem)) continue
      const word = stem + suffix
      if (!text.startsWith(word) || FAKE_DISTRICT.test(word)) continue
      if (!best || word.length < best.length) best = word
    }
  }
  if (!best) return { district: '', rest: text }
  return { district: best, rest: text.slice(best.length).trim() }
}

function parseAddress(text) {
  const out = { name: '', phone: '', province: '', city: '', district: '', detail: '' }
  const raw = normalize(text)
  if (!raw) return out

  const phone = takePhone(raw)
  out.phone = phone.phone

  const named = takeName(phone.rest)
  out.name = named.name

  const province = takeProvince(named.rest)
  out.province = province.province ? province.province.name : ''

  const city = takeCity(province.province, province.rest)
  out.city = city.city

  const district = takeDistrict(city.rest)
  out.district = district.district
  out.detail = district.rest.replace(/\s+/g, '')
  return out
}

function mergeParsed(current, parsed) {
  const next = { ...current }
  ;['name', 'phone', 'province', 'city', 'district', 'detail'].forEach((key) => {
    if (parsed[key]) next[key] = parsed[key]
  })
  return next
}

module.exports = { isMobile, looksLikeFullAddress, parseAddress, mergeParsed, MOBILE_RE }
