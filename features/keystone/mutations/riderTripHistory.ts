import { authorizedRequestHeader, requestOwnerWhere } from '../domain/requestAuthority'
import { hasRequestTripBinding } from '../domain/requestTripBinding'
import { decodeKeyset, encodeKeyset } from '../domain/keysetCursor'

/** Purpose-limited continuation. Cursor data is a position; the original
 * request owner/proof and current reciprocal assignment are checked each page. */
export async function riderTripHistory(_root: unknown, args: { requestId: string; requestProof?: string | null; kind: string; cursor?: string | null }, context: any) {
  if (!['events','payments','reviews'].includes(args.kind)) throw new Error('Unknown history kind.')
  return context.prisma.$transaction(async (tx: any) => {
    const header = await authorizedRequestHeader(tx, context.session, args.requestId, args.requestProof)
    if (!header) return null
    const request = await tx.rideRequest.findFirst({ where: requestOwnerWhere(header), include: {
      quote: { select: { id: true, publicId: true, requestId: true, service: { select: { fleetId: true } } } },
      trip: { include: { acceptedOffer: true } },
    } })
    if (!request?.trip || !hasRequestTripBinding(request, request.trip)) return null
    const trip = request.trip
    const scope = JSON.stringify([header.riderId || 'guest', header.fleetId, header.id, trip.id, trip.acceptedOfferId])
    const purpose = `rider_trip_${args.kind}`
    const boundary = decodeKeyset(args.cursor, purpose, scope)
    const field = args.kind === 'events' ? 'occurredAt' : args.kind === 'payments' ? 'createdAt' : 'submittedAt'
    const where = { tripId: trip.id, ...(args.kind === 'reviews' ? { status: 'published' } : {}), ...(boundary ? boundary.time === null
      ? { [field]: null, id: { lt: boundary.id } }
      : { OR: [{ [field]: { lt: new Date(boundary.time) } }, { [field]: new Date(boundary.time), id: { lt: boundary.id } }, { [field]: null }] }
      : {}) }
    const select = args.kind === 'events'
      ? { id: true, eventType: true, fromStatus: true, toStatus: true, occurredAt: true }
      : args.kind === 'payments'
        ? { id: true, amountMinor: true, currencyCode: true, status: true, createdAt: true }
        : { id: true, direction: true, rating: true, body: true, status: true, submittedAt: true }
    const model = args.kind === 'events' ? tx.tripEvent : args.kind === 'payments' ? tx.payment : tx.review
    const limit = args.kind === 'events' ? 100 : 20
    const rows = await model.findMany({ where, orderBy: [{ [field]: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], take: limit + 1, select })
    const items = rows.slice(0, limit)
    const last = items.at(-1)
    return { requestId: header.id, tripId: trip.id, kind: args.kind, items, nextCursor: rows.length > limit ? encodeKeyset(purpose, scope, { id: last.id, time: last[field]?.toISOString() || null }) : null }
  }, { isolationLevel: 'RepeatableRead' })
}
