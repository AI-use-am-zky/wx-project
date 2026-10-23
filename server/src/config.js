import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env') })

function csv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const config = {
  port: Number(process.env.PORT || 8787),
  wxMockLogin: process.env.WX_MOCK_LOGIN !== 'false',
  payMock: process.env.PAY_MOCK !== 'false',
  sfMock: process.env.SF_MOCK !== 'false',
  sfQuoteFail: process.env.SF_QUOTE_FAIL === 'true',
  /** sbox | prod | hk；默认生产，避免误用沙箱假数据 */
  sfEnv: process.env.SF_ENV || 'prod',
  sfPartnerId: process.env.SF_PARTNER_ID || '',
  sfCheckWord: process.env.SF_CHECKWORD || '',
  sfMonthlyCard: process.env.SF_MONTHLY_CARD || '',
  /** 测试页可切换的月结卡；小程序下单仍只用 sfMonthlyCard */
  sfLabMonthlyCards: csv(process.env.SF_LAB_MONTHLY_CARDS),
  /** 逗号分隔，产品推荐里优先选用的 productCode */
  sfPreferredProductCodes: csv(process.env.SF_PREFERRED_PRODUCT_CODES),
  /** 下单默认 expressTypeId（303=专享即日） */
  sfExpressTypeId: Number(process.env.SF_EXPRESS_TYPE_ID || 303),
  /** 公网根地址，供顺丰推送；非顺丰 API */
  sfPublicBaseUrl: (process.env.SF_PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  sfWaybillCallbackPath: process.env.SF_WAYBILL_CALLBACK_PATH || '/sfexpress/waybills/back',
  wxAppId: process.env.WX_APP_ID || '',
  wxAppSecret: process.env.WX_APP_SECRET || '',
  wxMchId: process.env.WX_MCH_ID || '',
  wxPayKey: process.env.WX_PAY_KEY || '',
  /** 支付结果通知完整 URL，如 https://api.example.com/pay/wx-notify */
  wxPayNotifyUrl: process.env.WX_PAY_NOTIFY_URL || '',
  wxPayClientIp: process.env.WX_PAY_CLIENT_IP || '127.0.0.1',
  wxSubscribeTplPickup: process.env.WX_SUBSCRIBE_TPL_PICKUP || '',
  wxSubscribeTplAlert: process.env.WX_SUBSCRIBE_TPL_ALERT || '',
  wxSubscribeTplSigned: process.env.WX_SUBSCRIBE_TPL_SIGNED || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-me',
  adminNotifyWebhook: process.env.ADMIN_NOTIFY_WEBHOOK || '',
  defaults: {
    markup_rate: process.env.MARKUP_RATE || '0.15',
    min_service_fee_cents: process.env.MIN_SERVICE_FEE_CENTS || '15000',
    cancel_fee_before_collect_cents: process.env.CANCEL_FEE_BEFORE_COLLECT_CENTS || '5000',
    reweigh_ignore_kg: process.env.REWEIGH_IGNORE_KG || '1',
    transport_agreement_version: process.env.TRANSPORT_AGREEMENT_VERSION || 'v1'
  }
}
