const CITIES = [
  { code: 'beijing', name: '北京' },
  { code: 'shanghai', name: '上海' },
  { code: 'guangzhou', name: '广州' },
  { code: 'shenzhen', name: '深圳' },
  { code: 'chengdu', name: '成都' },
  { code: 'hangzhou', name: '杭州' },
  { code: 'wuhan', name: '武汉' },
  { code: 'xian', name: '西安' }
]

function daysFromToday(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function createMockSf({ quoteFail = false } = {}) {
  return {
    async listServiceCities() {
      return CITIES
    },
    async quotePetAir(input) {
      if (quoteFail) {
        const err = new Error('SF_QUOTE_UNAVAILABLE')
        err.code = 'SF_QUOTE_UNAVAILABLE'
        throw err
      }
      const kg = Number(input.weightKg) || 1
      const costCents = Math.round((180 + kg * 35) * 100)
      return { costCents, raw: { mock: true, kg, from: input.fromCity, to: input.toCity } }
    },
    async listPickupSlots(_address, _date) {
      return ['09:00-12:00', '13:00-18:00']
    },
    async listPickupDates() {
      return Array.from({ length: 14 }, (_, i) => daysFromToday(i + 1))
    },
    async createOrder(input) {
      const waybillNo = 'SF' + Date.now().toString().slice(-12)
      return {
        waybillNo,
        sfOrderId: 'mock-' + waybillNo,
        raw: { mock: true, sender: input.sender, receiver: input.receiver }
      }
    },
    async cancelOrder(sfOrderId) {
      return { ok: true, raw: { mock: true, sfOrderId } }
    },
    async queryRoutes(waybillNo) {
      return [{ time: new Date().toISOString(), text: '运单已生成（模拟）', code: 'created', waybillNo }]
    },
    async declareValue(cents) {
      return { ok: true, declaredValueCents: cents }
    }
  }
}
