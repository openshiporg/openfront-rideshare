import { NextRequest, NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'
import { stripeWebhookSecret, verifyStripeSignature } from '@/features/integrations/payment/stripeSignature'
import { applyStripeEvent } from '@/features/keystone/mutations/stripeWebhook'

// Stripe → fleet payments. The signature is checked against the raw body before anything is parsed or read.
// Handling is idempotent: Stripe retries on any non-2xx, and every write is a guarded compare-and-set.
export async function POST(request: NextRequest) {
  const secret = stripeWebhookSecret()
  if (!secret) return NextResponse.json({ error: 'Stripe webhooks are not configured.' }, { status: 503 })
  if (Number(request.headers.get('content-length') || 0) > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  if (!verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), secret)) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  let event: any
  try { event = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 }) }
  try {
    const result = await applyStripeEvent((keystoneContext as any).prisma, event)
    return NextResponse.json({ received: true, ...result }, { status: 200 })
  } catch (error) {
    // A transient failure (lock, serialization) is retried by Stripe.
    console.error('Stripe webhook failed:', event?.id, error instanceof Error ? error.message : 'unknown')
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
