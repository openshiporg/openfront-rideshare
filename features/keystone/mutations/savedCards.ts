import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { currentHumanActor } from '../access'
import { authorizedTripHeader } from '../domain/tripAuthority'
import { requestBaseUrl } from './onboarding'
import { chargeSavedCard, createCardSetupSession, createStripeCustomer, detachPaymentMethod, retrievePaymentIntent, retrieveSetupSession, stripeSecretKey, type StripeCard, type StripePaymentIntent } from '../../integrations/payment/stripe'

// A rider's card on file. Saved once through Stripe Checkout in setup mode (a SetupIntent; Stripe runs any
// 3-D Secure step), then the fare is charged off-session when the trip completes and the cancellation or
// no-show fee when one is due. Each charge is a Payment row: `attempts` counts tries, `failureCode` and
// `failureMessage` keep the last decline, and an operator can retry a failed charge from the trip page.
// The Stripe ids never leave the server; riders and operators see the brand and last four only.

const STRIPE_CODE = 'pp_stripe'
const ACTIVE = ['pending', 'authorized', 'captured', 'partially_refunded']
export type ChargePurpose = 'fare' | 'cancellation_fee' | 'no_show_fee'
const MEMO: Record<ChargePurpose, string> = { fare: 'Fare, charged to the saved card', cancellation_fee: 'Cancellation fee, charged to the saved card', no_show_fee: 'No-show fee, charged to the saved card' }

export type SavedCardView = { brand: string; last4: string; expMonth: number | null; expYear: number | null }
const cardView = (profile: any): SavedCardView | null => profile?.cardPaymentMethodId && profile.cardLast4 ? { brand: profile.cardBrand || 'card', last4: profile.cardLast4, expMonth: profile.cardExpMonth ?? null, expYear: profile.cardExpYear ?? null } : null

export async function stripeEnabled(prisma: PrismaClient) {
  if (!stripeSecretKey()) return false
  const provider = await prisma.paymentProvider.findUnique({ where: { code: STRIPE_CODE }, select: { isInstalled: true, createPaymentFunction: true } })
  return provider?.isInstalled === 'yes' && provider.createPaymentFunction === 'stripe'
}

async function requireRider(context: any) {
  const actor = await currentHumanActor(context.prisma, context.session)
  if (!actor) throw new Error('Sign in to save a card.')
  return actor.id as string
}

export function savedCardFor(prisma: PrismaClient, userId: string | null | undefined) {
  if (!userId) return Promise.resolve(null)
  return prisma.riderProfile.findUnique({ where: { userId }, select: { id: true, stripeCustomerId: true, cardPaymentMethodId: true, cardBrand: true, cardLast4: true, cardExpMonth: true, cardExpYear: true } })
}

/** Relative app paths only, so Checkout can't be turned into an open redirect. */
function returnPath(value: unknown) {
  const path = typeof value === 'string' && /^\/[A-Za-z0-9/_\-.]*$/.test(value) && !value.startsWith('//') ? value : '/account'
  return path.slice(0, 200)
}

export async function riderSavedCard(_root: unknown, _args: unknown, context: any) {
  const actor = await currentHumanActor(context.prisma, context.session)
  const enabled = await stripeEnabled(context.prisma)
  if (!actor) return { enabled, card: null }
  return { enabled, card: cardView(await savedCardFor(context.prisma, actor.id)) }
}

export async function startRiderCardSetup(_root: unknown, args: { returnTo?: string | null }, context: any) {
  const userId = await requireRider(context)
  if (!await stripeEnabled(context.prisma)) throw new Error('Saving a card isn’t available here yet.')
  const origin = requestBaseUrl(context.req)
  if (!origin) throw new Error('Saving a card needs the storefront address.')
  const user = await context.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
  let profile = await savedCardFor(context.prisma, userId)
  let customerId = profile?.stripeCustomerId || ''
  if (!customerId) {
    customerId = (await createStripeCustomer({ email: user?.email, name: user?.name, userId })).id
    await context.prisma.riderProfile.upsert({ where: { userId }, create: { userId, displayName: user?.name || '', stripeCustomerId: customerId }, update: { stripeCustomerId: customerId } })
  }
  const path = returnPath(args.returnTo)
  const join = path.includes('?') ? '&' : '?'
  const session = await createCardSetupSession({ customerId, userId, successUrl: `${origin}${path}${join}card_setup={CHECKOUT_SESSION_ID}`, cancelUrl: `${origin}${path}${join}card_setup=cancelled` })
  if (!session.url) throw new Error('Card setup couldn’t start. Try again in a moment.')
  return { url: session.url }
}

/** Called on the return from Checkout. Verifies the session belongs to this rider before saving the card. */
export async function confirmRiderCardSetup(_root: unknown, args: { sessionId: string }, context: any) {
  const userId = await requireRider(context)
  const profile = await savedCardFor(context.prisma, userId)
  if (!profile?.stripeCustomerId) throw new Error('No card setup is in progress.')
  const session = await retrieveSetupSession(String(args.sessionId || ''))
  const intent = typeof session.setup_intent === 'object' ? session.setup_intent : null
  if (session.mode !== 'setup' || session.metadata?.userId !== userId || session.client_reference_id !== userId || session.customer !== profile.stripeCustomerId) throw new Error('This card setup belongs to another account.')
  if (session.status !== 'complete' || intent?.status !== 'succeeded') return { saved: false, card: cardView(profile) }
  const method = typeof intent.payment_method === 'object' ? intent.payment_method as StripeCard : null
  if (!method?.id || !method.card?.last4) throw new Error('The card couldn’t be read back from Stripe.')
  if (profile.cardPaymentMethodId === method.id) return { saved: true, card: cardView(profile) }
  const previous = profile.cardPaymentMethodId
  const updated = await context.prisma.riderProfile.update({ where: { userId }, data: { cardPaymentMethodId: method.id, cardBrand: method.card.brand || 'card', cardLast4: method.card.last4, cardExpMonth: method.card.exp_month ?? null, cardExpYear: method.card.exp_year ?? null, cardSavedAt: new Date() } })
  if (previous) await detachPaymentMethod(previous).catch(() => { /* the new card is saved; the old one just lingers on the customer */ })
  // A new card settles what the old one couldn't: recent declined charges are tried once on it.
  const declined = await context.prisma.payment.findMany({ where: { status: 'failed', trip: { riderId: userId }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, select: { id: true, tripId: true, purpose: true, providerEvidence: true }, take: 5 })
  for (const payment of declined) {
    if ((payment.providerEvidence as any)?.source !== 'saved_card') continue
    if (await context.prisma.payment.findFirst({ where: { tripId: payment.tripId, purpose: payment.purpose, status: { in: ACTIVE } }, select: { id: true } })) continue
    await attempt(context.prisma, payment.id, updated, true).catch(() => {})
  }
  return { saved: true, card: cardView(updated) }
}

export async function removeRiderCard(_root: unknown, _args: unknown, context: any) {
  const userId = await requireRider(context)
  const profile = await savedCardFor(context.prisma, userId)
  if (!profile?.cardPaymentMethodId) return { removed: false }
  await context.prisma.riderProfile.update({ where: { userId }, data: { cardPaymentMethodId: '', cardBrand: '', cardLast4: '', cardExpMonth: null, cardExpYear: null, cardSavedAt: null } })
  await detachPaymentMethod(profile.cardPaymentMethodId).catch(() => { /* removed here; Stripe cleanup is best effort */ })
  return { removed: true }
}

// ── Charging ──────────────────────────────────────────────────────────────────────────────────────────

type Due = { tripId: string; purpose: ChargePurpose; amountMinor: number; currencyCode: string; key: string }

/** Charges what's due to the rider's saved card. Best effort and idempotent per charge key: it never throws,
 * a decline is recorded as a failed Payment the operator can retry. Returns the payment status or why it skipped. */
export async function chargeDue(prisma: PrismaClient, due: Due) {
  try {
    if (!Number.isSafeInteger(due.amountMinor) || due.amountMinor <= 0 || !/^[A-Z]{3}$/.test(due.currencyCode)) return { skipped: 'nothing_due' }
    if (!await stripeEnabled(prisma)) return { skipped: 'stripe_off' }
    const trip = await prisma.trip.findUnique({ where: { id: due.tripId }, select: { id: true, riderId: true, confirmationCode: true } })
    const profile = await savedCardFor(prisma, trip?.riderId)
    if (!trip || !profile?.cardPaymentMethodId || !profile.stripeCustomerId) return { skipped: 'no_card' }
    const provider = await prisma.paymentProvider.findUnique({ where: { code: STRIPE_CODE }, select: { id: true } })
    const reserved = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-init:${trip.id}`}, 0))::text IS NOT NULL`
      const existing = await tx.payment.findUnique({ where: { idempotencyKey: due.key } })
      if (existing) return { payment: existing, fresh: false }
      // A fare the rider already paid some other way (Checkout, cash) is never charged again.
      if (due.purpose === 'fare' && await tx.payment.findFirst({ where: { tripId: trip.id, purpose: 'fare', status: { in: ACTIVE } }, select: { id: true } })) return null
      const payment = await tx.payment.create({ data: {
        tripId: trip.id, providerId: provider!.id, purpose: due.purpose, amountMinor: due.amountMinor, currencyCode: due.currencyCode, status: 'pending', idempotencyKey: due.key,
        providerEvidence: { source: 'saved_card', phase: 'intent_recorded', card: { brand: profile.cardBrand, last4: profile.cardLast4 }, disclosure: 'No money movement has been verified.' },
      } })
      return { payment, fresh: true }
    }, { isolationLevel: 'Serializable' })
    if (!reserved) return { skipped: 'already_paid' }
    if (!reserved.fresh && reserved.payment.status !== 'pending') return { status: reserved.payment.status, paymentId: reserved.payment.id }
    return await attempt(prisma, reserved.payment.id, profile, false)
  } catch (error) {
    return { skipped: 'error', message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }
  }
}

/** One try against the saved card. `again` starts a new attempt after a failure; otherwise a pending attempt is
 * resent with the same Stripe idempotency key, which returns the first answer instead of charging twice. */
async function attempt(prisma: PrismaClient, paymentId: string, profile: { stripeCustomerId: string | null; cardPaymentMethodId: string | null; cardBrand?: string | null; cardLast4?: string | null }, again: boolean) {
  const claimed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${paymentId}`}, 0))::text IS NOT NULL`
    const payment = await tx.payment.findUnique({ where: { id: paymentId } })
    if (!payment) return null
    if (again ? payment.status !== 'failed' : payment.status !== 'pending') return { payment, run: false }
    const attempts = again || !payment.attempts ? (payment.attempts || 0) + 1 : payment.attempts
    const evidence = (payment.providerEvidence || {}) as Record<string, unknown>
    const updated = await tx.payment.update({ where: { id: paymentId }, data: { status: 'pending', attempts, lastAttemptAt: new Date(), providerEvidence: { ...evidence, card: { brand: profile.cardBrand ?? null, last4: profile.cardLast4 ?? null } } } })
    return { payment: updated, run: true }
  }, { isolationLevel: 'Serializable' })
  if (!claimed) return { skipped: 'missing' }
  if (!claimed.run) return { status: claimed.payment.status, paymentId }
  const payment = claimed.payment
  const trip = payment.tripId ? await prisma.trip.findUnique({ where: { id: payment.tripId }, select: { confirmationCode: true } }) : null
  let intent: StripePaymentIntent
  try {
    intent = await chargeSavedCard({
      customerId: profile.stripeCustomerId!, paymentMethodId: profile.cardPaymentMethodId!, amount: payment.amountMinor!, currency: payment.currencyCode!,
      description: `${MEMO[(payment.purpose || 'fare') as ChargePurpose].split(',')[0]} · ${trip?.confirmationCode || 'ride'}`,
      metadata: { tripId: payment.tripId || '', paymentId: payment.id, purpose: payment.purpose || 'fare' },
      idempotencyKey: `saved-card:${payment.id}:${payment.attempts}`,
    })
  } catch {
    // Unknown outcome: stays pending, and the next try reuses this attempt's key.
    await observe(prisma, payment.id, { phase: 'outcome_indeterminate', attempt: payment.attempts })
    return { status: 'pending', paymentId }
  }
  return settleIntent(prisma, payment, intent)
}

export async function settleIntent(prisma: PrismaClient, payment: any, intent: StripePaymentIntent) {
  const succeeded = intent.status === 'succeeded'
  const processing = intent.status === 'processing'
  const decline = intent.last_payment_error
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${payment.id}`}, 0))::text IS NOT NULL`
    const current = await tx.payment.findUnique({ where: { id: payment.id } })
    if (!current || current.status !== 'pending') return
    if (succeeded) {
      if (intent.amount !== current.amountMinor || intent.currency?.toUpperCase() !== current.currencyCode) throw new Error('Stripe charged a different amount; reconciliation is required.')
      await tx.payment.update({ where: { id: current.id }, data: { status: 'captured', capturedAt: new Date(), providerReference: intent.id, failureCode: '', failureMessage: '' } })
      await tx.ledgerEntry.create({ data: { tripId: current.tripId, paymentId: current.id, entryKey: `payment:${current.id}:captured`, kind: 'rider_charge', account: 'rider_receivable', direction: 'credit', amountMinor: current.amountMinor, currencyCode: current.currencyCode, memo: MEMO[(current.purpose || 'fare') as ChargePurpose], metadata: { paymentIntentId: intent.id, attempt: current.attempts } } })
    } else if (!processing) {
      await tx.payment.update({ where: { id: current.id }, data: { status: 'failed', providerReference: intent.id, failureCode: String(decline?.decline_code || decline?.code || intent.status).slice(0, 80), failureMessage: String(decline?.message || 'The card was not charged.').slice(0, 300) } })
    } else {
      await tx.payment.update({ where: { id: current.id }, data: { providerReference: intent.id } })
    }
    await tx.paymentObservation.create({ data: { paymentId: current.id, observationKey: randomUUID(), details: { phase: succeeded ? 'captured' : processing ? 'processing' : 'failed', source: 'saved_card', paymentIntentId: intent.id, attempt: current.attempts, failureCode: decline?.decline_code || decline?.code || null, amountMinor: current.amountMinor, currencyCode: current.currencyCode, observedAt: new Date().toISOString() } } })
  }, { isolationLevel: 'Serializable' })
  return { status: succeeded ? 'captured' : processing ? 'pending' : 'failed', paymentId: payment.id }
}

async function observe(prisma: PrismaClient, paymentId: string, details: Record<string, unknown>) {
  await prisma.paymentObservation.create({ data: { paymentId, observationKey: randomUUID(), details: { source: 'saved_card', observedAt: new Date().toISOString(), ...details } } }).catch(() => {})
}

/** Operator retry of a failed (or stuck pending) saved-card charge, from the trip page. */
export async function retryTripCharge(_root: unknown, args: { paymentId: string }, context: any) {
  const prisma = context.prisma as PrismaClient
  const header = await prisma.payment.findUnique({ where: { id: args.paymentId }, select: { id: true, tripId: true, status: true, providerReference: true, providerEvidence: true, provider: { select: { code: true } } } })
  const authority = header?.tripId ? await authorizedTripHeader(prisma, context.session, header.tripId, 'operator', 'finance') : null
  if (!header || !authority?.operator) throw new Error('Payment not found.')
  if (header.provider?.code !== STRIPE_CODE || (header.providerEvidence as any)?.source !== 'saved_card') throw new Error('Only saved-card charges can be retried here.')
  if (!['failed', 'pending'].includes(header.status || '')) throw new Error('This charge is not waiting for a retry.')
  const trip = await prisma.trip.findUnique({ where: { id: header.tripId! }, select: { riderId: true } })
  const profile = await savedCardFor(prisma, trip?.riderId)
  if (!profile?.cardPaymentMethodId || !profile.stripeCustomerId) throw new Error('The rider has no saved card. Record the payment another way.')
  if (header.status === 'pending' && header.providerReference?.startsWith('pi_')) {
    // A charge Stripe is still processing (or we never heard back from): read its answer first.
    const intent = await retrievePaymentIntent(header.providerReference)
    const payment = await prisma.payment.findUnique({ where: { id: header.id } })
    const result = await settleIntent(prisma, payment, intent)
    return { status: result.status }
  }
  if (header.status === 'failed' && await prisma.payment.findFirst({ where: { tripId: header.tripId, id: { not: header.id }, purpose: (await prisma.payment.findUnique({ where: { id: header.id }, select: { purpose: true } }))?.purpose, status: { in: ACTIVE } }, select: { id: true } })) throw new Error('This charge was already paid another way.')
  const result = await attempt(prisma, header.id, profile, header.status === 'failed')
  return { status: (result as any).status || 'failed' }
}

/** What the rider's ride card shows about a saved-card fare. */
export async function savedCardFare(prisma: PrismaClient, tripId: string, riderId: string | null) {
  const [profile, payment] = await Promise.all([
    savedCardFor(prisma, riderId),
    prisma.payment.findFirst({ where: { tripId, purpose: 'fare' }, orderBy: { createdAt: 'desc' }, select: { status: true, failureMessage: true, providerEvidence: true } }),
  ])
  const source = (payment?.providerEvidence as any)?.source
  return { savedCard: cardView(profile), failure: source === 'saved_card' && payment?.status === 'failed' ? payment.failureMessage || 'The card was declined.' : null }
}
