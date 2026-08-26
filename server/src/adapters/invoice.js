/** 未开通电子发票时只打标，保留 API 形状 */
export function createInvoiceAdapter() {
  return {
    async issue(order) {
      return {
        provider: 'offline_pending',
        issued: false,
        mark: '待线下开',
        orderId: order.id
      }
    }
  }
}
