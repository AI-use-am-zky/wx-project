const TABS = [
  { key: 'all', label: '全部', statuses: null },
  { key: 'pending', label: '待付款', statuses: ['pending_pay'] },
  { key: 'transit', label: '出行中', statuses: ['paid', 'sf_submitting', 'sf_failed', 'booked', 'collected', 'in_transit', 'surcharge_pending', 'cancel_requested'] },
  { key: 'done', label: '已完成', statuses: ['signed'] },
  { key: 'cancelled', label: '已取消', statuses: ['cancelled', 'refunded'] }
]

function filterOrders(list, tab) {
  const def = TABS.find((t) => t.key === tab) || TABS[0]
  if (!def.statuses) return list
  return list.filter((o) => def.statuses.includes(o.status))
}

module.exports = { TABS, filterOrders }
