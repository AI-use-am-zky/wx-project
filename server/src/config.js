import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

export const config = {
  port: Number(process.env.PORT || 8787),
  wxMockLogin: process.env.WX_MOCK_LOGIN !== 'false',
  payMock: process.env.PAY_MOCK !== 'false',
  sfMock: process.env.SF_MOCK !== 'false',
  sfQuoteFail: process.env.SF_QUOTE_FAIL === 'true',
  wxAppId: process.env.WX_APP_ID || '',
  wxAppSecret: process.env.WX_APP_SECRET || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-me',
  adminNotifyWebhook: process.env.ADMIN_NOTIFY_WEBHOOK || '',
  defaults: {
    markup_rate: process.env.MARKUP_RATE || '0.15',
    min_service_fee_cents: process.env.MIN_SERVICE_FEE_CENTS || '15000',
    cancel_fee_before_collect_cents: process.env.CANCEL_FEE_BEFORE_COLLECT_CENTS || '5000',
    reweigh_ignore_kg: process.env.REWEIGH_IGNORE_KG || '1',
    customer_service_phone: process.env.CUSTOMER_SERVICE_PHONE || '400-000-0000',
    customer_service_hours: process.env.CUSTOMER_SERVICE_HOURS || '09:00~21:00',
    transport_agreement_version: process.env.TRANSPORT_AGREEMENT_VERSION || 'v1'
  }
}
