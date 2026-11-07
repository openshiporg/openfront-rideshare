import { createHmac, timingSafeEqual } from 'node:crypto'

export function stripeWebhookSecret() {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim()
  return /^whsec_[A-Za-z0-9+/=_-]{8,}$/.test(secret) ? secret : null
}

/** Stripe-Signature is `t=<unix>,v1=<hex>[,v1=<hex>]` over `<t>.<raw body>`. A bad, missing or old signature is refused. */
export function verifyStripeSignature(rawBody: string, header: string | null | undefined, secret: string, now = Date.now(), toleranceSeconds = 300) {
  if (!header || !secret) return false
  const parts = header.split(',').map(part => part.trim().split('='))
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value).filter(Boolean)
  if (!timestamp || !/^\d{9,12}$/.test(timestamp) || !signatures.length) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) return false
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest()
  return signatures.some(signature => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false
    return timingSafeEqual(Buffer.from(signature, 'hex'), expected)
  })
}
