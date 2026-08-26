export function createNotify({ webhookUrl }) {
  return {
    async send(event, payload) {
      const text = `[${event}] 订单 ${payload.orderId || ''} ${payload.summary || ''}`
      console.log('[admin-notify]', text)
      if (!webhookUrl) return { ok: true, skipped: true }
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, ...payload, text })
        })
        return { ok: true }
      } catch (e) {
        console.error('[admin-notify] fail', e.message)
        return { ok: false }
      }
    }
  }
}
