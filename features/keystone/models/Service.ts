import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { fleetScopedAccess, lockedOperationalAccess, operatorAccess, permissions } from '../access'
import { trackingFields } from './trackingFields'
import { validateFareRule } from '../domain/fare'

export const ServiceArea = list({
  access: operatorAccess,
  fields: {
    fleet: relationship({ ref: 'Fleet.serviceAreas', access: { create: () => false, update: () => false } }), name: text({ validation: { isRequired: true } }), publicRegionLabel: text({ validation: { isRequired: true } }),
    countryCode: text({ defaultValue: 'US' }), status: select({ options: ['draft', 'active', 'paused'].map(value => ({ label: value, value })), defaultValue: 'draft' }),
    coarseBounds: json({ defaultValue: {} }), providerGeometryRef: text({ access: { read: denyAll, create: permissions.canManageFleet, update: permissions.canManageFleet } }),
    services: relationship({ ref: 'RideService.serviceAreas', many: true, access: { create: () => false, update: () => false } }), fareRules: relationship({ ref: 'FareRule.serviceArea', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const RideService = list({
  access: operatorAccess,
  fields: {
    fleet: relationship({ ref: 'Fleet.services', access: { create: () => false, update: () => false } }), name: text({ validation: { isRequired: true } }), slug: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    description: text({ ui: { displayMode: 'textarea' } }), status: select({ options: ['draft', 'active', 'paused'].map(value => ({ label: value, value })), defaultValue: 'draft' }),
    category: select({ options: ['standard', 'comfort', 'xl', 'accessible', 'pet_friendly', 'scheduled'].map(value => ({ label: value, value })), defaultValue: 'standard' }),
    passengerCapacity: integer({ defaultValue: 4, validation: { min: 1, max: 50 } }), wheelchairAccessible: checkbox({ defaultValue: false }), advanceBookingMinutes: integer({ defaultValue: 0 }),
    serviceAreas: relationship({ ref: 'ServiceArea.services', many: true, access: { create: () => false, update: () => false } }), fareRules: relationship({ ref: 'FareRule.service', many: true, access: { create: () => false, update: () => false } }), quotes: relationship({ ref: 'RideQuote.service', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const AvailabilityRule = list({
  access: lockedOperationalAccess,
  fields: {
    driver: relationship({ ref: 'DriverProfile.availabilityRules' }), dayOfWeek: integer({ validation: { min: 0, max: 6 } }), startTime: text(), endTime: text(), timezone: text({ defaultValue: 'UTC' }),
    effectiveFrom: timestamp(), effectiveUntil: timestamp(), status: select({ options: ['active', 'paused'].map(value => ({ label: value, value })), defaultValue: 'active' }), ...trackingFields,
  },
})

export const AvailabilityException = list({
  access: lockedOperationalAccess,
  fields: {
    driver: relationship({ ref: 'DriverProfile.availabilityExceptions' }), startsAt: timestamp({ validation: { isRequired: true } }), endsAt: timestamp({ validation: { isRequired: true } }),
    kind: select({ options: ['available', 'blocked'].map(value => ({ label: value, value })), defaultValue: 'blocked' }), reason: text(), ...trackingFields,
  },
})

export const FareRule = list({
  access: fleetScopedAccess('fleetAdmin'),
  hooks: { validateInput: ({ resolvedData, item, addValidationError }) => {
    try { validateFareRule({ ...item, ...resolvedData } as Parameters<typeof validateFareRule>[0]) }
    catch { addValidationError('Check the fare currency, version, multiplier and non-negative minor-unit amounts.') }
  } },
  fields: {
    fleet: relationship({ ref: 'Fleet.fareRules', access: { create: () => false, update: () => false } }), service: relationship({ ref: 'RideService.fareRules', access: { create: () => false, update: () => false } }), serviceArea: relationship({ ref: 'ServiceArea.fareRules', access: { create: () => false, update: () => false } }),
    name: text({ validation: { isRequired: true } }), version: integer({ defaultValue: 1 }), status: select({ options: ['draft', 'active', 'retired'].map(value => ({ label: value, value })), defaultValue: 'draft' }),
    currencyCode: text({ defaultValue: 'USD' }), baseFareMinor: integer({ defaultValue: 0 }), perDistanceUnitMinor: integer({ defaultValue: 0 }), distanceUnit: select({ options: ['kilometer', 'mile'].map(value => ({ label: value, value })), defaultValue: 'mile' }),
    perMinuteMinor: integer({ defaultValue: 0 }), bookingFeeMinor: integer({ defaultValue: 0 }), minimumFareMinor: integer({ defaultValue: 0 }), cancellationFeeMinor: integer({ defaultValue: 0 }), noShowFeeMinor: integer({ defaultValue: 0 }),
    maximumMultiplierBasisPoints: integer({ defaultValue: 10000, validation: { min: 10000, max: 30000 } }), rules: json({ defaultValue: {} }), quotes: relationship({ ref: 'RideQuote.fareRule', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const RideQuote = list({
  access: lockedOperationalAccess,
  fields: {
    service: relationship({ ref: 'RideService.quotes', access: { create: () => false, update: () => false } }), fareRule: relationship({ ref: 'FareRule.quotes', access: { create: () => false, update: () => false } }),
    publicId: text({ isIndexed: 'unique', validation: { isRequired: true } }), handoffId: text({ isIndexed: true }), status: select({ options: ['active', 'accepted', 'expired', 'void'].map(value => ({ label: value, value })), defaultValue: 'active' }),
    pickupLabel: text(), dropoffLabel: text(), routeInputHash: text({ access: { read: denyAll } }), routeEvidence: json({ defaultValue: {} }),
    estimatedDistanceMeters: integer(), estimatedDurationSeconds: integer(), fareSnapshot: json({ defaultValue: {} }), totalMinor: integer({ validation: { min: 0 } }), currencyCode: text(),
    scheduledFor: timestamp(), expiresAt: timestamp({ validation: { isRequired: true } }), guestProofHash: text({ access: { read: denyAll } }), rider: relationship({ ref: 'User', access: { create: () => false, update: () => false } }), request: relationship({ ref: 'RideRequest.quote', access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})
