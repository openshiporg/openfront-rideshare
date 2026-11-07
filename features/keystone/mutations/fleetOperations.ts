import { randomUUID } from 'node:crypto'
import { GraphQLError } from 'graphql'
import { canAccessFleet, currentHumanActor, type FleetCapability } from '../access'
import { assertTransition, COLLECTABLE_FARE_TRIP_STATUSES } from '../domain/lifecycles'

// Day-to-day operator commands that the closed generic CRUD can't express: staff seats, driver
// time off, safety and support triage, review moderation, and settling manual (cash / card on
// pickup) payments. Each one resolves the record's fleet and checks the actor's capability there.

const fail = (message: string): never => { throw new GraphQLError(message, { extensions: { code: 'RIDESHARE_OPERATION_INVALID' } }) }
const oneOf = <T extends string>(value: unknown, options: readonly T[], label: string): T => {
  if (!options.includes(value as T)) fail(`${label} must be one of: ${options.join(', ').replaceAll('_', ' ')}.`)
  return value as T
}
async function requireActor(context: any) {
  const actor = await currentHumanActor(context.prisma, context.session)
  if (!actor) fail('Sign in to continue.')
  return actor!
}
async function requireFleet(context: any, fleetId: unknown, capability: FleetCapability) {
  if (typeof fleetId !== 'string' || !fleetId || !await canAccessFleet(context, context.session, fleetId, capability)) fail('Not found or outside your access.')
  return fleetId as string
}

const MEMBER_ROLES = ['owner', 'dispatcher', 'support', 'finance', 'viewer'] as const

export async function addFleetMember(_root: unknown, args: { fleetId: string; email: string; role: string }, context: any) {
  await requireActor(context)
  const fleetId = await requireFleet(context, args.fleetId, 'fleetAdmin')
  const role = oneOf(args.role, MEMBER_ROLES, 'Role')
  const email = String(args.email || '').trim().toLowerCase()
  if (!email || email.length > 200) fail('Email is required.')
  const user = await context.prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) fail('No account uses that email. They sign up or are added under People first.')
  const existing = await context.prisma.fleetMembership.findFirst({ where: { fleetId, userId: user.id }, select: { id: true } })
  if (existing) fail('That person is already on this fleet.')
  // One seat per person per fleet is a unique index (FleetMembership_fleet_user_key); a double submit loses here.
  try {
    return await context.prisma.fleetMembership.create({ data: { fleetId, userId: user.id, role, status: 'active', invitedAt: new Date(), acceptedAt: new Date() }, select: { id: true, role: true, status: true } })
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') fail('That person is already on this fleet.')
    throw error
  }
}

export async function updateFleetMember(_root: unknown, args: { membershipId: string; role?: string | null; status?: string | null }, context: any) {
  const actor = await requireActor(context)
  const membership = await context.prisma.fleetMembership.findUnique({ where: { id: args.membershipId }, select: { id: true, fleetId: true, userId: true, role: true, status: true } })
  const fleetId = await requireFleet(context, membership?.fleetId, 'fleetAdmin')
  const role = args.role ? oneOf(args.role, MEMBER_ROLES, 'Role') : membership!.role
  const status = args.status ? oneOf(args.status, ['active', 'suspended'] as const, 'Status') : membership!.status
  if (membership!.userId === actor.id && (role !== 'owner' || status !== 'active')) fail('You can’t remove your own owner access.')
  // Owner changes on one fleet run one at a time, so two owners demoting each other can't both pass the count.
  return context.prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fleet-owners:${fleetId}`}, 0))::text IS NOT NULL`
    const live = await tx.fleetMembership.findUnique({ where: { id: membership!.id }, select: { role: true, status: true } })
    if (live?.role === 'owner' && live.status === 'active' && (role !== 'owner' || status !== 'active')) {
      const owners = await tx.fleetMembership.count({ where: { fleetId, role: 'owner', status: 'active' } })
      if (owners <= 1) fail('A fleet needs at least one active owner.')
    }
    return tx.fleetMembership.update({ where: { id: membership!.id }, data: { role, status }, select: { id: true, role: true, status: true } })
  })
}

export async function addDriverTimeOff(_root: unknown, args: { driverId: string; startsAt: string; endsAt: string; kind?: string | null; reason?: string | null }, context: any) {
  await requireActor(context)
  const driver = await context.prisma.driverProfile.findUnique({ where: { id: args.driverId }, select: { id: true, fleetId: true } })
  await requireFleet(context, driver?.fleetId, 'operations')
  const startsAt = new Date(args.startsAt), endsAt = new Date(args.endsAt)
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) fail('Choose an end after the start.')
  if (endsAt.getTime() - startsAt.getTime() > 366 * 864e5) fail('Time off can be at most a year.')
  const kind = args.kind ? oneOf(args.kind, ['blocked', 'available'] as const, 'Type') : 'blocked'
  return context.prisma.availabilityException.create({ data: { driverId: driver!.id, startsAt, endsAt, kind, reason: String(args.reason || '').trim().slice(0, 200) }, select: { id: true } })
}

export async function removeDriverTimeOff(_root: unknown, args: { exceptionId: string }, context: any) {
  await requireActor(context)
  const exception = await context.prisma.availabilityException.findUnique({ where: { id: args.exceptionId }, select: { id: true, driver: { select: { fleetId: true } } } })
  await requireFleet(context, exception?.driver?.fleetId, 'operations')
  await context.prisma.availabilityException.delete({ where: { id: exception!.id } })
  return { id: exception!.id, removed: true }
}

export async function updateSafetyIncident(_root: unknown, args: { incidentId: string; status?: string | null; assignToMe?: boolean | null }, context: any) {
  const actor = await requireActor(context)
  const incident = await context.prisma.safetyIncident.findUnique({ where: { id: args.incidentId }, select: { id: true, status: true, trip: { select: { fleetId: true } } } })
  await requireFleet(context, incident?.trip?.fleetId, 'safety')
  const data: Record<string, unknown> = {}
  if (args.status) {
    assertTransition('incident', incident!.status || 'open', args.status, 'incident')
    data.status = args.status
    if (args.status === 'resolved') data.resolvedAt = new Date()
  }
  if (args.assignToMe) data.assignedToId = actor.id
  if (!Object.keys(data).length) fail('Nothing to change.')
  const guarded = await context.prisma.safetyIncident.updateMany({ where: { id: incident!.id, status: incident!.status }, data })
  if (guarded.count !== 1) fail('This incident changed. Reload and try again.')
  return context.prisma.safetyIncident.findUnique({ where: { id: incident!.id }, select: { id: true, status: true } })
}

export async function updateSupportCase(_root: unknown, args: { caseId: string; status?: string | null; assignToMe?: boolean | null }, context: any) {
  const actor = await requireActor(context)
  const supportCase = await context.prisma.supportCase.findUnique({ where: { id: args.caseId }, select: { id: true, status: true, trip: { select: { fleetId: true } } } })
  await requireFleet(context, supportCase?.trip?.fleetId, 'safety')
  const data: Record<string, unknown> = {}
  if (args.status) {
    assertTransition('supportCase', supportCase!.status || 'open', args.status, 'case')
    data.status = args.status
    if (args.status === 'resolved') data.resolvedAt = new Date()
  }
  if (args.assignToMe) data.assignedToId = actor.id
  if (!Object.keys(data).length) fail('Nothing to change.')
  const guarded = await context.prisma.supportCase.updateMany({ where: { id: supportCase!.id, status: supportCase!.status }, data })
  if (guarded.count !== 1) fail('This case changed. Reload and try again.')
  return context.prisma.supportCase.findUnique({ where: { id: supportCase!.id }, select: { id: true, status: true } })
}

export async function moderateReview(_root: unknown, args: { reviewId: string; status: string; reason?: string | null }, context: any) {
  await requireActor(context)
  const review = await context.prisma.review.findUnique({ where: { id: args.reviewId }, select: { id: true, status: true, trip: { select: { fleetId: true } } } })
  await requireFleet(context, review?.trip?.fleetId, 'safety')
  const status = oneOf(args.status, ['published', 'hidden', 'removed'] as const, 'Status')
  assertTransition('review', review!.status || 'pending', status, 'review')
  const moved = await context.prisma.review.updateMany({ where: { id: review!.id, status: review!.status }, data: { status, moderatedAt: new Date(), moderationReason: String(args.reason || '').trim().slice(0, 500) } })
  if (moved.count !== 1) fail('This review changed. Reload and try again.')
  return { id: review!.id, status }
}

/** Manual adapter only: the operator confirms the rider paid in person (cash or card terminal). */
export async function confirmManualPayment(_root: unknown, args: { paymentId: string; method?: string | null }, context: any) {
  const actor = await requireActor(context)
  const payment = await context.prisma.payment.findUnique({ where: { id: args.paymentId }, select: { id: true, status: true, purpose: true, amountMinor: true, currencyCode: true, tripId: true, provider: { select: { code: true } }, trip: { select: { fleetId: true, status: true } } } })
  await requireFleet(context, payment?.trip?.fleetId, 'finance')
  if (payment!.provider?.code !== 'pp_manual') fail('Only manual payments are confirmed here.')
  // A fare is only collected for a ride that is under way or done; a cancelled or no-show trip owes its fee, not its fare.
  if ((payment!.purpose || 'fare') === 'fare' && !(COLLECTABLE_FARE_TRIP_STATUSES as readonly string[]).includes(payment!.trip?.status || '')) fail('This ride was cancelled, so its fare can’t be collected.')
  if (payment!.status !== 'pending' && payment!.status !== 'authorized') fail(`This payment is already ${String(payment!.status).replaceAll('_', ' ')}.`)
  const method = args.method ? oneOf(args.method, ['cash', 'card_terminal', 'bank_transfer', 'other'] as const, 'Method') : 'cash'
  return context.prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${payment!.id}`}, 0))::text IS NOT NULL`
    const updated = await tx.payment.updateMany({ where: { id: payment!.id, status: { in: ['pending', 'authorized'] } }, data: { status: 'captured', capturedAt: new Date() } })
    if (updated.count !== 1) fail('This payment changed. Reload and try again.')
    await tx.paymentObservation.create({ data: { paymentId: payment!.id, observationKey: randomUUID(), details: { phase: 'captured', source: 'operator_confirmation', method, actorId: actor.id, amountMinor: payment!.amountMinor, currencyCode: payment!.currencyCode, observedAt: new Date().toISOString() } } })
    await tx.ledgerEntry.create({ data: { tripId: payment!.tripId, paymentId: payment!.id, entryKey: `payment:${payment!.id}:captured`, kind: 'rider_charge', account: 'rider_receivable', direction: 'credit', amountMinor: payment!.amountMinor, currencyCode: payment!.currencyCode, memo: `Received by ${method.replaceAll('_', ' ')}`, metadata: { actorId: actor.id } } })
    return { id: payment!.id, status: 'captured' }
  })
}

/** Manual adapter only: the operator confirms money was handed back. */
export async function confirmManualRefund(_root: unknown, args: { refundId: string }, context: any) {
  const actor = await requireActor(context)
  const refund = await context.prisma.refund.findUnique({ where: { id: args.refundId }, select: { id: true, status: true, amountMinor: true, currencyCode: true, payment: { select: { id: true, tripId: true, amountMinor: true, status: true, provider: { select: { code: true } }, trip: { select: { fleetId: true } } } } } })
  await requireFleet(context, refund?.payment?.trip?.fleetId, 'finance')
  if (refund!.payment?.provider?.code !== 'pp_manual') fail('Only manual refunds are confirmed here.')
  if (!['requested', 'processing'].includes(refund!.status || '')) fail(`This refund is already ${String(refund!.status).replaceAll('_', ' ')}.`)
  return context.prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${refund!.payment!.id}`}, 0))::text IS NOT NULL`
    const updated = await tx.refund.updateMany({ where: { id: refund!.id, status: { in: ['requested', 'processing'] } }, data: { status: 'succeeded', processedAt: new Date() } })
    if (updated.count !== 1) fail('This refund changed. Reload and try again.')
    const refunded = await tx.refund.aggregate({ where: { paymentId: refund!.payment!.id, status: 'succeeded' }, _sum: { amountMinor: true } })
    const currentPayment = await tx.payment.findUnique({ where: { id: refund!.payment!.id }, select: { status: true, amountMinor: true } })
    const nextPayment = (refunded._sum.amountMinor || 0) >= (currentPayment?.amountMinor || 0) ? 'refunded' : 'partially_refunded'
    if ((refunded._sum.amountMinor || 0) > (currentPayment?.amountMinor || 0)) fail('Refunds would exceed what was paid. Reconcile before marking this refunded.')
    assertTransition('payment', currentPayment?.status, nextPayment, 'payment')
    await tx.payment.update({ where: { id: refund!.payment!.id }, data: { status: nextPayment } })
    await tx.paymentObservation.create({ data: { paymentId: refund!.payment!.id, refundId: refund!.id, observationKey: randomUUID(), details: { phase: 'refunded', source: 'operator_confirmation', actorId: actor.id, amountMinor: refund!.amountMinor, observedAt: new Date().toISOString() } } })
    await tx.ledgerEntry.create({ data: { tripId: refund!.payment!.tripId, paymentId: refund!.payment!.id, entryKey: `refund:${refund!.id}:succeeded`, kind: 'refund', account: 'rider_receivable', direction: 'debit', amountMinor: refund!.amountMinor, currencyCode: refund!.currencyCode, memo: 'Refund handed back', metadata: { actorId: actor.id } } })
    return { id: refund!.id, status: 'succeeded' }
  })
}
