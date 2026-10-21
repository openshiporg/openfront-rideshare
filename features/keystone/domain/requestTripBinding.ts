import { isDeepStrictEqual } from 'node:util'

type LinkedRequest = { id: string; fleetId: string | null; riderId: string | null; quoteSnapshot: unknown; quote: { id?: string; publicId?: string; requestId: string | null; service: { fleetId: string | null } | null } | null }
type LinkedTrip = { requestId: string | null; fleetId: string | null; riderId: string | null; driverId: string | null; vehicleId: string | null; acceptedOfferId: string | null; status: string | null; bookingSnapshot: unknown; acceptedOffer: { id: string; requestId: string | null; driverId: string | null; vehicleId: string | null; status: string | null } | null }

export function hasRequestQuoteBinding(request: LinkedRequest): boolean {
  if (!request.fleetId || request.quote?.requestId !== request.id || request.quote.service?.fleetId !== request.fleetId) return false
  const snapshot = request.quoteSnapshot as { _requestReceipt?: Record<string, unknown> } | null
  const present = Boolean(snapshot && Object.prototype.hasOwnProperty.call(snapshot, '_requestReceipt'))
  const binding = snapshot?._requestReceipt
  // Legacy account history has no v2 recovery metadata; it still requires the
  // reciprocal FK and accepted snapshot. Present malformed metadata is not legacy.
  return !present || Boolean(binding && binding.version === 2 && binding.quoteId === request.quote.id && binding.quotePublicId === request.quote.publicId && binding.fleetId === request.fleetId && binding.riderId === request.riderId)
}

/** A confirmation code or Trip FK alone is never proof of a current customer handoff. */
export function hasRequestTripBinding(request: LinkedRequest, trip: LinkedTrip): boolean {
  const offer = trip.acceptedOffer
  const quote = (trip.bookingSnapshot as { quote?: unknown } | null)?.quote
  return Boolean(hasRequestQuoteBinding(request) &&
    trip.requestId === request.id && trip.fleetId === request.fleetId && trip.riderId === request.riderId &&
    trip.driverId && trip.vehicleId && offer && trip.acceptedOfferId === offer.id && offer.requestId === request.id && offer.driverId === trip.driverId && offer.vehicleId === trip.vehicleId &&
    (trip.status === 'cancelled' ? offer.status === 'withdrawn' : offer.status === 'accepted') &&
    quote && isDeepStrictEqual(quote, request.quoteSnapshot))
}
