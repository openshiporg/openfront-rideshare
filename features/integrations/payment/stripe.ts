// Stripe Checkout over its REST API (no SDK). The secret key comes from STRIPE_SECRET_KEY on the app service;
// without it the adapter refuses before any provider I/O.
const STRIPE_API = 'https://api.stripe.com/v1'

type Input = { trip?: any; amount?: number; currency?: string; paymentId?: string; idempotencyKey?: string; origin?: string }

export type StripeCheckoutSession = {
  id: string
  url: string | null
  status: string | null
  payment_status: string
  amount_total: number | null
  currency: string | null
  client_reference_id: string | null
  metadata: Record<string, string> | null
  payment_intent: null | string | { id: string; latest_charge?: null | string | { id: string; payment_method_details?: { card?: { brand?: string; last4?: string } } } }
}

export function stripeSecretKey() {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim()
  return /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(key) ? key : null
}

function requireKey() {
  const key = stripeSecretKey()
  if (!key) throw new Error('Stripe is not configured for this deployment.')
  return key
}

function form(values: Record<string, string | number | undefined>) {
  const body = new URLSearchParams()
  for (const [name, value] of Object.entries(values)) if (value !== undefined) body.append(name, String(value))
  return body
}

async function stripeRequest<T>(path: string, init: { method?: 'GET' | 'POST'; body?: URLSearchParams; idempotencyKey?: string } = {}): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${requireKey()}`,
      ...(init.body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(init.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
    },
    body: init.body,
    signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json().catch(() => null) as any
  if (!response.ok) throw new Error(`Stripe request failed: ${payload?.error?.message ?? response.status}`)
  return payload as T
}

export function retrieveCheckoutSession(sessionId: string) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new Error('Checkout session is invalid.')
  return stripeRequest<StripeCheckoutSession>(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent.latest_charge`)
}

export async function createPaymentFunction({ trip, amount, currency, idempotencyKey, origin }: Input) {
  if (!trip?.id || !trip.confirmationCode || !origin) throw new Error('Card payment needs the trip and the storefront origin.')
  const code = encodeURIComponent(trip.confirmationCode)
  const session = await stripeRequest<StripeCheckoutSession>('/checkout/sessions', {
    method: 'POST',
    idempotencyKey: `trip-checkout:${idempotencyKey}`,
    body: form({
      mode: 'payment',
      client_reference_id: trip.id,
      'metadata[tripId]': trip.id,
      'metadata[confirmationCode]': trip.confirmationCode,
      'payment_intent_data[metadata][tripId]': trip.id,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': String(currency).toLowerCase(),
      'line_items[0][price_data][unit_amount]': amount,
      'line_items[0][price_data][product_data][name]': `Ride ${trip.confirmationCode}`,
      success_url: `${origin}/rides/${code}?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/rides/${code}?checkout=cancelled`,
    }),
  })
  return { status: 'pending', externalId: session.id, url: session.url, amount, currency }
}

export async function capturePaymentFunction({ paymentId }: Input) {
  // Checkout captures automatically; this reports the session's state.
  return getPaymentStatusFunction({ paymentId })
}

export async function getPaymentStatusFunction({ paymentId }: Input) {
  const session = await retrieveCheckoutSession(String(paymentId || ''))
  const status = session.payment_status === 'paid' ? 'captured' : session.status === 'expired' ? 'cancelled' : 'pending'
  return { status, externalId: session.id, amount: session.amount_total, currency: session.currency?.toUpperCase() }
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey }: Input) {
  const session = await retrieveCheckoutSession(String(paymentId || ''))
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!intent) throw new Error('This checkout has no payment to refund.')
  const refund = await stripeRequest<{ id: string; status: string }>('/refunds', {
    method: 'POST', idempotencyKey: `trip-refund:${idempotencyKey}`, body: form({ payment_intent: intent, amount }),
  })
  return { status: refund.status === 'succeeded' ? 'succeeded' : 'processing', externalId: refund.id, amount }
}

export async function handleWebhookFunction() {
  throw new Error('Stripe payments are confirmed from the Checkout session; webhooks are not accepted.')
}
