import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { Prisma, PrismaClient } from '@prisma/client'
import { hasRequestQuoteBinding, hasRequestTripBinding } from '../domain/requestTripBinding'
import { riderTripStatus } from './riderReceipts'
import { nextTripStatus, timestampFieldForStatus } from '../domain/tripState'
import { isCurrentlyAvailableAt } from '../domain/currentAvailability'
import { canAccessFleet, currentHumanActor, type AccessArgs } from '../access'
import { authorizedTripHeader, sameTripAuthority, tripAuthorityWhere } from '../domain/tripAuthority'
import { refreshDriverPresentDispatchStatus } from '../domain/driverDispatchPresence'
import { isFutureScheduledRequest, overlapsFixedDispatchWindow } from '../domain/dispatchSchedule'
import { loadCurrentEligibility } from '../domain/eligibility'
import { fenceHumanAuthority } from '../domain/authorityFence'
import { requireServiceReadiness } from '../domain/serviceReadiness'
import { expireRideOffers } from './offerMaintenance'
import { requireAcceptedQuoteFee } from '../domain/tripEconomics'

async function requireSignedIn(context: AccessArgs['context'] & { session?: AccessArgs['session'] }) {
  const actor = await currentHumanActor(context.prisma, context.session)
  if (!actor) throw new Error('A current human User session is required.')
  return actor.id
}

async function operatorOwnsFleet(context: AccessArgs['context'] & { session?: AccessArgs['session'] }, fleetId: string) {
  return canAccessFleet(context, context.session, fleetId, 'operations')
}

async function currentDriver(context: any) {
  const profiles = await context.sudo().query.DriverProfile.findMany({ where: { user: { id: { equals: context.session?.itemId } } }, take: 1, query: 'id fleet { id } status dispatchStatus' })
  return profiles[0] || null
}

export async function offerRideToDriver(_root: unknown, args: { requestId: string; driverId: string; vehicleId: string; expiresInSeconds?: number | null; idempotencyKey: string; expectedActorId: string }, context: any) {
  const actorId = await requireSignedIn(context)
  if (args.expectedActorId !== actorId) throw new Error('The acting account changed; reconcile the original command.')
  if (process.env.NODE_ENV === 'production') throw new Error('Dispatch is disabled until contracted route and eligibility providers are configured.')
  if (args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error('A stable idempotency key of 12–200 characters is required.')
  if (args.expiresInSeconds != null && !Number.isSafeInteger(args.expiresInSeconds)) throw new Error('Offer duration must be an integer.')
  const prisma = context.prisma as PrismaClient
  const visibleRequest = await prisma.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, fleetId: true } })
  if (!visibleRequest?.fleetId || !(await operatorOwnsFleet(context, visibleRequest.fleetId))) throw new Error('Ride request was not found.')
  const existingOffer = await prisma.matchOffer.findUnique({ where: { idempotencyKey: args.idempotencyKey }, select: { id: true } })
  if (!existingOffer) {
    const maintenance = await expireRideOffers(null, { fleetId: visibleRequest.fleetId, driverId: args.driverId, vehicleId: args.vehicleId }, context)
    if (maintenance.hasMore) throw new Error('More expired reservations require release before new dispatch.')
  }
  return prisma.$transaction(async tx => {
    const lockKeys = [`driver:${args.driverId}`, `request:${args.requestId}`, `vehicle:${args.vehicleId}`].sort()
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`
    await fenceHumanAuthority(tx, context.session, visibleRequest.fleetId)
    const header = await tx.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, fleetId: true } })
    if (!header || header.fleetId !== visibleRequest.fleetId || !await canAccessFleet({ prisma: tx }, context.session, header.fleetId, 'operations')) throw new Error('Ride request was not found.')
    const driverHeader = await tx.driverProfile.findUnique({ where: { id: args.driverId }, select: { id: true, fleetId: true } })
    const vehicleHeader = await tx.vehicle.findUnique({ where: { id: args.vehicleId }, select: { id: true, fleetId: true } })
    if (driverHeader?.fleetId !== header.fleetId || vehicleHeader?.fleetId !== header.fleetId) throw new Error('Driver or vehicle lacks current fleet-bound eligibility evidence.')
    const dispatchCommand = { version: 1, purpose: 'dispatch_offer', actorId, fleetId: header.fleetId, requestId: args.requestId, driverId: args.driverId, vehicleId: args.vehicleId, expiresInSeconds: args.expiresInSeconds ?? null }
    const replayHeader = await tx.matchOffer.findUnique({ where: { idempotencyKey: args.idempotencyKey }, select: { id: true, requestId: true, driverId: true, vehicleId: true } })
    if (replayHeader) {
      if (replayHeader.requestId !== header.id || replayHeader.driverId !== args.driverId || replayHeader.vehicleId !== args.vehicleId) throw new Error('Idempotency key was already used for another dispatch command.')
      const replay = await tx.matchOffer.findUnique({ where: { id: replayHeader.id } })
      const snapshot = replay?.eligibilitySnapshot as Record<string, unknown> | null
      if (!replay || !isDeepStrictEqual(snapshot?.dispatchCommand, dispatchCommand)) throw new Error('Original dispatch actor/purpose/body binding is unavailable or different; reconcile the retained offer, not a replacement key.')
      return replay
    }

    const [request, driver] = await Promise.all([
      tx.rideRequest.findFirst({ where: { id: header.id, fleetId: header.fleetId }, include: { quote: { include: { service: true } } } }),
      tx.driverProfile.findFirst({ where: { id: args.driverId, fleetId: header.fleetId }, include: { vehicles: { where: { id: args.vehicleId, fleetId: header.fleetId }, include: { drivers: { where: { id: args.driverId }, select: { id: true } }, policyEvaluations: { orderBy: { evaluatedAt: 'desc' }, take: 1, include: { policy: true } } } }, policyEvaluations: { orderBy: { evaluatedAt: 'desc' }, take: 1, include: { policy: true } } } }),
    ])
    if (!request) throw new Error('Ride request was not found.')
    if (!['requested', 'matching'].includes(request.status || '')) throw new Error('Ride request is not matchable.')
    await requireServiceReadiness(tx, request.quote?.serviceId || null, request.fleetId)
    const service = request.quote?.service
    if (!service || service.status !== 'active') throw new Error('The quoted service is no longer active.')
    const vehicle = driver?.vehicles[0]
    const dispatchNow = new Date()
    const driverEligible = request.fleetId && await loadCurrentEligibility(tx, 'driver', args.driverId, request.fleetId, dispatchNow)
    const vehicleEligible = request.fleetId && await loadCurrentEligibility(tx, 'vehicle', args.vehicleId, request.fleetId, dispatchNow)
    const freshPresence = await tx.driverProfile.findUnique({ where: { id: args.driverId }, select: { dispatchStatus: true } })
    const requestedAt = request.requestedFor || dispatchNow
    const isFutureScheduled = isFutureScheduledRequest(request.requestedFor, dispatchNow)
    const dispatchStateAllowsRequest = isFutureScheduled
      ? ['available', 'offered', 'assigned', 'on_trip'].includes(freshPresence?.dispatchStatus || '')
      : freshPresence?.dispatchStatus === 'available'
    if (!driver || driver.fleetId !== request.fleetId || driver.status !== 'active' || !dispatchStateAllowsRequest || !driverEligible ||
      !vehicle || vehicle.status !== 'active' || vehicle.fleetId !== request.fleetId || vehicle.drivers.length === 0 || !vehicleEligible) {
      throw new Error('Driver or vehicle lacks current fleet-bound eligibility evidence.')
    }
    const accessibilityNeeds = request.accessibilityNeeds && typeof request.accessibilityNeeds === 'object' && !Array.isArray(request.accessibilityNeeds) ? request.accessibilityNeeds as Record<string, unknown> : {}
    if ((request.passengerCount || 1) > (service.passengerCapacity || 0) || (request.passengerCount || 1) > (vehicle.capacity || 0) || (service.wheelchairAccessible && !vehicle.wheelchairAccessible) || (accessibilityNeeds.wheelchairAccessible === true && !vehicle.wheelchairAccessible)) throw new Error('The selected vehicle does not meet this service request.')
    if (request.requestedFor && (!driver.acceptsScheduled || !isFutureScheduledRequest(request.requestedFor, dispatchNow))) throw new Error('This driver or service does not accept the requested schedule.')
    if (!await isCurrentlyAvailableAt(tx, driver.id, requestedAt)) throw new Error('Driver is not available for the requested time.')

    const activeTrips = await tx.trip.findMany({ where: { status: { in: ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress'] }, OR: [{ driverId: driver.id }, { vehicleId: vehicle.id }] }, select: { driverId: true, vehicleId: true, scheduledFor: true, acceptedAt: true } })
    if (activeTrips.some(trip => overlapsFixedDispatchWindow(requestedAt, trip.scheduledFor || trip.acceptedAt))) throw new Error('Driver or vehicle already has an overlapping active reservation.')
    const outstandingOffers = await tx.matchOffer.findMany({ where: { status: { in: ['offered', 'accepted'] }, reservationReleasedAt: null, OR: [{ driverId: driver.id }, { vehicleId: vehicle.id }] }, select: { reservationStartAt: true } })
    if (outstandingOffers.some(item => overlapsFixedDispatchWindow(requestedAt, item.reservationStartAt))) throw new Error('Driver or vehicle already has an overlapping offer reservation.')

    const expiresAt = new Date(Date.now() + Math.max(30, Math.min(Number(args.expiresInSeconds) || 90, 600)) * 1000)
    const offer = await tx.matchOffer.create({ data: { requestId: request.id, driverId: driver.id, vehicleId: vehicle.id, reservationStartAt: requestedAt, expiresAt, idempotencyKey: args.idempotencyKey, eligibilitySnapshot: { dispatchCommand, evaluatedAt: new Date().toISOString(), driverPolicyId: driverEligible.policyId, driverPolicyVersion: driverEligible.policy.version, vehiclePolicyId: vehicleEligible.policyId, vehiclePolicyVersion: vehicleEligible.policy.version, driverEvaluationId: driverEligible.id, vehicleEvaluationId: vehicleEligible.id } } })
    const requestUpdate = await tx.rideRequest.updateMany({ where: { id: request.id, status: { in: ['requested', 'matching'] } }, data: { status: 'matching' } })
    const driverUpdate = isFutureScheduled
      ? { count: 1 }
      : await tx.driverProfile.updateMany({ where: { id: driver.id, status: 'active', dispatchStatus: 'available' }, data: { dispatchStatus: 'offered' } })
    if (requestUpdate.count !== 1 || driverUpdate.count !== 1) throw new Error('Dispatch reservation changed concurrently; reconcile the original command before retrying.')
    return offer
  }, { isolationLevel: 'ReadCommitted' })
}

export async function respondToRideOffer(_root: unknown, args: { offerId: string; response: string; reason?: string | null; idempotencyKey: string }, context: any) {
  const actorId = await requireSignedIn(context)
  if (context.session.listKey !== 'User' || context.session.apiKeyScopes) throw new Error('A driver User session is required.')
  if (!['accept', 'decline'].includes(args.response)) throw new Error('Response must be accept or decline.')
  const responseReason = String(args.reason || '').slice(0, 500)
  const driver = await currentDriver(context)
  if (!driver) throw new Error('An active driver profile is required.')
  if (process.env.NODE_ENV === 'production') throw new Error('Trip acceptance is disabled until contracted route and eligibility providers are configured.')
  if (args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error('A stable idempotency key of 12–200 characters is required.')
  const prisma = context.prisma as PrismaClient
  const initial = await prisma.matchOffer.findUnique({ where: { id: args.offerId }, select: { requestId: true, driverId: true, vehicleId: true } })
  if (!initial || initial.driverId !== driver.id) throw new Error('Offer was not found.')
  const siblingSnapshots = initial.requestId
    ? await prisma.matchOffer.findMany({ where: { requestId: initial.requestId, id: { not: args.offerId }, status: 'offered' }, select: { driverId: true } })
    : []
  const lockedDriverIds = new Set([initial.driverId, ...siblingSnapshots.map(item => item.driverId)].filter((id): id is string => Boolean(id)))
  const lockKeys = [
    ...Array.from(lockedDriverIds, id => `driver:${id}`),
    `offer:${args.offerId}`,
    `request:${initial.requestId || ''}`,
    `vehicle:${initial.vehicleId || ''}`,
  ].sort()
  return prisma.$transaction(async tx => {
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`
    const lockedInitial = await tx.matchOffer.findUnique({ where: { id: args.offerId }, select: { requestId: true, driverId: true, vehicleId: true } })
    if (!lockedInitial || lockedInitial.driverId !== initial.driverId || lockedInitial.requestId !== initial.requestId || lockedInitial.vehicleId !== initial.vehicleId) throw new Error('Offer changed concurrently; reload before retrying.')
    await fenceHumanAuthority(tx, context.session, driver.fleet?.id)
    const actingActor = await currentHumanActor(tx, context.session)
    const actingDriver = await tx.driverProfile.findUnique({ where: { id: driver.id }, select: { userId: true, status: true, fleetId: true } })
    const requestHeader = lockedInitial.requestId ? await tx.rideRequest.findUnique({ where: { id: lockedInitial.requestId }, select: { id: true, fleetId: true } }) : null
    const vehicleHeader = lockedInitial.vehicleId ? await tx.vehicle.findUnique({ where: { id: lockedInitial.vehicleId }, select: { id: true, fleetId: true } }) : null
    const fleetHeader = requestHeader?.fleetId ? await tx.fleet.findUnique({ where: { id: requestHeader.fleetId }, select: { id: true } }) : null
    if (actingActor?.id !== actorId || actingDriver?.userId !== actorId || actingDriver.status !== 'active' || !requestHeader?.fleetId || fleetHeader?.id !== requestHeader.fleetId || actingDriver.fleetId !== requestHeader.fleetId || vehicleHeader?.fleetId !== requestHeader.fleetId) throw new Error('Offer was not found or driver authority changed.')
    const offer = await tx.matchOffer.findFirst({ where: { id: args.offerId, driverId: driver.id, requestId: requestHeader.id, vehicleId: lockedInitial.vehicleId, request: { is: { id: requestHeader.id, fleetId: requestHeader.fleetId } }, vehicle: { is: { fleetId: requestHeader.fleetId } } }, include: { request: { include: { quote: { include: { service: true } }, trip: true } }, vehicle: true } })
    if (!offer?.request || !offer.vehicle || !hasRequestQuoteBinding(offer.request)) throw new Error('Offer was not found or driver authority changed.')
    if (offer.status !== 'offered') {
      if (offer.status === 'accepted') {
        const replay = await tx.tripEvent.findUnique({ where: { idempotencyKey: args.idempotencyKey }, include: { trip: { include: { acceptedOffer: true } } } })
        const metadata = (replay?.metadata || {}) as Record<string, unknown>
        if (args.response === 'accept' && replay?.trip && ['trip.driver_assigned', 'trip.driver_reassigned'].includes(replay.eventType || '') && replay.actorType === 'driver' && replay.actorUserId === actorId && metadata.offerId === offer.id && metadata.response === 'accept' && (metadata.reason || '') === responseReason && metadata.requestId === offer.request.id && metadata.fleetId === offer.request.fleetId && replay.trip.acceptedOfferId === offer.id && offer.request.trip?.id === replay.tripId && offer.request.status === 'matched' && hasRequestTripBinding(offer.request, replay.trip)) return { accepted: true, requestId: offer.request.id, tripId: replay.tripId, confirmationCode: replay.trip?.confirmationCode || null, tripToken: null }
      }
      const snapshot = (offer.eligibilitySnapshot || {}) as Record<string, unknown>
      const command = snapshot.responseCommand as Record<string, unknown> | undefined
      if (['declined', 'expired'].includes(offer.status || '') && command?.idempotencyKey === args.idempotencyKey && command.actorId === actorId && command.response === args.response && command.reason === responseReason) return { accepted: false, requestId: offer.request.id, tripId: null, confirmationCode: null, tripToken: null }
      throw new Error('Offer is no longer active or the response key does not match its recorded outcome.')
    }
    if (offer.expiresAt <= new Date()) {
      await tx.matchOffer.update({ where: { id: offer.id }, data: { status: 'expired', respondedAt: new Date(), reservationReleasedAt: new Date(), eligibilitySnapshot: { ...((offer.eligibilitySnapshot || {}) as object), responseCommand: { idempotencyKey: args.idempotencyKey, actorId, response: args.response, reason: responseReason } } } })
      await refreshDriverPresentDispatchStatus(tx, driver.id)
      return { accepted: false, requestId: offer.request.id, tripId: null, confirmationCode: null, tripToken: null }
    }
    if (args.response === 'decline') {
      await tx.matchOffer.update({ where: { id: offer.id }, data: { status: 'declined', respondedAt: new Date(), reservationReleasedAt: new Date(), declineReason: responseReason, eligibilitySnapshot: { ...((offer.eligibilitySnapshot || {}) as object), responseCommand: { idempotencyKey: args.idempotencyKey, actorId, response: 'decline', reason: responseReason } } } })
      await refreshDriverPresentDispatchStatus(tx, driver.id)
      return { accepted: false, requestId: offer.request.id, tripId: null, confirmationCode: null, tripToken: null }
    }
    if (args.response !== 'accept') throw new Error('Response must be accept or decline.')
    await requireServiceReadiness(tx, offer.request.quote?.serviceId || null, offer.request.fleetId)
    if (offer.request.status !== 'matching' || !offer.vehicleId || (offer.request.trip && offer.request.trip.status !== 'cancelled')) throw new Error('Ride request has already been resolved.')
    const [currentState, acceptedVehicle] = await Promise.all([
      tx.driverProfile.findUnique({ where: { id: driver.id }, include: { policyEvaluations: { orderBy: { evaluatedAt: 'desc' }, take: 1, include: { policy: true } } } }),
      tx.vehicle.findUnique({ where: { id: offer.vehicleId }, include: { drivers: { where: { id: driver.id }, select: { id: true } }, policyEvaluations: { orderBy: { evaluatedAt: 'desc' }, take: 1, include: { policy: true } } } }),
    ])
    const now = new Date()
    const requestFleetId = offer.request.fleetId
    const driverEligible = requestFleetId && await loadCurrentEligibility(tx, 'driver', driver.id, requestFleetId, now)
    const vehicleEligible = requestFleetId && await loadCurrentEligibility(tx, 'vehicle', offer.vehicleId, requestFleetId, now)
    const isFutureScheduled = isFutureScheduledRequest(offer.request.requestedFor, now)
    const dispatchStateAllowsAcceptance = isFutureScheduled
      ? ['available', 'offered', 'assigned', 'on_trip'].includes(currentState?.dispatchStatus || '')
      : currentState?.dispatchStatus === 'offered'
    if (!currentState || currentState.status !== 'active' || !dispatchStateAllowsAcceptance || currentState.fleetId !== offer.request.fleetId || !driverEligible || !acceptedVehicle || acceptedVehicle.status !== 'active' || acceptedVehicle.fleetId !== offer.request.fleetId || acceptedVehicle.drivers.length === 0 || !vehicleEligible) throw new Error('Driver or vehicle eligibility changed after the offer was made.')
    const service = offer.request.quote?.service
    const needs = offer.request.accessibilityNeeds && typeof offer.request.accessibilityNeeds === 'object' && !Array.isArray(offer.request.accessibilityNeeds) ? offer.request.accessibilityNeeds as Record<string, unknown> : {}
    if (!service || service.status !== 'active') throw new Error('The quoted service is no longer active.')
    if ((offer.request.passengerCount || 1) > (acceptedVehicle.capacity || 0) || (offer.request.passengerCount || 1) > (service.passengerCapacity || 0) || (service.wheelchairAccessible && !acceptedVehicle.wheelchairAccessible) || (needs.wheelchairAccessible === true && !acceptedVehicle.wheelchairAccessible)) throw new Error('The assigned vehicle no longer meets the quoted service requirements.')
    if (offer.request.requestedFor && (!currentState.acceptsScheduled || !isFutureScheduledRequest(offer.request.requestedFor, now))) throw new Error('Driver or service schedule eligibility changed.')
    const acceptanceTime = offer.request.requestedFor || now
    if (!await isCurrentlyAvailableAt(tx, driver.id, acceptanceTime)) throw new Error('Driver is no longer available for the requested time.')
    const reservations = await tx.trip.findMany({ where: { status: { in: ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress'] }, OR: [{ driverId: driver.id }, { vehicleId: acceptedVehicle.id }] }, select: { scheduledFor: true, acceptedAt: true } })
    if (reservations.some(item => overlapsFixedDispatchWindow(acceptanceTime, item.scheduledFor || item.acceptedAt))) throw new Error('Driver or vehicle already has an overlapping active reservation.')
    const isReassignment = offer.request.trip?.status === 'cancelled'
    const confirmationCode = offer.request.trip?.confirmationCode || `TRIP-${randomUUID().slice(0, 8).toUpperCase()}`
    const acceptedAt = new Date()
    if (offer.expiresAt <= acceptedAt) throw new Error('Offer lease expired before assignment; recover the original response, not a new command.')
    const requestClaim = await tx.rideRequest.updateMany({ where: { id: offer.request.id, status: 'matching' }, data: { status: 'matched' } })
    if (requestClaim.count !== 1) throw new Error('Ride request was resolved concurrently; refresh before retrying.')
    const offerClaim = await tx.matchOffer.updateMany({ where: { id: offer.id, requestId: offer.request.id, driverId: driver.id, status: 'offered', expiresAt: { gt: acceptedAt } }, data: { status: 'accepted', reservationStartAt: offer.request.requestedFor || acceptedAt, respondedAt: acceptedAt, eligibilitySnapshot: { ...((offer.eligibilitySnapshot || {}) as object), responseCommand: { idempotencyKey: args.idempotencyKey, actorId: context.session.itemId, response: 'accept' } } } })
    if (offerClaim.count !== 1) throw new Error('Offer was withdrawn or answered concurrently.')
    const tripData = {
      fleetId: offer.request.fleetId, riderId: offer.request.riderId, driverId: driver.id, vehicleId: offer.vehicleId,
      requestId: offer.request.id, acceptedOfferId: offer.id,
      confirmationCode, status: 'driver_assigned', scheduledFor: offer.request.requestedFor, acceptedAt, cancelledAt: null,
      enRouteAt: null, arrivedAt: null, startedAt: null, completedAt: null,
      pickupLabel: offer.request.pickupLabel, dropoffLabel: offer.request.dropoffLabel,
      bookingSnapshot: { assignmentGeneration: offer.id, acceptedAt: acceptedAt.toISOString(), acceptedOfferId: offer.id, requestId: offer.request.id, fleetId: offer.request.fleetId, quote: offer.request.quoteSnapshot, service: offer.request.quote?.service ? { id: offer.request.quote.service.id, name: offer.request.quote.service.name, category: offer.request.quote.service.category } : null, driver: { id: driver.id, publicName: currentState.publicName }, vehicle: { id: offer.vehicle.id, label: offer.vehicle.label, make: offer.vehicle.make, model: offer.vehicle.model, color: offer.vehicle.color, plateMasked: offer.vehicle.plateMasked } },
      // Acceptance never issues rider authority to a driver. Rider handoff is request-owned.
      // A reassignment preserves any historical driver-issued hash/expiry as evidence.
      managementTokenRevokedAt: offer.request.trip?.managementTokenRevokedAt || new Date(),
    }
    const trip = isReassignment
      ? await tx.trip.update({ where: { id: offer.request.trip!.id }, data: tripData })
      : await tx.trip.create({ data: { ...tripData, managementTokenHash: '', managementTokenExpiresAt: null } })
    await tx.tripEvent.create({ data: { tripId: trip.id, eventType: isReassignment ? 'trip.driver_reassigned' : 'trip.driver_assigned', fromStatus: isReassignment ? 'cancelled' : 'matching', toStatus: 'driver_assigned', actorType: 'driver', actorUserId: context.session.itemId, idempotencyKey: args.idempotencyKey, occurredAt: new Date(), metadata: { offerId: offer.id, requestId: offer.request.id, fleetId: offer.request.fleetId, response: 'accept', reason: responseReason, assignmentGeneration: offer.id, assignmentSnapshot: tripData.bookingSnapshot, previousAssignmentSnapshot: isReassignment ? offer.request.trip?.bookingSnapshot || null : null, riderHandoff: 'request_receipt', notification: 'not_requested' } } })
    const siblingOffers = await tx.matchOffer.findMany({ where: { requestId: offer.request.id, id: { not: offer.id }, status: 'offered' }, select: { driverId: true } })
    const siblingDriverIds = [...new Set(siblingOffers.map(item => item.driverId).filter((id): id is string => Boolean(id)))].sort()
    if (siblingDriverIds.some(id => !lockedDriverIds.has(id))) throw new Error('Sibling offers changed concurrently; reload before retrying.')
    await tx.matchOffer.updateMany({ where: { requestId: offer.request.id, id: { not: offer.id }, status: 'offered' }, data: { status: 'withdrawn', respondedAt: new Date(), reservationReleasedAt: new Date() } })
    for (const siblingDriverId of siblingDriverIds) await refreshDriverPresentDispatchStatus(tx, siblingDriverId)
    if (!isFutureScheduled) await tx.driverProfile.update({ where: { id: driver.id }, data: { dispatchStatus: 'assigned' } })
    return { accepted: true, requestId: offer.request.id, tripId: trip.id, confirmationCode, tripToken: null }
  }, { isolationLevel: 'Serializable' })
}

export async function transitionTrip(_root: unknown, args: { tripId: string; action: string; reason?: string | null; idempotencyKey: string; expectedActorId: string; expectedAcceptedOfferId: string }, context: any) {
  if (process.env.NODE_ENV === 'production') throw new Error('Trip transitions are disabled until contracted route, communications, payment, and operational workflows are ready.')
  const actorId = await requireSignedIn(context)
  if (args.expectedActorId !== actorId) throw new Error('The acting account changed; reconcile the original command.')
  if (args.idempotencyKey.trim().length < 12 || args.idempotencyKey.length > 200) throw new Error('A stable idempotency key of 12–200 characters is required.')
  if (args.action === 'cancel') throw new Error('Use the cancellation workflow so the policy and fee decision are recorded consistently.')
  const reason = String(args.reason || '').slice(0, 500)
  const prisma = context.prisma as PrismaClient
  const initialAuthority = await authorizedTripHeader(prisma, context.session, args.tripId, 'driverOrOperator')
  if (!initialAuthority) throw new Error('You cannot transition this trip.')
  if (initialAuthority.header.acceptedOfferId !== args.expectedAcceptedOfferId) throw new Error('Original trip assignment changed; reconciliation is required.')
  const lockSnapshot = initialAuthority.header
  const lockKeys = [
    ...(lockSnapshot.driverId ? [`driver:${lockSnapshot.driverId}`] : []),
    ...(lockSnapshot.acceptedOfferId ? [`offer:${lockSnapshot.acceptedOfferId}`] : []),
    ...(lockSnapshot.requestId ? [`request:${lockSnapshot.requestId}`] : []),
    `trip:${args.tripId}`,
  ].sort()
  return prisma.$transaction(async tx => {
    for (const key of lockKeys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`
    await fenceHumanAuthority(tx, context.session, lockSnapshot.fleetId)
    const authority = await authorizedTripHeader(tx, context.session, args.tripId, 'driverOrOperator')
    if (!authority) throw new Error('You cannot transition this trip.')
    if (!sameTripAuthority(authority.header, lockSnapshot)) throw new Error('Trip assignment changed concurrently; reload before retrying.')
    if (!authority.bound) throw new Error('Trip request/assignment binding is unavailable; reconcile before transitioning.')
    const trip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), include: { request: { include: { quote: { include: { service: true } } } }, acceptedOffer: true } })
    if (!trip) throw new Error('Trip not found.')
    const currentAssignedDriver = authority.assignedDriver
    const actorType = currentAssignedDriver ? 'driver' : 'operator'
    const commandBinding = { version: 1, purpose: 'trip_transition', actorType, ...authority.header }
    if (!trip.request || !hasRequestTripBinding(trip.request, trip)) throw new Error('Trip request/assignment binding is unavailable; reconcile before transitioning.')

    const replay = await tx.tripEvent.findUnique({ where: { idempotencyKey: args.idempotencyKey } })
    if (replay) {
      const metadata = (replay.metadata || {}) as Record<string, unknown>
      if (replay.tripId !== trip.id || replay.actorUserId !== actorId || replay.actorType !== actorType || replay.eventType !== `trip.${replay.toStatus}` || metadata.action !== args.action || metadata.reason !== reason || !isDeepStrictEqual(metadata.commandBinding, commandBinding)) throw new Error('Idempotency key belongs to a different actor, trip, or command.')
      return { ...trip, status: replay.toStatus }
    }

    const next = nextTripStatus(trip.status || '', args.action)
    if (args.action === 'start_en_route' && trip.scheduledFor && trip.scheduledFor.getTime() > Date.now() + 2 * 60 * 60_000) throw new Error('A scheduled trip cannot start en route more than two hours early.')
    let noShowEconomics: { feeMinor: number; currencyCode: string } | null = null
    if (args.action === 'no_show') {
      if (trip.scheduledFor && trip.scheduledFor > new Date()) throw new Error('A future trip cannot be marked no-show.')
      if (!trip.arrivedAt || trip.arrivedAt.getTime() > Date.now() - 5 * 60_000) throw new Error('The driver must wait at least five minutes after arrival before reporting a no-show.')
      if (!currentAssignedDriver) throw new Error('Only the assigned driver may record a no-show.')
      noShowEconomics = requireAcceptedQuoteFee(trip.bookingSnapshot, trip.request?.quoteSnapshot, 'noShowFeeMinor')
    }

    const timeField = timestampFieldForStatus(next)
    const snapshot = trip.bookingSnapshot as Record<string, unknown> | null
    const quotedFare = snapshot?.quote as Record<string, unknown> | undefined
    const finalFare = next === 'completed' ? quotedFare || {} : undefined
    const transitionTime = timeField ? { [timeField]: new Date() } as Prisma.TripUpdateInput : {}
    const updated = await tx.trip.update({ where: { id: trip.id }, data: { status: next, ...transitionTime, ...(finalFare ? { finalFareSnapshot: finalFare as Prisma.InputJsonValue } : {}) } })
    await tx.tripEvent.create({ data: { tripId: trip.id, eventType: `trip.${next}`, fromStatus: trip.status || '', toStatus: next, actorType, actorUserId: actorId, idempotencyKey: args.idempotencyKey, occurredAt: new Date(), metadata: { action: args.action, reason, commandBinding } } })
    if (next === 'no_show' && noShowEconomics) {
      await tx.cancellation.create({ data: { tripId: trip.id, actorType: 'driver', reasonCode: 'rider_no_show', reason: reason || 'Rider did not arrive', policySnapshot: { source: 'accepted_quote_snapshot' }, feeMinor: noShowEconomics.feeMinor, currencyCode: noShowEconomics.currencyCode, refundRequired: 'manual_review' } })
    }
    // No payout or revenue journal is posted until a reviewed allocation policy and settlement workflow exist.
    if (trip.driverId && ['driver_en_route', 'driver_arrived', 'in_progress'].includes(next)) await tx.driverProfile.updateMany({ where: { id: trip.driverId, dispatchStatus: { in: ['available', 'offered', 'assigned', 'on_trip'] } }, data: { dispatchStatus: 'on_trip' } })
    if (trip.acceptedOfferId && ['completed', 'cancelled', 'no_show'].includes(next)) await tx.matchOffer.updateMany({ where: { id: trip.acceptedOfferId, status: 'accepted', reservationReleasedAt: null }, data: { reservationReleasedAt: new Date() } })
    if (trip.driverId && ['completed', 'cancelled', 'no_show'].includes(next)) await refreshDriverPresentDispatchStatus(tx, trip.driverId)
    return updated
  }, { isolationLevel: 'Serializable' })
}

export async function publicRideshareTrip(_root: unknown, args: { confirmationCode: string; tripToken?: string | null; requestId?: string | null; requestProof?: string | null }, context: any) {
  return riderTripStatus(_root, args, context)
}
