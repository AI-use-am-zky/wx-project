import { createApp } from './app.js'
import { config } from './config.js'

const app = createApp()
app.listen(config.port, () => {
  console.log(`pet-air API http://127.0.0.1:${config.port}`)
  console.log(`admin http://127.0.0.1:${config.port}/admin/`)
})
