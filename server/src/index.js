import { createApp } from './app.js'
import { config } from './config.js'
import { createWechat } from './adapters/wechat.js'

const app = createApp()
app.listen(config.port, '0.0.0.0', async () => {
  console.log(`pet-air API http://127.0.0.1:${config.port}`)
  console.log(`pet-air LAN  http://0.0.0.0:${config.port} (真机请用电脑 WLAN IP)`)
  console.log(`admin http://127.0.0.1:${config.port}/admin/`)
  const mock = config.wxMockLogin || !config.wxAppSecret
  console.log(`[wx] mockLogin=${mock} appId=${config.wxAppId || '(empty)'}`)
  if (!mock) {
    try {
      await createWechat().getAccessToken()
      console.log('[wx] AppID/Secret 校验通过')
    } catch (e) {
      console.error('[wx] AppID/Secret 无效，登录会失败:', e.message, e.data || '')
    }
  }
})
