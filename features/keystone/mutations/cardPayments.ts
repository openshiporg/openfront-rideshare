import { randomUUID } from 'node:crypto'
import { humanSessionId } from '../access'
import { authorizedTripHeader } from '../domain/tripAuthority'
import { retrieveCheckoutSession, stripeSecretKey, type StripeCheckoutSession } from '../../integrations/payment/stripe'
import { initiateTripPayment, moneySnapshot } from './finance'

// Rider card payment through Stripe Checkout. A fleet turns it on by installing the `pp_stripe` provider (all
// functions `stripe`) with STRIPE_SECRET_KEY on the service. The attempt itself goes through initiateTripPayment,
// so the same authority, payable-state and economics checks apply; the paid Checkout session is then verified
// against the stored attempt before the payment is captured and ledgered.

const STRIPE_CODE = 'pp_stripe'
const PAYABLE = ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress', 'completed']
const ACTIVE = ['pending', 'authorized', 'captured', 'partially_refunded']

type CardPaymentView = { enabled: boolean; payable: boolean; status: string | null; amountMinor: number | null; currencyCode: string | null; url: string | null }

async function stripeProvider(context: any) {
  const provider = await context.sudo().query.PaymentProvider.findOne({ where: { code: STRIPE_CODE }, query: 'id isInstalled createPaymentFunction' })
  return provider?.isInstalled === 'yes' && provider.createPaymentFunction === 'stripe' && stripeSecretKey() ? provider : null
}

async function riderTrip(context: any, tripId: string) {
  if (!humanSessionId(context.session)) throw new Error('Sign in to pay for this ride.')
  const authority = await authorizedTripHeader(context.prisma, context.session, tripId, 'riderOrOperator', 'finance')
  if (!authority) throw new Error('Trip not found.')
  const trip = await context.prisma.trip.findUnique({ where: { id: tripId }, select: { id: true, status: true, confirmationCode: true, bookingSnapshot: true } })
  if (!trip) throw new Error('Trip not found.')
  return { trip, bound: authority.bound }
}

function activePayment(context: any, tripId: string) {
  return context.prisma.payment.findFirst({
    where: { tripId, status: { in: ACTIVE } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, amountMinor: true, currencyCode: true, providerReference: true, tripId: true, provider: { select: { code: true } } },
  })
}

function money(trip: any) {
  try { return moneySnapshot(trip.bookingSnapshot) } catch { return null }
}

async function capture(context: any, payment: any, session: StripeCheckoutSession) {
  const intent = typeof session.payment_intent === 'string' ? { id: session.payment_intent, latest_charge: null } : session.payment_intent
  const charge = intent?.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null
  const card = charge?.payment_method_details?.card
  await context.prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${payment.id}`}, 0))::text IS NOT NULL`
    const updated = await tx.payment.updateMany({ where: { id: payment.id, status: { in: ['pending', 'authorized'] } }, data: { status: 'captured', capturedAt: new Date() } })
    if (updated.count !== 1) return
    await tx.paymentObservation.create({ data: { paymentId: payment.id, observationKey: randomUUID(), details: {
      phase: 'captured', source: 'stripe_checkout', checkoutSessionId: session.id, paymentIntentId: intent?.id ?? null, chargeId: charge?.id ?? null,
      card: card ? { brand: card.brand ?? null, last4: card.last4 ?? null } : null, amountMinor: payment.amountMinor, currencyCode: payment.currencyCode, observedAt: new Date().toISOString(),
    } } })
    await tx.ledgerEntry.create({ data: { tripId: payment.tripId, paymentId: payment.id, entryKey: `payment:${payment.id}:captured`, kind: 'rider_charge', account: 'rider_receivable', direction: 'credit', amountMinor: payment.amountMinor, currencyCode: payment.currencyCode, memo: 'Paid by card online', metadata: { checkoutSessionId: session.id, paymentIntentId: intent?.id ?? null } } })
  }, { isolationLevel: 'Serializable' })
}

async function cancelAttempt(context: any, payment: any, reason: string) {
  await context.prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${payment.id}`}, 0))::text IS NOT NULL`
    const updated = await tx.payment.updateMany({ where: { id: payment.id, status: 'pending' }, data: { status: 'cancelled' } })
    if (updated.count === 1) await tx.paymentObservation.create({ data: { paymentId: payment.id, observationKey: randomUUID(), details: { phase: 'cancelled', source: 'stripe_checkout', reason, observedAt: new Date().toISOString() } } })
  }, { isolationLevel: 'Serializable' })
}

/** Settles a pending card attempt from its Checkout session. Returns the resulting status. */
async function settle(context: any, trip: any, payment: any) {
  const session = await retrieveCheckoutSession(String(payment.providerReference || ''))
  if (session.client_reference_id !== trip.id || session.metadata?.tripId !== trip.id) throw new Error('This payment doesn’t belong to this ride.')
  if (session.payment_status === 'paid') {
    if (session.amount_total !== payment.amountMinor || session.currency?.toUpperCase() !== payment.currencyCode) throw new Error('The paid amount doesn’t match this ride. Contact the fleet.')
    await capture(context, payment, session)
    return { status: 'captured', session }
  }
  if (session.status === 'expired') {
    await cancelAttempt(context, payment, 'checkout_expired')
    return { status: 'cancelled', session }
  }
  return { status: 'pending', session }
}

export async function tripCardPayment(_root: unknown, args: { tripId: string }, context: any): Promise<CardPaymentView> {
  const { trip, bound } = await riderTrip(context, args.tripId)
  const fare = money(trip)
  const enabled = Boolean(await stripeProvider(context))
  const payment = await activePayment(context, trip.id)
  return {
    enabled, payable: enabled && bound && PAYABLE.includes(trip.status || '') && Boolean(fare) && (!payment || (payment.provider?.code === STRIPE_CODE && payment.status === 'pending')),
    status: payment?.status ?? null, amountMinor: payment?.amountMinor ?? fare?.amount ?? null, currencyCode: payment?.currencyCode ?? fare?.currency ?? null, url: null,
  }
}

export async function startTripCardPayment(_root: unknown, args: { tripId: string }, context: any): Promise<CardPaymentView> {
  const { trip } = await riderTrip(context, args.tripId)
  if (!await stripeProvider(context)) throw new Error('Card payment isn’t available for this ride.')
  const existing = await activePayment(context, trip.id)
  if (existing && existing.status !== 'pending') throw new Error('This ride is already paid.')
  if (existing && existing.provider?.code !== STRIPE_CODE) throw new Error('The fleet is collecting this fare directly.')
  if (existing) {
    const settled = await settle(context, trip, existing)
    if (settled.status === 'captured') return { enabled: true, payable: false, status: 'captured', amountMinor: existing.amountMinor, currencyCode: existing.currencyCode, url: null }
    if (settled.status === 'pending' && settled.session.url) return { enabled: true, payable: true, status: 'pending', amountMinor: existing.amountMinor, currencyCode: existing.currencyCode, url: settled.session.url }
    if (settled.status === 'pending') await cancelAttempt(context, existing, 'checkout_unavailable')
  }
  const payment = await initiateTripPayment(null, { tripId: trip.id, providerCode: STRIPE_CODE, idempotencyKey: `card:${trip.id}:${randomUUID()}` }, context)
  const session = await retrieveCheckoutSession(String(payment.providerReference || ''))
  if (!session.url) throw new Error('Card payment couldn’t start. Try again in a moment.')
  return { enabled: true, payable: true, status: 'pending', amountMinor: payment.amountMinor, currencyCode: payment.currencyCode, url: session.url }
}

export async function confirmTripCardPayment(_root: unknown, args: { tripId: string }, context: any): Promise<CardPaymentView> {
  const { trip } = await riderTrip(context, args.tripId)
  const payment = await activePayment(context, trip.id)
  const view = (status: string | null) => ({ enabled: true, payable: status === 'pending', status, amountMinor: payment?.amountMinor ?? null, currencyCode: payment?.currencyCode ?? null, url: null })
  if (!payment || payment.provider?.code !== STRIPE_CODE || payment.status !== 'pending') return view(payment?.status ?? null)
  if (!stripeSecretKey()) throw new Error('Card payment isn’t available for this ride.')
  const settled = await settle(context, trip, payment)
  return view(settled.status)
}
