const CITIES = [
  { code: 'beijing', name: '北京', province: '北京市' },
  { code: 'shanghai', name: '上海', province: '上海市' },
  { code: 'guangzhou', name: '广州', province: '广东省' },
  { code: 'shenzhen', name: '深圳', province: '广东省' },
  { code: 'chengdu', name: '成都', province: '四川省' },
  { code: 'hangzhou', name: '杭州', province: '浙江省' },
  { code: 'wuhan', name: '武汉', province: '湖北省' },
  { code: 'xian', name: '西安', province: '陕西省' }
]

const CITY_NAMES = CITIES.map((c) => c.name)

function findCity(codeOrName) {
  if (!codeOrName) return null
  return CITIES.find((c) => c.code === codeOrName || c.name === codeOrName) || null
}

function indexOfCity(city) {
  if (!city) return 0
  const i = CITIES.findIndex((c) => c.code === city.code || c.name === city.name)
  return i >= 0 ? i : 0
}

function withProvince(city) {
  if (!city) return null
  const known = findCity(city.code) || findCity(city.name)
  if (known) {
    return {
      ...known,
      ...city,
      province: known.province,
      name: city.name || known.name,
      code: city.code || known.code
    }
  }
  return {
    ...city,
    province: city.province || ''
  }
}

function mergeCityList(remote) {
  const list = Array.isArray(remote) && remote.length ? remote : CITIES
  return list.map((c) => withProvince(c))
}

module.exports = { CITIES, CITY_NAMES, findCity, indexOfCity, withProvince, mergeCityList }
