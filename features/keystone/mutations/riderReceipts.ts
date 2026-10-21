import { authorizedRequestHeader, currentRiderId, requestOwnerWhere } from '../domain/requestAuthority'
import { hasRequestQuoteBinding, hasRequestTripBinding } from '../domain/requestTripBinding'
import { projectRiderTrip } from '../domain/riderTripProjection'
import { fleetBrandSelect, projectFleetBrand } from '../domain/fleetBrand'
import { decodeKeyset, encodeKeyset } from '../domain/keysetCursor'

const requestInclude = {
  fleet: { select: fleetBrandSelect },
  quote: { include: { service: { select: { fleetId: true } } } },
  trip: { include: {
    fleet: { select: fleetBrandSelect },
    acceptedOffer: true,
    events: { orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 101 },
    payments: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 },
    reviews: { where: { status: 'published' }, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], take: 20 },
  } },
}

function projectRequest(request: any) {
  const bound = hasRequestQuoteBinding(request)
  const trip = bound && request.trip && hasRequestTripBinding(request, request.trip) ? projectRiderTrip(request.trip) : null
  return {
    requestId: request.id, requestNumber: request.requestNumber, status: request.status,
    fleetBrand: projectFleetBrand(request.fleet),
    requestedFor: request.requestedFor, pickupLabel: request.pickupLabel, dropoffLabel: request.dropoffLabel,
    createdAt: request.createdAt, trip,
    handoffState: !bound || (request.trip && !trip) ? 'unavailable' : request.status === 'matching' && trip?.status === 'cancelled' ? 'reassignment_pending' : trip ? 'assigned' : 'awaiting_assignment',
  }
}

// Privileged reads return only an explicit DTO AFTER owning User-session or guest receipt
// validation. Operator/driver/global-administrator permissions never grant rider authority.
export async function riderRequestStatus(_root: unknown, args: { requestId: string; requestProof?: string | null }, context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    const header = await authorizedRequestHeader(tx, context.session, args.requestId, args.requestProof)
    if (!header) return null
    const request = await tx.rideRequest.findFirst({ where: requestOwnerWhere(header), include: requestInclude })
    if (!request) return null
    return projectRequest(request)
  }, { isolationLevel: 'RepeatableRead' })
}

export async function myRideshareRequests(_root: unknown, args: { cursor?: string | null }, context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    const riderId = await currentRiderId(tx, context.session)
    if (!riderId) throw new Error('A rider account session is required.')
    const scope = JSON.stringify([riderId])
    const boundary = decodeKeyset(args.cursor, 'rider_requests', scope)
    const rows = await tx.rideRequest.findMany({
      where: { riderId, ...(boundary ? boundary.time === null ? { createdAt: null, id: { lt: boundary.id } } : { OR: [{ createdAt: { lt: new Date(boundary.time) } }, { createdAt: new Date(boundary.time), id: { lt: boundary.id } }, { createdAt: null }] } : {}) },
      orderBy: [{ createdAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], take: 26, include: requestInclude,
    })
    return { items: rows.slice(0, 25).map(projectRequest), nextCursor: rows.length > 25 ? encodeKeyset('rider_requests', scope, { id: rows[24].id, time: rows[24].createdAt?.toISOString() || null }) : null }
  }, { isolationLevel: 'RepeatableRead' })
}

export async function riderTripStatus(_root: unknown, args: { confirmationCode: string; requestId?: string | null; requestProof?: string | null; tripToken?: string | null }, context: any) {
  // Legacy trip tokens were delivered to drivers. They are NOT a rider credential.
  // Retain stored hashes for historical evidence, but never accept them as authority.
  if (typeof args.confirmationCode !== 'string' || !args.confirmationCode || args.confirmationCode.length > 200) return null
  return context.prisma.$transaction(async (tx: any) => {
    const riderId = await currentRiderId(tx, context.session)
    const requestId = args.requestId || (riderId ? (await tx.rideRequest.findFirst({ where: { riderId, trip: { confirmationCode: args.confirmationCode } }, select: { id: true } }))?.id : null)
    if (!requestId) return null
    const header = await authorizedRequestHeader(tx, context.session, requestId, args.requestProof)
    if (!header) return null
    const request = await tx.rideRequest.findFirst({ where: { ...requestOwnerWhere(header), trip: { is: { confirmationCode: args.confirmationCode } } }, include: requestInclude })
    if (!request || request.trip?.confirmationCode !== args.confirmationCode || !hasRequestTripBinding(request, request.trip)) return null
    return projectRiderTrip(request.trip)
  }, { isolationLevel: 'RepeatableRead' })
}
