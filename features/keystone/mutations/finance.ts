import type { PrismaClient } from '@prisma/client'
import { humanSessionId } from '../access'
import { authorizedTripHeader, sameTripAuthority, tripAuthorityWhere } from '../domain/tripAuthority'
import { executePaymentAdapter } from '../utils/paymentProviderAdapter'
import { isDeepStrictEqual } from 'node:util'
import { fenceHumanAuthority } from '../domain/authorityFence'
import { commandBodyHash } from '../domain/commandBinding'
import { currencyDigits, validMinor } from '../../lib/currency'
import { randomUUID } from 'node:crypto'
import { requireFleetOperations } from '../domain/operationalReadiness'

function requireIdempotencyKey(value: unknown) {
  const key = String(value || '').trim()
  if (key.length < 12 || key.length > 200) throw new Error('A stable idempotency key of 12–200 characters is required.')
  return key
}

async function appendObservation(prisma: any, paymentId: string, observation: Record<string, unknown>) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${paymentId}`}, 0))::text IS NOT NULL`
    const payment = await tx.payment.findUnique({ where: { id: paymentId } })
    if (!payment) throw new Error('Original payment evidence is unavailable.')
    // The attempt correlation remains stable, but each actual observation has
    // its own identity. UNKNOWN must never overwrite a later observed result.
    return tx.paymentObservation.create({ data: { paymentId, refundId: observation.refundId || null, observationKey: randomUUID(), details: observation } })
  }, { isolationLevel: 'Serializable' })
}

function moneySnapshot(value: any) {
  const quote = value?.quote && typeof value.quote === 'object' ? value.quote : {}
  const fare = quote.fare && typeof quote.fare === 'object' ? quote.fare : {}
  const amount = quote.totalMinor ?? fare.totalMinor
  const currency = quote.currencyCode ?? fare.currencyCode
  if (typeof currency !== 'string') throw new Error('Trip currency evidence is unavailable.')
  currencyDigits(currency)
  if (!validMinor(amount) || amount <= 0) throw new Error('Trip does not have a payable fare snapshot.')
  return { amount, currency }
}

export async function initiateTripPayment(_root: unknown, args: { tripId: string; providerCode: string; idempotencyKey: string }, context: any) {
  if (!humanSessionId(context.session)) throw new Error('Authentication is required.')
  const idempotencyKey = requireIdempotencyKey(args.idempotencyKey)
  const prisma = context.prisma as PrismaClient
  const preflight = await prisma.$transaction(async tx => {
    const authority = await authorizedTripHeader(tx, context.session, args.tripId, 'riderOrOperator', 'finance')
    if (!authority?.bound) throw new Error('Trip not found.')
    const trip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), select: { id: true, status: true, rider: { select: { id: true } }, fleet: { select: { id: true } }, bookingSnapshot: true } })
    if (!trip) throw new Error('Trip not found.')
    return { trip, header: authority.header }
  }, { isolationLevel: 'RepeatableRead' })
  const trip = preflight.trip
  await requireFleetOperations(prisma, trip.fleet?.id)
  const sudo = context.sudo()
  if (!['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress', 'completed'].includes(trip.status || '')) throw new Error('Trip is not in a payable state.')
  const { amount, currency } = moneySnapshot(trip.bookingSnapshot)
  const provider = await sudo.query.PaymentProvider.findOne({ where: { code: args.providerCode }, query: 'id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction handleWebhookFunction' })
  if (!provider || provider.isInstalled !== 'yes') throw new Error('Payment provider is unavailable.')

  const reservation = await prisma.$transaction(async tx => {
    const lockKey = `payment-init:${trip.id}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text IS NOT NULL`
    await fenceHumanAuthority(tx, context.session, preflight.header.fleetId)
    const authority = await authorizedTripHeader(tx, context.session, trip.id, 'riderOrOperator', 'finance')
    if (!authority?.bound || !sameTripAuthority(authority.header, preflight.header)) throw new Error('Trip payment authority or assignment changed; reconciliation is required.')
    const currentTrip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), select: { status: true, bookingSnapshot: true } })
    if (!currentTrip || !['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress', 'completed'].includes(currentTrip.status || '')) throw new Error('Trip is not in a payable state.')
    const currentMoney = moneySnapshot(currentTrip.bookingSnapshot)
    if (currentMoney.amount !== amount || currentMoney.currency !== currency) throw new Error('Accepted payment economics changed; reconciliation is required.')
    const replay = await tx.payment.findUnique({ where: { idempotencyKey } })
    const command = { version: 1, purpose: 'payment_initiation', actorId: context.session.itemId, assignment: authority.header, body: { tripId: args.tripId, providerCode: args.providerCode, amountMinor: amount, currencyCode: currency } }
    if (replay) {
      const evidence = replay.providerEvidence as Record<string, unknown> | null
      if (replay.tripId !== trip.id || replay.providerId !== provider.id || replay.amountMinor !== amount || replay.currencyCode !== currency || !isDeepStrictEqual(evidence?.command, command)) throw new Error('Idempotency key belongs to a different payment intent or original binding is unavailable.')
      return { payment: replay, shouldExecute: false }
    }
    const active = await tx.payment.findFirst({ where: { tripId: trip.id, status: { in: ['pending', 'authorized', 'captured', 'partially_refunded'] } } })
    if (active) throw new Error('A payment attempt already exists for this trip. Reconciliation is required before another attempt.')
    const payment = await tx.payment.create({ data: {
      tripId: trip.id, providerId: provider.id, amountMinor: amount, currencyCode: currency, status: 'pending',
      idempotencyKey, providerEvidence: { command, providerSnapshot: { ...provider }, phase: 'intent_recorded', adapter: provider.createPaymentFunction, disclosure: 'No money movement has been verified.' },
    } })
    return { payment, shouldExecute: true }
  }, { isolationLevel: 'Serializable' })
  if (!reservation.shouldExecute) return reservation.payment

  let evidence: any
  try {
    evidence = await executePaymentAdapter({ provider, functionName: 'createPaymentFunction', args: { trip, amount, currency, idempotencyKey } })
  } catch {
    await appendObservation(prisma, reservation.payment.id, { observationId: `${reservation.payment.id}:create`, providerId: provider.id, amountMinor: amount, currencyCode: currency, phase: 'outcome_indeterminate', observedAt: new Date().toISOString() })
    throw new Error('Payment outcome is indeterminate. The durable intent was retained for reconciliation; do not submit a new key.')
  }
  await appendObservation(prisma, reservation.payment.id, { observationId: `${reservation.payment.id}:create`, providerId: provider.id, amountMinor: amount, currencyCode: currency, phase: 'pending', externalId: String(evidence.externalId || '').slice(0, 200), observedAt: new Date().toISOString() })
  return prisma.payment.update({ where: { id: reservation.payment.id }, data: {
    status: 'pending',
    providerReference: String(evidence.externalId || ''),
  } })
}

export async function requestTripRefund(_root: unknown, args: { paymentId: string; amountMinor: number; reason?: string | null; idempotencyKey: string }, context: any) {
  if (!humanSessionId(context.session)) throw new Error('Authentication is required.')
  const idempotencyKey = requireIdempotencyKey(args.idempotencyKey)
  const amount = Number(args.amountMinor)
  if (!validMinor(amount) || amount <= 0) throw new Error('Refund amount must be a positive integer in minor currency units.')
  const reason = args.reason ?? ''
  if (typeof reason !== 'string' || reason.length > 500) throw new Error('Refund reason is invalid.')
  const prisma = context.prisma as PrismaClient
  const preflight = await prisma.$transaction(async tx => {
    const paymentHeader = await tx.payment.findUnique({ where: { id: args.paymentId }, select: { id: true, tripId: true } })
    const authority = paymentHeader?.tripId ? await authorizedTripHeader(tx, context.session, paymentHeader.tripId, 'operator', 'finance') : null
    if (!authority?.bound) throw new Error('Payment is not refundable.')
    const payment = await tx.payment.findFirst({ where: { id: args.paymentId, tripId: authority.header.id }, select: { id: true, amountMinor: true, currencyCode: true, status: true, providerReference: true, providerEvidence: true, provider: { select: { id: true, code: true, isInstalled: true, refundPaymentFunction: true } } } })
    if (!payment) throw new Error('Payment is not refundable.')
    return { payment, header: authority.header }
  }, { isolationLevel: 'RepeatableRead' })
  await requireFleetOperations(prisma, preflight.header.fleetId)
  const payment = preflight.payment
  if (!['captured', 'partially_refunded'].includes(payment.status || '')) throw new Error('Payment is not refundable.')
  const provider = payment.provider
  if (!provider || provider.isInstalled !== 'yes' || payment.amountMinor == null || payment.amountMinor <= 0 || !/^[A-Z]{3}$/.test(payment.currencyCode || '')) throw new Error('Payment evidence is incomplete and requires manual review.')

  const reservation = await prisma.$transaction(async tx => {
    const lockKey = `payment:${payment.id}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text IS NOT NULL`
    await fenceHumanAuthority(tx, context.session, preflight.header.fleetId)
    const authority = await authorizedTripHeader(tx, context.session, preflight.header.id, 'operator', 'finance')
    if (!authority?.bound || !sameTripAuthority(authority.header, preflight.header)) throw new Error('Refund authority or assignment changed; reconciliation is required.')
    const paymentHeader = await tx.payment.findUnique({ where: { id: payment.id }, select: { id: true, tripId: true, providerId: true } })
    if (paymentHeader?.tripId !== authority.header.id || paymentHeader.providerId !== payment.provider?.id) throw new Error('Refund payment binding changed; reconciliation is required.')
    const replay = await tx.refund.findUnique({ where: { idempotencyKey } })
    const commandBinding = { version: 1, purpose: 'payment_refund', actorId: context.session.itemId, assignment: authority.header, bodyHash: commandBodyHash({ paymentId: args.paymentId, amountMinor: amount, reason }) }
    const priorCommand = await tx.tripEvent.findUnique({ where: { idempotencyKey } })
    if (replay) {
      if (replay.paymentId !== payment.id || replay.amountMinor !== amount || !isDeepStrictEqual((priorCommand?.metadata as any)?.commandBinding, commandBinding)) throw new Error('Idempotency key belongs to a different refund command or original binding is unavailable.')
      return { refund: replay, shouldExecute: false }
    }
    const currentPayment = await tx.payment.findUnique({ where: { id: payment.id } })
    if (!currentPayment || !['captured', 'partially_refunded'].includes(currentPayment.status || '')) throw new Error('Payment is no longer refundable.')
    const reservedRefunds = await tx.refund.aggregate({ where: { paymentId: payment.id, status: { in: ['requested', 'processing', 'succeeded'] } }, _sum: { amountMinor: true } })
    const alreadyReserved = reservedRefunds._sum.amountMinor || 0
    if (currentPayment.amountMinor == null || amount > currentPayment.amountMinor - alreadyReserved) throw new Error('Refund amount exceeds the available balance after pending reservations.')
    const refund = await tx.refund.create({ data: {
      paymentId: payment.id, providerId: provider.id, amountMinor: amount, currencyCode: payment.currencyCode,
      reason, status: 'processing', idempotencyKey,
    } })
    await tx.tripEvent.create({ data: { tripId: authority.header.id, eventType: 'finance.refund_reserved', actorType: 'operator', actorUserId: context.session.itemId, idempotencyKey, occurredAt: new Date(), metadata: { commandBinding, refundId: refund.id, providerId: provider.id } } })
    return { refund, shouldExecute: true }
  }, { isolationLevel: 'Serializable' })
  if (!reservation.shouldExecute) return reservation.refund

  let evidence: any
  try {
    evidence = await executePaymentAdapter({ provider, functionName: 'refundPaymentFunction', args: { paymentId: payment.providerReference, amount, currency: payment.currencyCode, idempotencyKey } })
  } catch {
    await appendObservation(prisma, payment.id, { observationId: `${reservation.refund.id}:result`, refundId: reservation.refund.id, providerId: provider.id, amountMinor: amount, currencyCode: payment.currencyCode, phase: 'outcome_indeterminate', observedAt: new Date().toISOString() })
    throw new Error('Refund outcome is indeterminate. Its balance remains reserved pending reconciliation; do not submit a new key.')
  }
  const status = evidence.status === 'succeeded' ? 'succeeded' : 'processing'
  await appendObservation(prisma, payment.id, { observationId: `${reservation.refund.id}:result`, refundId: reservation.refund.id, providerId: provider.id, amountMinor: amount, currencyCode: payment.currencyCode, phase: status, externalId: String(evidence.externalId || '').slice(0, 200), observedAt: new Date().toISOString() })
  return prisma.$transaction(async tx => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${payment.id}`}, 0))::text IS NOT NULL`
  const original = await tx.refund.findUnique({ where: { id: reservation.refund.id } })
  if (!original || original.paymentId !== payment.id || original.providerId !== provider.id || original.idempotencyKey !== idempotencyKey) throw new Error('Original refund binding is unavailable.')
  if (original.status === 'succeeded') return original
  const refund = await tx.refund.update({ where: { id: original.id }, data: {
    status, providerReference: String(evidence.externalId || ''),
    processedAt: status === 'succeeded' ? new Date() : null,
  } })
  if (status === 'succeeded') {
    const current = await tx.payment.findUnique({ where: { id: payment.id } })
    const totalSucceeded = await tx.refund.aggregate({ where: { paymentId: payment.id, status: 'succeeded' }, _sum: { amountMinor: true } })
    if (!current || current.amountMinor == null || (totalSucceeded._sum.amountMinor || 0) > current.amountMinor) throw new Error('Refund evidence exceeds original tender; reconciliation is required.')
    await tx.payment.update({ where: { id: payment.id }, data: { status: (totalSucceeded._sum.amountMinor || 0) === current.amountMinor ? 'refunded' : 'partially_refunded' } })
  }
  return refund
  }, { isolationLevel: 'Serializable' })
}
