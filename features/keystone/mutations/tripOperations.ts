import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { KeystoneContext } from '@keystone-6/core/types'
import { isDeepStrictEqual } from 'node:util'
import { canAccessFleet, currentHumanActor, humanSessionId, type FleetCapability } from '../access'
import { authorizedTripHeader, sameTripAuthority, tripAuthoritySelect, tripAuthorityWhere, type TripPurpose, type TripAuthorityReader } from '../domain/tripAuthority'
import { ownsRequest } from '../domain/requestReceipt'
import { refreshDriverPresentDispatchStatus } from '../domain/driverDispatchPresence'
import { requireAcceptedQuoteFee } from '../domain/tripEconomics'
import { fenceHumanAuthority } from '../domain/authorityFence'
import { commandBodyHash, requireCommandKey } from '../domain/commandBinding'
import { authorizedRequestHeader, requestOwnerWhere } from '../domain/requestAuthority'

const createReviewBodyHash = (body: string) => createHash('sha256').update(body).digest('hex')

async function loadAuthorizedTrip(context: { prisma: TripAuthorityReader; session?: Parameters<typeof humanSessionId>[0] }, args: { tripId: string }, capability: FleetCapability = 'operations', purpose: TripPurpose = 'participant') {
  if (!humanSessionId(context.session)) throw new Error('Trip not found.')
  const authority = await authorizedTripHeader(context.prisma, context.session, args.tripId, purpose, capability)
  if (!authority) throw new Error(purpose === 'reviewParticipant' ? 'Only the assigned rider or driver may submit a review.' : 'Trip not found.')
  if (!authority.bound) throw new Error('Trip binding is unavailable; reconcile the retained trip.')
  const trip = await context.prisma.trip.findFirst({ where: tripAuthorityWhere(authority.header), select: {
    ...tripAuthoritySelect, confirmationCode: true, status: true, bookingSnapshot: true,
    rider: { select: { id: true } }, driver: { select: { id: true, status: true, fleet: { select: { id: true } }, user: { select: { id: true } } } },
    vehicle: { select: { id: true } }, fleet: { select: { id: true } }, request: { select: { id: true, status: true } },
    acceptedOffer: { select: { id: true, driver: { select: { id: true } } } }, conversation: { select: { id: true, status: true } },
  } })
  if (!trip) throw new Error('Trip not found.')
  return trip
}

export async function tripCancellationPreview(_root: unknown, args: { tripId: string }, context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    await fenceHumanAuthority(tx, context.session)
    const authority = await authorizedTripHeader(tx, context.session, args.tripId, 'participant')
    if (!authority?.bound) return null
    const trip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), include: { request: true } })
    if (!trip || !['driver_assigned','driver_en_route','driver_arrived'].includes(trip.status)) return null
    const economics = requireAcceptedQuoteFee(trip.bookingSnapshot, trip.request?.quoteSnapshot, 'cancellationFeeMinor')
    return { tripId: trip.id, actorId: authority.actorId, acceptedOfferId: trip.acceptedOfferId, updatedAt: trip.updatedAt.toISOString(), feeMinor: economics.feeMinor, currencyCode: economics.currencyCode, refundRequired: 'manual_review' }
  }, { isolationLevel: 'RepeatableRead' })
}

export async function riderRequestCancellationPreview(_root: unknown, args: { requestId: string; requestProof?: string | null }, context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    const header = await authorizedRequestHeader(tx, context.session, args.requestId, args.requestProof)
    if (!header) return null
    const request = await tx.rideRequest.findFirst({ where: requestOwnerWhere(header), select: { id: true, status: true, trip: { select: { status: true } } } })
    if (!request || !['requested', 'matching'].includes(request.status) || (request.trip && request.trip.status !== 'cancelled')) return null
    return { requestId: request.id, actorId: header.riderId || 'guest', status: request.status }
  }, { isolationLevel: 'RepeatableRead' })
}

export async function cancelRideRequest(_root: unknown, args: { requestId: string; requestProof?: string | null; idempotencyKey: string; expectedActorId: string }, context: any) {
  if (typeof args.idempotencyKey !== 'string' || args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error('A stable idempotency key of 12–200 characters is required.')
  const prisma = context.prisma as PrismaClient
  const authorize = async (db: Pick<PrismaClient, 'user' | 'role' | 'fleet' | 'fleetMembership'>, request: { riderId: string | null; fleetId: string | null; requestNumber: string; guestProofHash: string; guestProofExpiresAt: Date | null }) => {
    const actor = humanSessionId(context.session) ? await currentHumanActor(db, context.session) : null
    const riderOwner = ownsRequest(request, request.riderId ? (actor ? context.session : undefined) : context.session, args.requestProof)
    const operator = await canAccessFleet({ prisma: db }, context.session, request.fleetId, 'operations')
    return riderOwner || operator
  }
  const visible = await prisma.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, riderId: true, fleetId: true, requestNumber: true, guestProofHash: true, guestProofExpiresAt: true } })
  if (!visible || !await authorize(prisma, visible)) throw new Error('Ride request was not found.')
  const visibleOwner = ownsRequest(visible, context.session, args.requestProof)
  const expectedActor = visibleOwner ? visible.riderId || 'guest' : humanSessionId(context.session)
  if (!expectedActor || args.expectedActorId !== expectedActor) throw new Error('Cancellation actor changed; reconcile the original command.')

  const offerSnapshot = await context.prisma.matchOffer.findMany({ where: { requestId: args.requestId, status: { in: ['offered', 'accepted'] } }, select: { driverId: true } })
  const lockedDriverIds = new Set<string>(offerSnapshot.map((offer: { driverId: string | null }) => offer.driverId).filter((id: string | null): id is string => Boolean(id)))
  const lockKeys = [`command:${args.idempotencyKey}`, ...Array.from(lockedDriverIds, id => `driver:${id}`), `request:${args.requestId}`].sort()

  return context.prisma.$transaction(async (tx: any) => {
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`
    if (humanSessionId(context.session)) await fenceHumanAuthority(tx, context.session, visible.fleetId)
    const header = await tx.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, riderId: true, fleetId: true, requestNumber: true, guestProofHash: true, guestProofExpiresAt: true } })
    if (!header || header.fleetId !== visible.fleetId || header.riderId !== visible.riderId || !await authorize(tx, header)) throw new Error('Ride request was not found.')
    const recorded = await tx.requestCancellationCommand.findUnique({ where: { idempotencyKey: args.idempotencyKey } })
    if (recorded && recorded.requestId !== header.id) throw new Error('Cancellation key belongs to another request.')
    const current = await tx.rideRequest.findFirst({ where: requestOwnerWhere(header), include: { trip: true } })
    if (!current) throw new Error('Ride request was not found.')
    const owner = ownsRequest(header, context.session, args.requestProof)
    const actualActor = owner ? header.riderId || 'guest' : humanSessionId(context.session)
    if (actualActor !== args.expectedActorId) throw new Error('Cancellation actor changed; reconcile the original command.')
    const command = { version: 1, purpose: 'request_cancellation', requestId: current.id, fleetId: current.fleetId, actorKind: owner ? header.riderId ? 'rider' : 'guest' : 'operator', actorId: actualActor, ...(owner && !header.riderId ? { originalProofHash: header.guestProofHash } : {}) }
    if (recorded) {
      if (!isDeepStrictEqual(recorded.command, command) || recorded.result?.requestId !== current.id || recorded.result.status !== 'cancelled') throw new Error('Cancellation key belongs to another command.')
      return { ...recorded.result, replayed: true, alreadyCancelled: false }
    }
    if (current.status === 'cancelled') return { requestId: current.id, status: current.status, replayed: false, alreadyCancelled: true }
    if (!['requested', 'matching'].includes(current.status || '') || (current.trip && current.trip.status !== 'cancelled')) throw new Error('This ride request has already been matched to a trip and must be cancelled through its trip receipt.')

    const result = { requestId: current.id, status: 'cancelled', replayed: false, alreadyCancelled: false }
    const requestUpdate = await tx.rideRequest.updateMany({ where: { id: current.id, status: { in: ['requested', 'matching'] } }, data: { status: 'cancelled' } })
    if (requestUpdate.count !== 1) throw new Error('Ride request changed concurrently; reload before retrying.')
    const outstandingOffers = await tx.matchOffer.findMany({ where: { requestId: current.id, status: { in: ['offered', 'accepted'] } }, select: { driverId: true } })
    const offeredDriverIds: string[] = Array.from(new Set<string>(outstandingOffers.map((offer: { driverId: string | null }) => offer.driverId).filter((id: string | null): id is string => Boolean(id)))).sort()
    if (offeredDriverIds.some(id => !lockedDriverIds.has(id))) throw new Error('Dispatch offers changed concurrently; reload before retrying cancellation.')
    await tx.matchOffer.updateMany({ where: { requestId: current.id, status: { in: ['offered', 'accepted'] } }, data: { status: 'withdrawn', respondedAt: new Date(), reservationReleasedAt: new Date() } })
    for (const driverId of offeredDriverIds) await refreshDriverPresentDispatchStatus(tx, driverId)
    await tx.requestCancellationCommand.create({ data: { requestId: current.id, idempotencyKey: args.idempotencyKey, command, result } })
    return result
  }, { isolationLevel: 'Serializable' })
}

export async function cancelRide(_root: unknown, args: { tripId: string; tripToken?: string | null; reasonCode?: string | null; reason?: string | null; idempotencyKey: string; reassign?: boolean | null; expectedActorId: string; expectedAcceptedOfferId: string; expectedUpdatedAt: string; expectedFeeMinor: number; expectedCurrencyCode: string }, context: any) {
  if (process.env.NODE_ENV === 'production') throw new Error('Cancellation is disabled until refund and rider/driver communications workflows are ready.')
  if (typeof args.idempotencyKey !== 'string' || args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error('A stable idempotency key of 12–200 characters is required.')
  const initialAuthority = await authorizedTripHeader(context.prisma, context.session, args.tripId, 'participant')
  if (!initialAuthority) throw new Error('Trip not found.')
  if (args.expectedActorId !== initialAuthority.actorId || args.expectedAcceptedOfferId !== initialAuthority.header.acceptedOfferId) throw new Error('Cancellation actor or assignment changed; reconciliation is required.')
  if (!initialAuthority.bound) throw new Error('Trip binding is unavailable; reconcile the retained trip.')
  const header = initialAuthority.header
  const visible = { id: header.id, driver: header.driverId ? { id: header.driverId } : null, vehicle: header.vehicleId ? { id: header.vehicleId } : null, request: header.requestId ? { id: header.requestId } : null, acceptedOffer: header.acceptedOfferId ? { id: header.acceptedOfferId } : null, fleet: { id: header.fleetId } }
  const actorId = initialAuthority.actorId
  const reasonCode = String(args.reasonCode || 'other').trim().slice(0, 80)
  const reason = String(args.reason || '').trim().slice(0, 500)
  if (args.reassign && !initialAuthority.operator) throw new Error('Only an authorized fleet operator may cancel and reassign this request.')

  const offerSnapshot = visible.request?.id
    ? await context.prisma.matchOffer.findMany({ where: { requestId: visible.request.id, status: { in: ['offered', 'accepted'] } }, select: { id: true, driverId: true } })
    : []
  const lockedDriverIds = new Set<string>([visible.driver?.id, ...offerSnapshot.map((offer: { driverId: string | null }) => offer.driverId)].filter((id): id is string => Boolean(id)))
  const lockedOfferIds = new Set<string>([visible.acceptedOffer?.id, ...offerSnapshot.map((offer: { id: string }) => offer.id)].filter((id): id is string => Boolean(id)))
  const expectedOfferLockSet = offerSnapshot.map((offer: { id: string; driverId: string | null }) => JSON.stringify([offer.id, offer.driverId])).sort()
  const lockKeys = [
    ...Array.from(lockedDriverIds, id => `driver:${id}`),
    ...Array.from(lockedOfferIds, id => `offer:${id}`),
    `request:${visible.request?.id || ''}`,
    `trip:${visible.id}`,
    `vehicle:${visible.vehicle?.id || ''}`,
  ].sort()

  return context.prisma.$transaction(async (tx: any) => {
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`
    await fenceHumanAuthority(tx, context.session, header.fleetId)
    const authority = await authorizedTripHeader(tx, context.session, visible.id, 'participant')
    if (!authority) throw new Error('Trip not found.')
    if (!sameTripAuthority(authority.header, header)) throw new Error('Trip assignment changed concurrently; reload before retrying.')
    if (!authority.bound) throw new Error('Trip binding is unavailable; reconcile the retained trip.')
    const current = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), include: { driver: { select: { userId: true, status: true, fleetId: true } }, request: true, acceptedOffer: true } })
    if (!current) throw new Error('Trip not found.')
    const actorType = authority.assignedDriver ? 'driver' : authority.rider ? 'rider' : 'operator'
    if (args.reassign && (!authority.operator || actorType !== 'operator')) throw new Error('Only an authorized fleet operator may cancel and reassign this request.')
    const commandBinding = { version: 2, purpose: 'trip_cancellation', actorType, ...authority.header, reviewed: { updatedAt: args.expectedUpdatedAt, feeMinor: args.expectedFeeMinor, currencyCode: args.expectedCurrencyCode } }

    const replay = await tx.tripEvent.findUnique({ where: { idempotencyKey: args.idempotencyKey } })
    if (replay) {
      const metadata = (replay.metadata || {}) as Record<string, unknown>
      if (replay.tripId !== current.id || replay.actorUserId !== actorId || replay.actorType !== actorType || replay.eventType !== (args.reassign ? 'trip.cancelled_for_reassignment' : 'trip.cancelled') || metadata.reasonCode !== reasonCode || metadata.reason !== reason || metadata.reassign !== Boolean(args.reassign) || !isDeepStrictEqual(metadata.commandBinding, commandBinding)) throw new Error('Idempotency key belongs to another cancellation command.')
      const prior = metadata.cancellationId ? await tx.cancellation.findUnique({ where: { id: String(metadata.cancellationId) } }) : null
      if (!prior) throw new Error('Cancellation receipt is unavailable; reconciliation is required.')
      return prior
    }
    if (!['driver_assigned', 'driver_en_route', 'driver_arrived'].includes(current.status || '') || !current.requestId || !current.acceptedOfferId) throw new Error('Trip can no longer be cancelled or reassigned.')
    const cancellationEconomics = requireAcceptedQuoteFee(current.bookingSnapshot, current.request?.quoteSnapshot, 'cancellationFeeMinor')
    if (current.updatedAt.toISOString() !== args.expectedUpdatedAt || cancellationEconomics.feeMinor !== args.expectedFeeMinor || cancellationEconomics.currencyCode !== args.expectedCurrencyCode) throw new Error('Cancellation review changed. Reconciliation is required before another command.')
    const releaseOffers = await tx.matchOffer.findMany({ where: { requestId: current.requestId, status: { in: ['offered', 'accepted'] } }, select: { id: true, driverId: true } })
    const actualOfferLockSet = releaseOffers.map((offer: { id: string; driverId: string | null }) => JSON.stringify([offer.id, offer.driverId])).sort()
    if (actualOfferLockSet.length !== expectedOfferLockSet.length || actualOfferLockSet.some((key: string, index: number) => key !== expectedOfferLockSet[index])) throw new Error('Affected offers changed concurrently; reload before retrying.')
    if (releaseOffers.some((offer: { id: string; driverId: string | null }) => !lockedOfferIds.has(offer.id) || Boolean(offer.driverId && !lockedDriverIds.has(offer.driverId)))) throw new Error('Affected driver or offer lock set changed; reload before retrying.')
    const tripUpdate = await tx.trip.updateMany({ where: { id: current.id, requestId: current.requestId, acceptedOfferId: current.acceptedOfferId, status: { in: ['driver_assigned', 'driver_en_route', 'driver_arrived'] } }, data: { status: 'cancelled', cancelledAt: new Date(), managementTokenRevokedAt: new Date() } })
    if (tripUpdate.count !== 1) throw new Error('Trip assignment changed concurrently; reload before retrying.')
    const offerUpdate = await tx.matchOffer.updateMany({ where: { requestId: current.requestId, status: { in: ['offered', 'accepted'] } }, data: { status: 'withdrawn', respondedAt: new Date(), reservationReleasedAt: new Date() } })
    if (offerUpdate.count < 1) throw new Error('Accepted offer could not be invalidated; cancellation was rolled back.')
    const requestUpdate = await tx.rideRequest.updateMany({ where: { id: current.requestId, status: 'matched' }, data: { status: args.reassign ? 'matching' : 'cancelled' } })
    if (requestUpdate.count !== 1) throw new Error('Ride request changed concurrently; cancellation was rolled back.')
    const cancellation = await tx.cancellation.create({ data: { tripId: current.id, actorType, reasonCode, reason, policySnapshot: { assignmentGeneration: current.acceptedOfferId, acceptedAssignment: current.bookingSnapshot, cancellationPolicy: current.bookingSnapshot?.cancellationPolicy || {} }, feeMinor: cancellationEconomics.feeMinor, currencyCode: cancellationEconomics.currencyCode, refundRequired: 'manual_review' } })
    await tx.tripEvent.create({ data: { tripId: current.id, eventType: args.reassign ? 'trip.cancelled_for_reassignment' : 'trip.cancelled', fromStatus: current.status || '', toStatus: 'cancelled', actorType, actorUserId: actorId, idempotencyKey: args.idempotencyKey, occurredAt: new Date(), metadata: { commandBinding, reasonCode, reason, feeMinor: cancellationEconomics.feeMinor, reassign: Boolean(args.reassign), cancellationId: cancellation.id, invalidatedOfferCount: offerUpdate.count, disclosure: 'No refund or notification is initiated by this command.' } } })
    const refreshDriverIds = new Set<string>([current.driverId, ...releaseOffers.map((offer: { driverId: string | null }) => offer.driverId)].filter((id): id is string => Boolean(id)))
    if ([...refreshDriverIds].some(id => !lockedDriverIds.has(id))) throw new Error('Affected driver lock set changed; reload before retrying.')
    for (const driverId of [...refreshDriverIds].sort()) await refreshDriverPresentDispatchStatus(tx, driverId)
    return cancellation
  }, { isolationLevel: 'Serializable' })
}

export async function recordTripLocation(_root: unknown, args: any, context: any) {
  if (!humanSessionId(context.session)) throw new Error('Trip not found.')
  return context.transaction(async (transactionContext: KeystoneContext) => {
    const trip = await loadAuthorizedTrip(transactionContext, args, 'operations', 'driverOrOperator')
    if (!['driver_en_route', 'driver_arrived', 'in_progress'].includes(trip.status || '')) throw new Error('Location is not accepted for this trip state.')
    const fleetOperator = await canAccessFleet(transactionContext, context.session, trip.fleet?.id, 'operations')
    if (context.session?.itemId !== trip.driver?.user?.id && !fleetOperator) throw new Error('Only the assigned driver or authorized fleet operator may record location.')
    const fleet = await transactionContext.prisma.fleet.findUnique({ where: { id: trip.fleet!.id }, select: { preciseLocationRetentionDays: true } })
    const days = Number(fleet?.preciseLocationRetentionDays)
    if (!Number.isSafeInteger(days) || days < 1 || days > 3650) throw new Error('Location retention policy is unavailable.')
    if (args.encryptedCoordinateRef) throw new Error('Precise location storage is unavailable until reference ownership can be verified.')
    const recordedAt = new Date(args.recordedAt || Date.now())
    if (!Number.isFinite(recordedAt.getTime()) || recordedAt.getTime() > Date.now()) throw new Error('Location observation time is invalid.')
    const coarseGeohash = String(args.coarseGeohash || '')
    if (!/^[0123456789bcdefghjkmnpqrstuvwxyz]{0,7}$/.test(coarseGeohash)) throw new Error('Coarse location is invalid.')
    const observation = args.providerEvidence ?? {}
    if (!observation || typeof observation !== 'object' || Array.isArray(observation) || Object.keys(observation).some(key => !['observationId', 'clientVersion'].includes(key)) || Object.values(observation).some(value => typeof value !== 'string' || value.length > 100 || !/^[a-zA-Z0-9_.:-]*$/.test(value))) throw new Error('Location observation metadata is invalid.')
    const accuracyMeters = args.accuracyMeters ?? 0
    if (!Number.isSafeInteger(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 10000) throw new Error('Location accuracy is invalid.')
    return transactionContext.sudo().query.LocationEvent.createOne({ data: { trip: { connect: { id: trip.id } }, actorType: context.session?.itemId === trip.driver?.user?.id ? 'driver' : 'operator', recordedAt, coarseGeohash, encryptedCoordinateRef: '', accuracyMeters, providerEvidence: { ...observation, source: 'client_observation', authoritative: false, actorUserId: context.session.itemId }, expiresAt: new Date(recordedAt.getTime() + days * 24 * 60 * 60_000) }, query: 'id recordedAt coarseGeohash expiresAt' })
  })
}

async function keyedTripSubmission(context: any, args: any, purpose: string, capability: FleetCapability, body: Record<string, unknown>, create: (tx: any, trip: any, actorType: string) => Promise<any>) {
  const key = requireCommandKey(args.idempotencyKey)
  const bodyHash = commandBodyHash(body)
  return context.transaction(async (tx: any) => {
    await fenceHumanAuthority(tx.prisma, context.session)
    for (const lock of [`command:${key}`, `trip:${args.tripId}`].sort()) await tx.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text IS NOT NULL`
    const trip = await loadAuthorizedTrip(tx, args, capability, 'participant')
    const actorId = context.session.itemId
    const actorType = actorId === trip.driver?.user?.id ? 'driver' : actorId === trip.rider?.id ? 'rider' : 'operator'
    const commandBinding = { version: 1, purpose, actorId, actorType, bodyHash, tripId: trip.id, fleetId: trip.fleetId, requestId: trip.requestId, acceptedOfferId: trip.acceptedOfferId, driverId: trip.driverId, vehicleId: trip.vehicleId }
    const prior = await tx.prisma.tripEvent.findUnique({ where: { idempotencyKey: key } })
    if (prior) {
      if (prior.tripId !== trip.id || prior.actorUserId !== actorId || prior.eventType !== purpose || !isDeepStrictEqual(prior.metadata?.commandBinding, commandBinding) || !prior.metadata?.result?.id) throw new Error('Command key belongs to another submission or assignment.')
      return prior.metadata.result
    }
    const result = await create(tx, trip, actorType)
    if (!result || typeof result.id !== 'string' || !result.id) throw new Error('Submission receipt is unavailable.')
    await tx.prisma.tripEvent.create({ data: { tripId: trip.id, eventType: purpose, actorType, actorUserId: actorId, idempotencyKey: key, occurredAt: new Date(), metadata: { commandBinding, result } } })
    return result
  }, { isolationLevel: 'Serializable' })
}

export async function sendTripMessage(_root: unknown, args: any, context: any) {
  const body = String(args.body || '').trim()
  if (!body || body.length > 2000) throw new Error('Message must be between 1 and 2000 characters.')
  return keyedTripSubmission(context, args, 'trip.message_submitted', 'operations', { body }, async (tx, trip, actorType) => {
    const sudo = tx.sudo()
    let conversation = trip.conversation
    if (!conversation) conversation = await sudo.query.Conversation.createOne({ data: { trip: { connect: { id: trip.id } }, status: 'open' }, query: 'id status' })
    if (conversation.status !== 'open') throw new Error('Conversation is not open.')
    return sudo.query.Message.createOne({ data: { conversation: { connect: { id: conversation.id } }, senderType: actorType, sender: { connect: { id: context.session.itemId } }, body, status: 'queued', metadata: { directContactShared: false } }, query: 'id senderType status createdAt' })
  })
}

export async function reportSafetyIncident(_root: unknown, args: any, context: any) {
  const severity = args.severity || 'medium'
  if (!['low','medium','high','critical'].includes(severity)) throw new Error('Incident severity is invalid.')
  const category = String(args.category || 'other').trim()
  const summary = String(args.summary || '').trim()
  if (!summary || summary.length > 500 || category.length > 80) throw new Error('Incident category or summary is invalid.')
  const restrictedDetails = args.restrictedDetails || {}
  const evidenceRefs = args.evidenceRefs || []
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 50 || evidenceRefs.some((ref: unknown) => typeof ref !== 'string' || ref.length > 1000)) throw new Error('Incident evidence references are invalid.')
  return keyedTripSubmission(context, args, 'trip.incident_submitted', 'safety', { severity, category, summary, restrictedDetails, evidenceRefs }, (tx, trip) => tx.sudo().query.SafetyIncident.createOne({ data: { trip: { connect: { id: trip.id } }, caseNumber: `SAFE-${randomUUID().slice(0,8).toUpperCase()}`, severity, status: 'open', category, summary, restrictedDetails, evidenceRefs, reportedBy: { connect: { id: context.session.itemId } }, reportedAt: new Date() }, query: 'id caseNumber severity status reportedAt' }))
}

export async function openSupportCase(_root: unknown, args: any, context: any) {
  const category = String(args.category || 'trip').trim()
  const subject = String(args.subject || '').trim()
  const description = String(args.description || '').trim()
  if (!subject || subject.length > 160 || !description || description.length > 2000 || category.length > 80) throw new Error('Support subject or description is invalid.')
  return keyedTripSubmission(context, args, 'trip.support_submitted', 'safety', { category, subject, description }, (tx, trip) => tx.sudo().query.SupportCase.createOne({ data: { trip: { connect: { id: trip.id } }, caseNumber: `HELP-${randomUUID().slice(0,8).toUpperCase()}`, status: 'open', category, subject, description, priority: 'normal', requester: { connect: { id: context.session.itemId } } }, query: 'id caseNumber status createdAt' }))
}

export async function submitTripReview(_root: unknown, args: any, context: any) {
  const trip = await loadAuthorizedTrip(context, args, 'operations', 'reviewParticipant')
  if (trip.status !== 'completed') throw new Error('Only completed trips can be reviewed.')
  const actorId = context.session?.itemId || null
  const isDriver = Boolean(actorId && actorId === trip.driver?.user?.id)
  const isRider = Boolean(actorId && actorId === trip.rider?.id)
  if (!isDriver && !isRider) throw new Error('Only the assigned rider or driver may submit a review.')
  const rating = Number(args.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Rating must be an integer from 1 to 5.')
  const idempotencyKey = String(args.idempotencyKey || '').trim()
  if (idempotencyKey.length < 12 || idempotencyKey.length > 200) throw new Error('A stable idempotency key of 12–200 characters is required.')
  const direction = isDriver ? 'driver_to_rider' : 'rider_to_driver'
  const body = String(args.body || '').trim().slice(0, 2000)
  const prisma = context.prisma as PrismaClient
  return prisma.$transaction(async tx => {
    const lockKey = `review:${trip.id}:${direction}:${actorId || 'receipt-holder'}`
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text IS NOT NULL`
    const authority = await authorizedTripHeader(tx, context.session, trip.id, 'reviewParticipant')
    if (!authority?.bound || !sameTripAuthority(authority.header, trip)) throw new Error('Trip review authority or assignment changed; reconcile before retrying.')
    const current = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), select: { status: true } })
    if (current?.status !== 'completed') throw new Error('Only completed trips can be reviewed.')
    const replay = await tx.tripEvent.findUnique({ where: { idempotencyKey } })
    if (replay) {
      const metadata = (replay.metadata || {}) as Record<string, unknown>
      if (replay.tripId !== trip.id || replay.actorUserId !== actorId || replay.eventType !== 'trip.review_submitted' || metadata.direction !== direction || metadata.rating !== rating || metadata.bodyHash !== createReviewBodyHash(body)) throw new Error('Idempotency key belongs to another review command.')
      const replayReview = metadata.reviewId ? await tx.review.findUnique({ where: { id: String(metadata.reviewId) } }) : null
      if (!replayReview) throw new Error('Review receipt is unavailable; reconciliation is required.')
      return replayReview
    }
    const existing = await tx.review.findFirst({ where: { tripId: trip.id, authorId: actorId, direction } })
    if (existing) {
      if (existing.rating === rating && existing.body === body) return existing
      throw new Error('A review has already been submitted for this trip and direction.')
    }
    const review = await tx.review.create({ data: { tripId: trip.id, authorId: actorId, direction, rating, body, status: 'pending', submittedAt: new Date() } })
    await tx.tripEvent.create({ data: { tripId: trip.id, eventType: 'trip.review_submitted', fromStatus: 'completed', toStatus: 'completed', actorType: isDriver ? 'driver' : 'rider', actorUserId: actorId, idempotencyKey, occurredAt: new Date(), metadata: { reviewId: review.id, direction, rating, bodyHash: createReviewBodyHash(body) } } })
    return review
  }, { isolationLevel: 'Serializable' })
}
