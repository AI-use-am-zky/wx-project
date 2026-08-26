const TREE = [
  { name: '北京市', alias: ['北京'], cities: ['北京市'] },
  { name: '天津市', alias: ['天津'], cities: ['天津市'] },
  { name: '上海市', alias: ['上海'], cities: ['上海市'] },
  { name: '重庆市', alias: ['重庆'], cities: ['重庆市'] },
  { name: '河北省', alias: ['河北'], cities: ['石家庄市', '唐山市', '秦皇岛市', '邯郸市', '邢台市', '保定市', '张家口市', '承德市', '沧州市', '廊坊市', '衡水市'] },
  { name: '山西省', alias: ['山西'], cities: ['太原市', '大同市', '阳泉市', '长治市', '晋城市', '朔州市', '晋中市', '运城市', '忻州市', '临汾市', '吕梁市'] },
  { name: '辽宁省', alias: ['辽宁'], cities: ['沈阳市', '大连市', '鞍山市', '抚顺市', '本溪市', '丹东市', '锦州市', '营口市', '阜新市', '辽阳市', '盘锦市', '铁岭市', '朝阳市', '葫芦岛市'] },
  { name: '吉林省', alias: ['吉林'], cities: ['长春市', '吉林市', '四平市', '辽源市', '通化市', '白山市', '松原市', '白城市'] },
  { name: '黑龙江省', alias: ['黑龙江'], cities: ['哈尔滨市', '齐齐哈尔市', '鸡西市', '鹤岗市', '双鸭山市', '大庆市', '伊春市', '佳木斯市', '七台河市', '牡丹江市', '黑河市', '绥化市'] },
  { name: '江苏省', alias: ['江苏'], cities: ['南京市', '无锡市', '徐州市', '常州市', '苏州市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市'] },
  { name: '浙江省', alias: ['浙江'], cities: ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '衢州市', '舟山市', '台州市', '丽水市'] },
  { name: '安徽省', alias: ['安徽'], cities: ['合肥市', '芜湖市', '蚌埠市', '淮南市', '马鞍山市', '淮北市', '铜陵市', '安庆市', '黄山市', '滁州市', '阜阳市', '宿州市', '六安市', '亳州市', '池州市', '宣城市'] },
  { name: '福建省', alias: ['福建'], cities: ['福州市', '厦门市', '莆田市', '三明市', '泉州市', '漳州市', '南平市', '龙岩市', '宁德市'] },
  { name: '江西省', alias: ['江西'], cities: ['南昌市', '景德镇市', '萍乡市', '九江市', '新余市', '鹰潭市', '赣州市', '吉安市', '宜春市', '抚州市', '上饶市'] },
  { name: '山东省', alias: ['山东'], cities: ['济南市', '青岛市', '淄博市', '枣庄市', '东营市', '烟台市', '潍坊市', '济宁市', '泰安市', '威海市', '日照市', '临沂市', '德州市', '聊城市', '滨州市', '菏泽市'] },
  { name: '河南省', alias: ['河南'], cities: ['郑州市', '开封市', '洛阳市', '平顶山市', '安阳市', '鹤壁市', '新乡市', '焦作市', '濮阳市', '许昌市', '漯河市', '三门峡市', '南阳市', '商丘市', '信阳市', '周口市', '驻马店市'] },
  { name: '湖北省', alias: ['湖北'], cities: ['武汉市', '黄石市', '十堰市', '宜昌市', '襄阳市', '鄂州市', '荆门市', '孝感市', '荆州市', '黄冈市', '咸宁市', '随州市'] },
  { name: '湖南省', alias: ['湖南'], cities: ['长沙市', '株洲市', '湘潭市', '衡阳市', '邵阳市', '岳阳市', '常德市', '张家界市', '益阳市', '郴州市', '永州市', '怀化市', '娄底市'] },
  { name: '广东省', alias: ['广东'], cities: ['广州市', '韶关市', '深圳市', '珠海市', '汕头市', '佛山市', '江门市', '湛江市', '茂名市', '肇庆市', '惠州市', '梅州市', '汕尾市', '河源市', '阳江市', '清远市', '东莞市', '中山市', '潮州市', '揭阳市', '云浮市'] },
  { name: '海南省', alias: ['海南'], cities: ['海口市', '三亚市', '三沙市', '儋州市'] },
  { name: '四川省', alias: ['四川'], cities: ['成都市', '自贡市', '攀枝花市', '泸州市', '德阳市', '绵阳市', '广元市', '遂宁市', '内江市', '乐山市', '南充市', '眉山市', '宜宾市', '广安市', '达州市', '雅安市', '巴中市', '资阳市'] },
  { name: '贵州省', alias: ['贵州'], cities: ['贵阳市', '六盘水市', '遵义市', '安顺市', '毕节市', '铜仁市'] },
  { name: '云南省', alias: ['云南'], cities: ['昆明市', '曲靖市', '玉溪市', '保山市', '昭通市', '丽江市', '普洱市', '临沧市'] },
  { name: '陕西省', alias: ['陕西'], cities: ['西安市', '铜川市', '宝鸡市', '咸阳市', '渭南市', '延安市', '汉中市', '榆林市', '安康市', '商洛市'] },
  { name: '甘肃省', alias: ['甘肃'], cities: ['兰州市', '嘉峪关市', '金昌市', '白银市', '天水市', '武威市', '张掖市', '平凉市', '酒泉市', '庆阳市', '定西市', '陇南市'] },
  { name: '广西壮族自治区', alias: ['广西'], cities: ['南宁市', '柳州市', '桂林市', '梧州市', '北海市', '防城港市', '钦州市', '贵港市', '玉林市', '百色市', '贺州市', '河池市', '来宾市', '崇左市'] }
]

const PROVINCE_NAMES = TREE.map((p) => p.name)

function findProvince(name) {
  if (!name) return null
  const n = String(name).trim()
  return TREE.find((p) => p.name === n || p.alias.includes(n) || p.name.startsWith(n) || n.startsWith(p.alias[0] || p.name)) || null
}

function citiesOf(provinceName) {
  const p = findProvince(provinceName)
  return p ? p.cities : []
}

function indexesFor(province, city) {
  const pi = TREE.findIndex((p) => p.name === province || p.alias.includes(province) || p.name === (province || '') + '市')
  if (pi < 0) {
    const fuzzy = TREE.findIndex((p) => p.alias.some((a) => (province || '').includes(a)) || (province || '').includes(p.alias[0]))
    if (fuzzy < 0) return [0, 0]
    const cities = TREE[fuzzy].cities
    const ci = Math.max(0, cities.findIndex((c) => c === city || c === city + '市' || c.replace(/市$/, '') === (city || '').replace(/市$/, '')))
    return [fuzzy, ci < 0 ? 0 : ci]
  }
  const cities = TREE[pi].cities
  const ci = cities.findIndex((c) => c === city || c === city + '市' || c.replace(/市$/, '') === (city || '').replace(/市$/, ''))
  return [pi, ci < 0 ? 0 : ci]
}

function rangeFor(provinceIndex) {
  const i = provinceIndex >= 0 ? provinceIndex : 0
  return [PROVINCE_NAMES, TREE[i] ? TREE[i].cities : TREE[0].cities]
}

function storeCityName(cityLabel) {
  const raw = String(cityLabel || '').trim()
  if (raw === '吉林市') return '吉林市'
  return raw.replace(/市$/, '') || raw
}

function cityFromIndex(pi, ci) {
  const p = TREE[pi]
  if (!p) return null
  const cityLabel = p.cities[ci]
  if (!cityLabel) return null
  const name = storeCityName(cityLabel)
  return {
    code: (p.alias[0] || p.name) + '-' + name,
    name,
    province: p.name,
    city: name
  }
}

function cityLabel(city) {
  if (!city) return ''
  const province = city.province || ''
  const name = city.name || city.city || ''
  if (!province && !name) return ''
  if (['北京市', '上海市', '天津市', '重庆市'].includes(province)) return province
  if (province && name) return province + ' ' + name
  return name || province
}

function samePlace(a, b) {
  if (!a || !b) return false
  if (a.code && b.code && a.code === b.code) return true
  return a.province === b.province && (a.name || a.city) === (b.name || b.city)
}

function pickerFromCity(city) {
  const idx = indexesFor(city && city.province, city && (city.name || city.city))
  return { index: idx, range: rangeFor(idx[0]) }
}

module.exports = {
  TREE,
  PROVINCE_NAMES,
  findProvince,
  citiesOf,
  indexesFor,
  rangeFor,
  storeCityName,
  cityFromIndex,
  cityLabel,
  samePlace,
  pickerFromCity
}
