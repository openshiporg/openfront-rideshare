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
      // Riders shouldn't retype the email they booked with.
      customer_email: typeof trip.rider?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trip.rider.email) ? trip.rider.email : undefined,
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
  if (/^pi_[A-Za-z0-9]+$/.test(String(paymentId || ''))) {
    const intent = await retrievePaymentIntent(String(paymentId))
    return { status: intent.status === 'succeeded' ? 'captured' : intent.status === 'canceled' ? 'cancelled' : intent.status === 'processing' ? 'pending' : 'failed', externalId: intent.id, amount: intent.amount, currency: intent.currency?.toUpperCase() }
  }
  const session = await retrieveCheckoutSession(String(paymentId || ''))
  const status = session.payment_status === 'paid' ? 'captured' : session.status === 'expired' ? 'cancelled' : 'pending'
  return { status, externalId: session.id, amount: session.amount_total, currency: session.currency?.toUpperCase() }
}

/** The PaymentIntent behind a stored reference: a saved-card charge stores the intent itself, a Checkout payment its session. */
async function paymentIntentId(reference: string) {
  if (/^pi_[A-Za-z0-9]+$/.test(reference)) return reference
  const session = await retrieveCheckoutSession(reference)
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
}

export async function refundPaymentFunction({ paymentId, amount, idempotencyKey }: Input) {
  const intent = await paymentIntentId(String(paymentId || ''))
  if (!intent) throw new Error('This checkout has no payment to refund.')
  const refund = await stripeRequest<{ id: string; status: string }>('/refunds', {
    method: 'POST', idempotencyKey: `trip-refund:${idempotencyKey}`, body: form({ payment_intent: intent, amount }),
  })
  return { status: refund.status === 'succeeded' ? 'succeeded' : 'processing', externalId: refund.id, amount }
}

// ── Saved cards ────────────────────────────────────────────────────────────────────────────────
// A rider saves a card once through Checkout in setup mode (Stripe runs the SetupIntent and any 3-D Secure
// step on its own page). Later fares and fees are charged off-session against that card.

export type StripeCard = { id: string; customer: string | null; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } }
export type StripeSetupSession = { id: string; url: string | null; status: string | null; mode: string; customer: string | null; client_reference_id: string | null; metadata: Record<string, string> | null; setup_intent: null | string | { id: string; status: string; customer: string | null; payment_method: null | string | StripeCard } }
export type StripePaymentIntent = { id: string; status: string; amount: number; currency: string; customer: string | null; metadata: Record<string, string> | null; last_payment_error?: { code?: string; decline_code?: string; message?: string } | null; latest_charge?: null | string | { id: string } }

export function createStripeCustomer({ email, name, userId }: { email?: string | null; name?: string | null; userId: string }) {
  return stripeRequest<{ id: string }>('/customers', { method: 'POST', idempotencyKey: `rider-customer:${userId}`, body: form({ email: email || undefined, name: name || undefined, 'metadata[userId]': userId }) })
}

export function createCardSetupSession({ customerId, userId, successUrl, cancelUrl }: { customerId: string; userId: string; successUrl: string; cancelUrl: string }) {
  return stripeRequest<StripeSetupSession>('/checkout/sessions', { method: 'POST', body: form({
    mode: 'setup', customer: customerId, client_reference_id: userId, 'payment_method_types[0]': 'card',
    'metadata[userId]': userId, 'metadata[purpose]': 'rider_card', 'setup_intent_data[metadata][userId]': userId,
    success_url: successUrl, cancel_url: cancelUrl,
  }) })
}

export function retrieveSetupSession(sessionId: string) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new Error('Card setup session is invalid.')
  return stripeRequest<StripeSetupSession>(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=setup_intent.payment_method`)
}

export function detachPaymentMethod(paymentMethodId: string) {
  if (!/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) throw new Error('Saved card is invalid.')
  return stripeRequest<StripeCard>(`/payment_methods/${encodeURIComponent(paymentMethodId)}/detach`, { method: 'POST', body: form({}) })
}

export function retrievePaymentIntent(id: string) {
  if (!/^pi_[A-Za-z0-9]+$/.test(id)) throw new Error('Payment is invalid.')
  return stripeRequest<StripePaymentIntent>(`/payment_intents/${encodeURIComponent(id)}`)
}

/** Charges a saved card with the rider away. A decline is an answer, not an error: it comes back as the intent's
 * status and last_payment_error. The idempotency key makes a repeated call return the first answer. */
export async function chargeSavedCard({ customerId, paymentMethodId, amount, currency, description, metadata, idempotencyKey }: { customerId: string; paymentMethodId: string; amount: number; currency: string; description: string; metadata: Record<string, string>; idempotencyKey: string }): Promise<StripePaymentIntent> {
  const body = form({
    amount, currency: currency.toLowerCase(), customer: customerId, payment_method: paymentMethodId,
    off_session: 'true', confirm: 'true', description,
    ...Object.fromEntries(Object.entries(metadata).map(([key, value]) => [`metadata[${key}]`, value])),
  })
  const response = await fetch(`${STRIPE_API}/payment_intents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${requireKey()}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': idempotencyKey },
    body, signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json().catch(() => null) as any
  if (response.ok) return payload as StripePaymentIntent
  // Card errors carry the failed intent; anything else (bad key, network, 5xx) is an unknown outcome.
  const failed = payload?.error?.payment_intent
  if (payload?.error?.type === 'card_error' && failed?.id) return { ...failed, last_payment_error: failed.last_payment_error || { code: payload.error.code, decline_code: payload.error.decline_code, message: payload.error.message } }
  throw new Error(`Stripe request failed: ${payload?.error?.message ?? response.status}`)
}

export async function handleWebhookFunction() {
  throw new Error('Stripe payments are confirmed from the Checkout session; webhooks are not accepted.')
}
