import type { PrismaClient } from '@prisma/client'
import { humanSessionId, type Session } from '../access'
import { authorizedTripHeader, tripAuthorityWhere } from '../domain/tripAuthority'
import { hasRequestTripBinding } from '../domain/requestTripBinding'
import { projectRiderTrip } from '../domain/riderTripProjection'
import { decodeKeyset, encodeKeyset } from '../domain/keysetCursor'
import { fenceHumanAuthority } from '../domain/authorityFence'

/** Operator-purpose readback, never a rider credential issuer or delivery claim. */
export async function operatorTripHandoff(_root: unknown, args: { tripId: string; cursor?: string | null }, context: { prisma: PrismaClient; session?: Session }) {
  if (!humanSessionId(context.session) || typeof args.tripId !== 'string' || !args.tripId || args.tripId.length > 200) return null
  return context.prisma.$transaction(async tx => {
    await fenceHumanAuthority(tx, context.session)
    const authority = await authorizedTripHeader(tx, context.session, args.tripId, 'operator')
    if (!authority) return null
    const scope = JSON.stringify([authority.actorId, authority.header.fleetId, authority.header.id, authority.header.acceptedOfferId])
    const boundary = decodeKeyset(args.cursor, 'operator_trip_events', scope)
    if (boundary && boundary.time === null) throw new Error('Invalid event page cursor.')
    if (!authority.bound) {
      const state = await tx.trip.findFirst({ where: authority.header, select: { id: true, status: true } })
      return state ? { available: false, tripId: state.id, status: state.status, requestId: null, requestNumber: null, requestStatus: null, acceptedOfferId: null, events: [], historyTruncated: false } : null
    }
    const trip = await tx.trip.findFirst({ where: tripAuthorityWhere(authority.header), include: {
      request: { include: { quote: { include: { service: { select: { fleetId: true } } } } } },
      acceptedOffer: true, events: { where: boundary ? { OR: [{ occurredAt: { lt: new Date(boundary.time!) } }, { occurredAt: new Date(boundary.time!), id: { lt: boundary.id } }] } : {}, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 101 },
    } })
    if (!trip) return null
    const request = trip.request
    const available = Boolean(request && hasRequestTripBinding(request, trip))
    const history = available ? projectRiderTrip(trip) : null
    return {
      available, tripId: trip.id, status: trip.status,
      requestId: available ? request!.id : null,
      requestNumber: available ? request!.requestNumber : null,
      requestStatus: available ? request!.status : null,
      acceptedOfferId: available ? trip.acceptedOfferId : null,
      events: history?.events || [], historyTruncated: history?.historyTruncated || false,
      nextCursor: available && trip.events.length > 100 ? encodeKeyset('operator_trip_events', scope, { id: trip.events[99].id, time: trip.events[99].occurredAt!.toISOString() }) : null,
    }
  }, { isolationLevel: 'RepeatableRead' })
}
