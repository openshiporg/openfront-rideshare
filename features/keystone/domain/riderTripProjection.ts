import { projectPublishedReviews } from './publicTripProjection'
import { projectFleetBrand } from './fleetBrand'

export function projectRiderTrip(trip: any) {
  const snapshot = trip.bookingSnapshot && typeof trip.bookingSnapshot === 'object' ? trip.bookingSnapshot : {}
  const quote = snapshot.quote && typeof snapshot.quote === 'object' ? snapshot.quote : {}
  const route = quote.routeEvidence && typeof quote.routeEvidence === 'object' ? quote.routeEvidence : {}
  const service = snapshot.service && typeof snapshot.service === 'object' ? snapshot.service : {}
  const vehicle = snapshot.vehicle && typeof snapshot.vehicle === 'object' ? snapshot.vehicle : {}
  const fare = (value: any) => ({
    currencyCode: value.currencyCode || null, totalMinor: value.totalMinor ?? null,
    baseFareMinor: value.baseFareMinor ?? null, distanceMinor: value.distanceMinor ?? null,
    durationMinor: value.durationMinor ?? null, bookingFeeMinor: value.bookingFeeMinor ?? null,
    cancellationFeeMinor: value.cancellationFeeMinor ?? null, noShowFeeMinor: value.noShowFeeMinor ?? null,
    routeEvidence: { provider: route.provider || 'unavailable', authoritative: route.authoritative === true, disclosure: route.disclosure || 'Route evidence unavailable.' },
  })
  const events = Array.isArray(trip.events) ? trip.events : []
  return {
    id: trip.id, requestId: trip.requestId, confirmationCode: trip.confirmationCode, status: trip.status, scheduledFor: trip.scheduledFor,
    fleetBrand: projectFleetBrand(trip.fleet),
    acceptedAt: trip.acceptedAt, enRouteAt: trip.enRouteAt, arrivedAt: trip.arrivedAt, startedAt: trip.startedAt,
    completedAt: trip.completedAt, cancelledAt: trip.cancelledAt, pickupLabel: trip.pickupLabel, dropoffLabel: trip.dropoffLabel,
    bookingSnapshot: { quote: fare(quote), service: { name: service.name, category: service.category }, vehicle: { label: vehicle.label, make: vehicle.make, model: vehicle.model, color: vehicle.color, plateMasked: vehicle.plateMasked } },
    finalFareSnapshot: trip.finalFareSnapshot && typeof trip.finalFareSnapshot === 'object' ? fare(trip.finalFareSnapshot) : null,
    events: events.slice(0, 100).map((event: any) => ({ eventType: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus, occurredAt: event.occurredAt })),
    historyTruncated: events.length > 100,
    payments: (trip.payments || []).map((payment: any) => ({ amountMinor: payment.amountMinor, currencyCode: payment.currencyCode, status: payment.status })),
    reviews: projectPublishedReviews(trip.reviews),
  }
}
