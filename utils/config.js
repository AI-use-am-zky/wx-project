const { isDevTools } = require('./env')

/**
 * 开发者工具用本机回环；真机必须走电脑局域网 IP（与手机同一 WiFi）。
 * 若真机连不上，把 LAN_HOST 改成电脑当前 IP（ipconfig 查看）。
 */
const LAN_HOST = '192.168.0.13'
const PORT = 8787

module.exports = {
  baseUrl: isDevTools() ? `http://127.0.0.1:${PORT}` : `http://${LAN_HOST}:${PORT}`,
  brandName: '宠途空运'
}
