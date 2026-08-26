const { request } = require('./request')

function logOp(type, payload) {
  request({
    url: '/session/ops',
    method: 'POST',
    data: { type, payload: payload || {} },
    needAuth: false
  }).catch(() => {})
}

function fetchBadges() {
  return request({ url: '/session/badges' })
}

function markBadgeSeen(tab) {
  return request({ url: '/session/badges/seen', method: 'POST', data: { tab } })
}

module.exports = { logOp, fetchBadges, markBadgeSeen }
