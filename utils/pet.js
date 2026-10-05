/** 与 server/src/http.js BREEDS 对齐，用于物品名称反查品种 */
const SPECIES = [
  { species: 'dog', name: '狗', breeds: ['中华田园犬', '金毛', '柯基', '泰迪', '边牧', '其他犬'] },
  { species: 'cat', name: '猫', breeds: ['中华田园猫', '英国短毛猫', '布偶', '美短', '其他猫'] },
  { species: 'other', name: '其他', breeds: ['兔', '其他'] }
]

function resolvePetFromName(name) {
  const n = String(name || '').trim()
  if (!n) return { species: '', breed: '' }
  for (const s of SPECIES) {
    const hit = s.breeds.find((b) => n === b || n.includes(b) || b.includes(n))
    if (hit) return { species: s.species, breed: hit }
  }
  if (/猫/.test(n)) return { species: 'cat', breed: '其他猫' }
  if (/兔/.test(n)) return { species: 'other', breed: '兔' }
  return { species: 'dog', breed: n }
}

function goodsFilled(book) {
  return Boolean(book && book.weightKg && (book.species || book.petName || book.breed))
}

function ensurePetFields(book) {
  if (!book) return book
  if (!book.species || !book.breed) {
    const resolved = resolvePetFromName(book.petName || book.breed || '')
    if (resolved.species) book.species = book.species || resolved.species
    if (resolved.breed) book.breed = book.breed || resolved.breed
  }
  if (!book.petName && book.breed) book.petName = book.breed
  return book
}

module.exports = { resolvePetFromName, goodsFilled, ensurePetFields }
