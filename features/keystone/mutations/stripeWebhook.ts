import type { PrismaClient } from '@prisma/client'
import { capture, cancelAttempt } from './cardPayments'
import { settleIntent } from './savedCards'
import { settleRefund } from './finance'
import type { StripeCheckoutSession, StripePaymentIntent } from '../../integrations/payment/stripe'

/** Applies one verified Stripe event. Every branch goes through a guarded writer (compare-and-set under the payment
 * lock), so a replay does nothing and a late or out-of-order event cannot move captured or refunded money backwards. */
export async function applyStripeEvent(prisma: PrismaClient, event: { id?: string; type?: string; data?: { object?: any } }) {
  const object = event?.data?.object
  if (!event?.type || !object || typeof object !== 'object') return { handled: false, reason: 'malformed' as const }
  const ctx = { prisma }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded' || event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    const session = object as StripeCheckoutSession & { mode?: string }
    if (session.mode && session.mode !== 'payment') return { handled: false, reason: 'not_a_payment' as const }
    const payment = await prisma.payment.findFirst({ where: { providerReference: session.id, provider: { is: { code: 'pp_stripe' } } }, select: { id: true, tripId: true, status: true, amountMinor: true, currencyCode: true } })
    if (!payment) return { handled: false, reason: 'unknown_payment' as const }
    if (session.client_reference_id !== payment.tripId) return { handled: false, reason: 'trip_mismatch' as const }
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      await cancelAttempt(ctx, payment, event.type === 'checkout.session.expired' ? 'checkout_expired' : 'async_payment_failed')
      return { handled: true, paymentId: payment.id }
    }
    if (session.payment_status !== 'paid') return { handled: true, paymentId: payment.id, reason: 'not_paid_yet' as const }
    if (session.amount_total !== payment.amountMinor || session.currency?.toUpperCase() !== payment.currencyCode) return { handled: false, reason: 'amount_mismatch' as const }
    await capture(ctx, payment, session)
    return { handled: true, paymentId: payment.id }
  }

  if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    const intent = object as StripePaymentIntent
    const payment = await prisma.payment.findFirst({ where: { providerReference: intent.id, provider: { is: { code: 'pp_stripe' } } }, select: { id: true, tripId: true, status: true, amountMinor: true, currencyCode: true, attempts: true, purpose: true } })
    if (!payment) return { handled: false, reason: 'unknown_payment' as const }
    await settleIntent(prisma, payment, intent)
    return { handled: true, paymentId: payment.id }
  }

  if (event.type === 'refund.updated' || event.type === 'refund.failed' || event.type === 'charge.refund.updated') {
    const status = object.status === 'succeeded' ? 'succeeded' : object.status === 'failed' ? 'failed' : object.status === 'canceled' ? 'cancelled' : null
    if (!status || typeof object.id !== 'string') return { handled: true, reason: 'not_final' as const }
    const refund = await prisma.refund.findFirst({ where: { providerReference: object.id }, select: { id: true } })
    if (!refund) return { handled: false, reason: 'unknown_refund' as const }
    const result = await settleRefund(prisma, { refundId: refund.id, status, externalId: object.id, source: 'stripe_webhook' })
    return { handled: true, refundId: refund.id, settled: result.settled }
  }

  return { handled: false, reason: 'ignored_type' as const }
}
