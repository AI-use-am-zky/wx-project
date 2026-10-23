const config = require('./config')

function photoSrc(url) {
  if (!url || typeof url !== 'string') return ''
  if (/^https?:\/\//.test(url) || url.indexOf('wxfile://') === 0) return url
  if (url.indexOf('/uploads/') === 0) return config.baseUrl + url
  return ''
}

module.exports = { photoSrc }
