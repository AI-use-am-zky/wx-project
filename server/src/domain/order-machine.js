const COLLECTED_OR_AFTER = new Set(['collected', 'in_transit', 'signed', 'surcharge_pending'])

export const STATUS = {
  PENDING_PAY: 'pending_pay',
  PAID: 'paid',
  SF_SUBMITTING: 'sf_submitting',
  SF_FAILED: 'sf_failed',
  BOOKED: 'booked',
  COLLECTED: 'collected',
  IN_TRANSIT: 'in_transit',
  SIGNED: 'signed',
  CANCEL_REQUESTED: 'cancel_requested',
  CANCELLED: 'cancelled',
  REFUNDING: 'refunding',
  REFUNDED: 'refunded',
  SURCHARGE_PENDING: 'surcharge_pending'
}

export function canSelfCancel(status, waybillNo) {
  if (status === STATUS.SIGNED || status === STATUS.REFUNDED || status === STATUS.CANCELLED) return false
  if (COLLECTED_OR_AFTER.has(status) && status !== STATUS.SURCHARGE_PENDING) return false
  if (status === STATUS.COLLECTED || status === STATUS.IN_TRANSIT) return false
  if (status === STATUS.PENDING_PAY) return true
  if ([STATUS.PAID, STATUS.SF_SUBMITTING, STATUS.SF_FAILED, STATUS.BOOKED].includes(status)) return true
  if (status === STATUS.SURCHARGE_PENDING && !waybillNo) return true
  if (status === STATUS.BOOKED) return true
  return Boolean(status && !COLLECTED_OR_AFTER.has(status))
}

export function isCollectedOrAfter(status) {
  return status === STATUS.COLLECTED || status === STATUS.IN_TRANSIT || status === STATUS.SIGNED
}

export function canIssueInvoice(status, refundStatus) {
  return status === STATUS.SIGNED && refundStatus !== STATUS.REFUNDING
}

export function transportStatusAfterSurcharge(prevTransportStatus) {
  if (prevTransportStatus && prevTransportStatus !== STATUS.SURCHARGE_PENDING) return prevTransportStatus
  return STATUS.BOOKED
}
