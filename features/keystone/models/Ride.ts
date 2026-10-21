import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { lockedOperationalAccess } from '../access'
import { trackingFields } from './trackingFields'

export const RideRequest = list({
  access: lockedOperationalAccess,
  fields: {
    fleet: relationship({ ref: 'Fleet.rides', access: { create: () => false, update: () => false } }), rider: relationship({ ref: 'User.requestedRides', access: { create: () => false, update: () => false } }), quote: relationship({ ref: 'RideQuote.request', access: { create: () => false, update: () => false } }),
    requestNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }), status: select({ options: ['requested', 'matching', 'matched', 'cancelled', 'expired'].map(value => ({ label: value, value })), defaultValue: 'requested' }),
    requestedFor: timestamp(), passengerCount: integer({ defaultValue: 1, validation: { min: 1, max: 50 } }), accessibilityNeeds: json({ defaultValue: {} }), riderNotes: text({ ui: { displayMode: 'textarea' } }),
    pickupLabel: text(), dropoffLabel: text(), preciseRouteEncryptedRef: text({ access: { read: denyAll } }),
    quoteSnapshot: json({ defaultValue: {} }), guestProofHash: text({ access: { read: denyAll } }), guestProofExpiresAt: timestamp(),
    matchOffers: relationship({ ref: 'MatchOffer.request', many: true, access: { create: () => false, update: () => false } }), trip: relationship({ ref: 'Trip.request', access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const MatchOffer = list({
  access: lockedOperationalAccess,
  fields: {
    request: relationship({ ref: 'RideRequest.matchOffers', access: { create: () => false, update: () => false } }), driver: relationship({ ref: 'DriverProfile.matchOffers', access: { create: () => false, update: () => false } }), vehicle: relationship({ ref: 'Vehicle', access: { create: () => false, update: () => false } }),
    status: select({ options: ['offered', 'accepted', 'declined', 'expired', 'withdrawn'].map(value => ({ label: value, value })), defaultValue: 'offered' }),
    offeredAt: timestamp({ defaultValue: { kind: 'now' } }), reservationStartAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, access: { read: denyAll, create: () => false, update: () => false } }), reservationReleasedAt: timestamp({ access: { read: denyAll, create: () => false, update: () => false } }), expiresAt: timestamp({ validation: { isRequired: true } }), respondedAt: timestamp(), declineReason: text(),
    idempotencyKey: text({ isIndexed: 'unique', access: { read: denyAll } }), eligibilitySnapshot: json({ defaultValue: {} }),
    acceptedTrip: relationship({ ref: 'Trip.acceptedOffer', access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const Trip = list({
  access: lockedOperationalAccess,
  fields: {
    fleet: relationship({ ref: 'Fleet.trips', access: { create: () => false, update: () => false } }), request: relationship({ ref: 'RideRequest.trip', db: { foreignKey: { map: 'request' } }, access: { create: () => false, update: () => false } }), acceptedOffer: relationship({ ref: 'MatchOffer.acceptedTrip', db: { foreignKey: { map: 'acceptedOffer' } }, access: { create: () => false, update: () => false } }), rider: relationship({ ref: 'User.trips', access: { create: () => false, update: () => false } }), driver: relationship({ ref: 'DriverProfile.trips', access: { create: () => false, update: () => false } }), vehicle: relationship({ ref: 'Vehicle.trips', access: { create: () => false, update: () => false } }),
    confirmationCode: text({ isIndexed: 'unique', validation: { isRequired: true } }), status: select({ options: ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress', 'completed', 'cancelled', 'no_show'].map(value => ({ label: value, value })), defaultValue: 'driver_assigned' }),
    scheduledFor: timestamp(), acceptedAt: timestamp(), enRouteAt: timestamp(), arrivedAt: timestamp(), startedAt: timestamp(), completedAt: timestamp(), cancelledAt: timestamp(),
    pickupLabel: text(), dropoffLabel: text(), bookingSnapshot: json({ defaultValue: {} }), finalFareSnapshot: json(),
    managementTokenHash: text({ access: { read: denyAll } }), managementTokenExpiresAt: timestamp(), managementTokenRevokedAt: timestamp(),
    events: relationship({ ref: 'TripEvent.trip', many: true, access: { create: () => false, update: () => false } }), locationEvents: relationship({ ref: 'LocationEvent.trip', many: true, access: { create: () => false, update: () => false } }), cancellations: relationship({ ref: 'Cancellation.trip', many: true, access: { create: () => false, update: () => false } }),
    payments: relationship({ ref: 'Payment.trip', many: true, access: { create: () => false, update: () => false } }), ledgerEntries: relationship({ ref: 'LedgerEntry.trip', many: true, access: { create: () => false, update: () => false } }), incidents: relationship({ ref: 'SafetyIncident.trip', many: true, access: { create: () => false, update: () => false } }),
    supportCases: relationship({ ref: 'SupportCase.trip', many: true, access: { create: () => false, update: () => false } }), conversation: relationship({ ref: 'Conversation.trip', access: { create: () => false, update: () => false } }), reviews: relationship({ ref: 'Review.trip', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const TripEvent = list({
  access: lockedOperationalAccess,
  fields: {
    trip: relationship({ ref: 'Trip.events', access: { create: () => false, update: () => false } }), eventType: text({ validation: { isRequired: true } }), fromStatus: text(), toStatus: text(), actorType: select({ options: ['rider', 'driver', 'operator', 'provider', 'system'].map(value => ({ label: value, value })) }),
    actorUser: relationship({ ref: 'User', access: { create: () => false, update: () => false } }), idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), occurredAt: timestamp({ defaultValue: { kind: 'now' } }), metadata: json({ defaultValue: {} }),
    ...trackingFields,
  },
})

export const LocationEvent = list({
  access: { ...lockedOperationalAccess, filter: { ...lockedOperationalAccess.filter, query: async args => {
    const scope = await lockedOperationalAccess.filter.query(args)
    return scope === false ? false : { AND: [...(scope === true ? [] : [scope]), { expiresAt: { gt: new Date().toISOString() } }] }
  } } },
  fields: {
    trip: relationship({ ref: 'Trip.locationEvents', access: { create: () => false, update: () => false } }), actorType: select({ options: ['driver', 'rider', 'operator', 'provider'].map(value => ({ label: value, value })) }),
    recordedAt: timestamp({ validation: { isRequired: true } }), coarseGeohash: text(), encryptedCoordinateRef: text({ access: { read: denyAll } }), accuracyMeters: integer(), providerEvidence: json({ defaultValue: {}, access: { read: denyAll } }), expiresAt: timestamp(),
    ...trackingFields,
  },
})

export const Cancellation = list({
  access: lockedOperationalAccess,
  fields: {
    trip: relationship({ ref: 'Trip.cancellations', access: { create: () => false, update: () => false } }), actorType: select({ options: ['rider', 'driver', 'operator', 'system'].map(value => ({ label: value, value })) }), reasonCode: text(), reason: text(),
    policySnapshot: json({ defaultValue: {} }), feeMinor: integer({ defaultValue: 0 }), currencyCode: text(), refundRequired: select({ options: ['no', 'partial', 'full', 'manual_review'].map(value => ({ label: value, value })), defaultValue: 'no' }),
    ...trackingFields,
  },
})
