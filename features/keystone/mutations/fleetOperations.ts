import { randomUUID } from 'node:crypto'
import { GraphQLError } from 'graphql'
import { canAccessFleet, currentHumanActor, type FleetCapability } from '../access'

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
  return context.prisma.fleetMembership.create({ data: { fleetId, userId: user.id, role, status: 'active', invitedAt: new Date(), acceptedAt: new Date() }, select: { id: true, role: true, status: true } })
}

export async function updateFleetMember(_root: unknown, args: { membershipId: string; role?: string | null; status?: string | null }, context: any) {
  const actor = await requireActor(context)
  const membership = await context.prisma.fleetMembership.findUnique({ where: { id: args.membershipId }, select: { id: true, fleetId: true, userId: true, role: true, status: true } })
  const fleetId = await requireFleet(context, membership?.fleetId, 'fleetAdmin')
  const role = args.role ? oneOf(args.role, MEMBER_ROLES, 'Role') : membership!.role
  const status = args.status ? oneOf(args.status, ['active', 'suspended'] as const, 'Status') : membership!.status
  if (membership!.userId === actor.id && (role !== 'owner' || status !== 'active')) fail('You can’t remove your own owner access.')
  if (membership!.role === 'owner' && (role !== 'owner' || status !== 'active')) {
    const owners = await context.prisma.fleetMembership.count({ where: { fleetId, role: 'owner', status: 'active' } })
    if (owners <= 1) fail('A fleet needs at least one active owner.')
  }
  return context.prisma.fleetMembership.update({ where: { id: membership!.id }, data: { role, status }, select: { id: true, role: true, status: true } })
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

const INCIDENT_FLOW: Record<string, string[]> = { open: ['triage', 'investigating', 'resolved'], triage: ['investigating', 'resolved'], investigating: ['resolved'], resolved: ['closed', 'investigating'], closed: [] }
export async function updateSafetyIncident(_root: unknown, args: { incidentId: string; status?: string | null; assignToMe?: boolean | null }, context: any) {
  const actor = await requireActor(context)
  const incident = await context.prisma.safetyIncident.findUnique({ where: { id: args.incidentId }, select: { id: true, status: true, trip: { select: { fleetId: true } } } })
  await requireFleet(context, incident?.trip?.fleetId, 'safety')
  const data: Record<string, unknown> = {}
  if (args.status) {
    if (!(INCIDENT_FLOW[incident!.status || 'open'] || []).includes(args.status)) fail(`A ${incident!.status} incident can’t move to ${args.status}.`)
    data.status = args.status
    if (args.status === 'resolved') data.resolvedAt = new Date()
  }
  if (args.assignToMe) data.assignedToId = actor.id
  if (!Object.keys(data).length) fail('Nothing to change.')
  return context.prisma.safetyIncident.update({ where: { id: incident!.id }, data, select: { id: true, status: true } })
}

const CASE_FLOW: Record<string, string[]> = { open: ['waiting', 'resolved'], waiting: ['open', 'resolved'], resolved: ['closed', 'open'], closed: [] }
export async function updateSupportCase(_root: unknown, args: { caseId: string; status?: string | null; assignToMe?: boolean | null }, context: any) {
  const actor = await requireActor(context)
  const supportCase = await context.prisma.supportCase.findUnique({ where: { id: args.caseId }, select: { id: true, status: true, trip: { select: { fleetId: true } } } })
  await requireFleet(context, supportCase?.trip?.fleetId, 'safety')
  const data: Record<string, unknown> = {}
  if (args.status) {
    if (!(CASE_FLOW[supportCase!.status || 'open'] || []).includes(args.status)) fail(`A ${supportCase!.status} case can’t move to ${args.status}.`)
    data.status = args.status
    if (args.status === 'resolved') data.resolvedAt = new Date()
  }
  if (args.assignToMe) data.assignedToId = actor.id
  if (!Object.keys(data).length) fail('Nothing to change.')
  return context.prisma.supportCase.update({ where: { id: supportCase!.id }, data, select: { id: true, status: true } })
}

export async function moderateReview(_root: unknown, args: { reviewId: string; status: string; reason?: string | null }, context: any) {
  await requireActor(context)
  const review = await context.prisma.review.findUnique({ where: { id: args.reviewId }, select: { id: true, trip: { select: { fleetId: true } } } })
  await requireFleet(context, review?.trip?.fleetId, 'safety')
  const status = oneOf(args.status, ['published', 'hidden', 'removed'] as const, 'Status')
  return context.prisma.review.update({ where: { id: review!.id }, data: { status, moderatedAt: new Date(), moderationReason: String(args.reason || '').trim().slice(0, 500) }, select: { id: true, status: true } })
}

/** Manual adapter only: the operator confirms the rider paid in person (cash or card terminal). */
export async function confirmManualPayment(_root: unknown, args: { paymentId: string; method?: string | null }, context: any) {
  const actor = await requireActor(context)
  const payment = await context.prisma.payment.findUnique({ where: { id: args.paymentId }, select: { id: true, status: true, amountMinor: true, currencyCode: true, tripId: true, provider: { select: { code: true } }, trip: { select: { fleetId: true } } } })
  await requireFleet(context, payment?.trip?.fleetId, 'finance')
  if (payment!.provider?.code !== 'pp_manual') fail('Only manual payments are confirmed here.')
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
  const refund = await context.prisma.refund.findUnique({ where: { id: args.refundId }, select: { id: true, status: true, amountMinor: true, currencyCode: true, payment: { select: { id: true, tripId: true, amountMinor: true, provider: { select: { code: true } }, trip: { select: { fleetId: true } } } } } })
  await requireFleet(context, refund?.payment?.trip?.fleetId, 'finance')
  if (refund!.payment?.provider?.code !== 'pp_manual') fail('Only manual refunds are confirmed here.')
  if (!['requested', 'processing'].includes(refund!.status || '')) fail(`This refund is already ${String(refund!.status).replaceAll('_', ' ')}.`)
  return context.prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment:${refund!.payment!.id}`}, 0))::text IS NOT NULL`
    const updated = await tx.refund.updateMany({ where: { id: refund!.id, status: { in: ['requested', 'processing'] } }, data: { status: 'succeeded', processedAt: new Date() } })
    if (updated.count !== 1) fail('This refund changed. Reload and try again.')
    const refunded = await tx.refund.aggregate({ where: { paymentId: refund!.payment!.id, status: 'succeeded' }, _sum: { amountMinor: true } })
    await tx.payment.update({ where: { id: refund!.payment!.id }, data: { status: (refunded._sum.amountMinor || 0) >= (refund!.payment!.amountMinor || 0) ? 'refunded' : 'partially_refunded' } })
    await tx.paymentObservation.create({ data: { paymentId: refund!.payment!.id, refundId: refund!.id, observationKey: randomUUID(), details: { phase: 'refunded', source: 'operator_confirmation', actorId: actor.id, amountMinor: refund!.amountMinor, observedAt: new Date().toISOString() } } })
    await tx.ledgerEntry.create({ data: { tripId: refund!.payment!.tripId, paymentId: refund!.payment!.id, entryKey: `refund:${refund!.id}:succeeded`, kind: 'refund', account: 'rider_receivable', direction: 'debit', amountMinor: refund!.amountMinor, currencyCode: refund!.currencyCode, memo: 'Refund handed back', metadata: { actorId: actor.id } } })
    return { id: refund!.id, status: 'succeeded' }
  })
}
