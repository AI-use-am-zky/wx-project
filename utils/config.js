const { isDevTools } = require('./env')

/**
 * 开发者工具走本机后端。真机预览和正式版走已备案域名。
 */
const LOCAL_PORT = 8787
const PUBLIC_BASE = 'https://qibantech.net'

module.exports = {
  baseUrl: isDevTools() ? `http://127.0.0.1:${LOCAL_PORT}` : PUBLIC_BASE,
  brandName: '航宠通'
}
