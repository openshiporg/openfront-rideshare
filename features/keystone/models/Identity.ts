import { list } from '@keystone-6/core'
import { checkbox, float, image, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { denyAll } from '@keystone-6/core/access'
import { fleetScopedAccess, lockedOperationalAccess, permissions, relationFilter } from '../access'
import { trackingFields } from './trackingFields'
import { labels } from './labels'
import { DEFAULT_STORE_LOGO_ICON, DEFAULT_STORE_LOGO_COLOR, normalizeStoreLogoColor } from '../../platform/settings/branding/store-logo'
import { sanitizeStoreLogoSvg } from '../utils/storeLogo'
import { fleetConfigProblems } from '../domain/fleetConfig'

export const Fleet = list({
  ui: { hideCreate: true, hideDelete: true },
  access: fleetScopedAccess('fleetAdmin'),
  // Receipts format times in the fleet's zone, fares are in its currency and trip locations are kept for its
  // retention days; createFleet checks them, and so must any later edit, or receipts and location writes break.
  hooks: { validateInput: ({ resolvedData, addValidationError }) => {
    for (const message of fleetConfigProblems(resolvedData as Record<string, unknown>)) addValidationError(message)
  } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    status: select({ options: [{ label: 'Setup', value: 'setup' }, { label: 'Active', value: 'active' }, { label: 'Paused', value: 'paused' }], defaultValue: 'setup' }),
    publicDescription: text({ ui: { displayMode: 'textarea' } }),
    heroImage: image({ storage: 'my_images', label: 'Hero image', ui: { description: 'Shown behind the rider home screen. Leave empty to show the map only.' } }),
    publicCity: text(), countryCode: text({ defaultValue: 'US' }), currencyCode: text({ defaultValue: 'USD' }), timezone: text({ defaultValue: 'UTC' }),
    supportEmail: text(), supportPhone: text(),
    logoIcon: text({ defaultValue: DEFAULT_STORE_LOGO_ICON, hooks: {
      resolveInput: ({ resolvedData, fieldKey }) => {
        const value = resolvedData[fieldKey]
        return value === undefined || value === null || value === '' ? value : typeof value === 'string' ? sanitizeStoreLogoSvg(value) : ''
      },
      validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
        if (typeof inputData?.[fieldKey] === 'string' && inputData[fieldKey].trim() && !resolvedData?.[fieldKey]) addValidationError('Logo must be a safe SVG document.')
      },
    } }),
    logoColor: text({ defaultValue: DEFAULT_STORE_LOGO_COLOR, hooks: { resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] === undefined ? undefined : normalizeStoreLogoColor(resolvedData[fieldKey]) } }),
    riderAccounts: select({ options: [{ label: 'Closed', value: 'closed' }, { label: 'Open', value: 'open' }], defaultValue: 'closed', validation: { isRequired: true } }),
    operationsMode: select({ options: [{ label: 'Off', value: 'off' }, { label: 'Manual dispatch', value: 'manual' }, { label: 'Auto dispatch', value: 'auto' }], defaultValue: 'off', validation: { isRequired: true }, ui: { description: 'Auto dispatch offers each new ride to the nearest available driver, one at a time; operators can still offer rides by hand.' } }),
    preciseLocationRetentionDays: text({ defaultValue: '30' }),
    memberships: relationship({ ...relationFilter('FleetMembership'), ref: 'FleetMembership.fleet', many: true, access: { create: () => false, update: () => false } }), drivers: relationship({ ...relationFilter('DriverProfile'), ref: 'DriverProfile.fleet', many: true, access: { create: () => false, update: () => false } }),
    riders: relationship({ ...relationFilter('RiderProfile'), ref: 'RiderProfile.homeFleet', many: true, access: { create: () => false, update: () => false } }), vehicles: relationship({ ...relationFilter('Vehicle'), ref: 'Vehicle.fleet', many: true, access: { create: () => false, update: () => false } }),
    serviceAreas: relationship({ ...relationFilter('ServiceArea'), ref: 'ServiceArea.fleet', many: true, access: { create: () => false, update: () => false } }), services: relationship({ ...relationFilter('RideService'), ref: 'RideService.fleet', many: true, access: { create: () => false, update: () => false } }),
    fareRules: relationship({ ...relationFilter('FareRule'), ref: 'FareRule.fleet', many: true, access: { create: () => false, update: () => false } }), rides: relationship({ ...relationFilter('RideRequest'), ref: 'RideRequest.fleet', many: true, access: { create: () => false, update: () => false } }), trips: relationship({ ...relationFilter('Trip'), ref: 'Trip.fleet', many: true, access: { create: () => false, update: () => false } }),
    policies: relationship({ ...relationFilter('Policy'), ref: 'Policy.fleet', many: true, access: { create: () => false, update: () => false } }), providers: relationship({ ...relationFilter('ProviderConnection'), ref: 'ProviderConnection.fleet', many: true, access: { create: () => false, update: () => false } }),
    marketplaceRegistration: relationship({ ...relationFilter('MarketplaceRegistration'), ref: 'MarketplaceRegistration.fleet', access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const FleetMembership = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['role'] },
  access: lockedOperationalAccess,
  fields: {
    label: labels.fleetMembership,
    fleet: relationship({ ...relationFilter('Fleet'), ref: 'Fleet.memberships', access: { create: () => false, update: () => false } }), user: relationship({ ...relationFilter('User'), ref: 'User.fleetMemberships', access: { create: () => false, update: () => false } }),
    role: select({ options: ['owner', 'dispatcher', 'support', 'finance', 'viewer'].map(value => ({ label: value, value })), defaultValue: 'viewer' }),
    status: select({ options: ['invited', 'active', 'suspended'].map(value => ({ label: value, value })), defaultValue: 'invited' }),
    invitedAt: timestamp(), acceptedAt: timestamp(),
    ...trackingFields,
  },
})

export const DriverProfile = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'publicName', searchFields: ['publicName'] },
  access: fleetScopedAccess('drivers'),
  fields: {
    user: relationship({ ...relationFilter('User'), ref: 'User.driverProfile', access: { create: () => false, update: () => false } }), fleet: relationship({ ...relationFilter('Fleet'), ref: 'Fleet.drivers', access: { create: () => false, update: () => false } }),
    publicName: text({ validation: { isRequired: true } }), publicBio: text({ ui: { displayMode: 'textarea' } }), publicPhotoUrl: text(),
    photo: image({ storage: 'my_images', label: 'Driver’s own photo', ui: { description: 'A photo the driver uploaded of themselves, shown to their rider on the trip card.' } }),
    status: select({ options: ['applicant', 'pending_review', 'active', 'paused', 'ineligible', 'offboarded'].map(value => ({ label: value, value })), defaultValue: 'applicant', access: { create: () => false, update: () => false } }),
    dispatchStatus: select({ options: ['offline', 'available', 'offered', 'assigned', 'on_trip'].map(value => ({ label: value, value })), defaultValue: 'offline', access: { create: () => false, update: () => false } }),
    // Where the driver last was while online, rounded to about 100 m. Auto-dispatch ranks drivers by it.
    lastLocationLng: float({ access: { create: () => false, update: () => false } }), lastLocationLat: float({ access: { create: () => false, update: () => false } }), lastLocationAt: timestamp({ access: { create: () => false, update: () => false } }),
    acceptsScheduled: checkbox({ defaultValue: true }), languages: json({ defaultValue: [] }), accessibilityTrainingEvidence: text(),
    documents: relationship({ ...relationFilter('ComplianceDocument'), ref: 'ComplianceDocument.driver', many: true, access: { create: () => false, update: () => false } }), vehicles: relationship({ ...relationFilter('Vehicle'), ref: 'Vehicle.drivers', many: true, access: { create: () => false, update: () => false } }),
    availabilityRules: relationship({ ...relationFilter('AvailabilityRule'), ref: 'AvailabilityRule.driver', many: true, access: { create: () => false, update: () => false } }), availabilityExceptions: relationship({ ...relationFilter('AvailabilityException'), ref: 'AvailabilityException.driver', many: true, access: { create: () => false, update: () => false } }),
    policyEvaluations: relationship({ ...relationFilter('PolicyEvaluation'), ref: 'PolicyEvaluation.driver', many: true, access: { create: () => false, update: () => false } }), matchOffers: relationship({ ...relationFilter('MatchOffer'), ref: 'MatchOffer.driver', many: true, access: { create: () => false, update: () => false } }), trips: relationship({ ...relationFilter('Trip'), ref: 'Trip.driver', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const RiderProfile = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'displayName', searchFields: ['displayName'] },
  access: fleetScopedAccess('safety'),
  fields: {
    user: relationship({ ...relationFilter('User'), ref: 'User.riderProfile', access: { create: () => false, update: () => false } }), homeFleet: relationship({ ...relationFilter('Fleet'), ref: 'Fleet.riders', access: { create: () => false, update: () => false } }), displayName: text({ validation: { isRequired: true } }),
    savedPlaces: json({ defaultValue: [], isFilterable: permissions.canManagePeople, isOrderable: permissions.canManagePeople, access: { read: permissions.canManagePeople, update: permissions.canManagePeople } }),
    accessibilityPreferences: json({ defaultValue: {} }), communicationPreferences: json({ defaultValue: {} }),
    emergencyContactEncryptedRef: text({ isFilterable: permissions.canManageSafety, isOrderable: permissions.canManageSafety, access: { read: permissions.canManageSafety, update: permissions.canManageSafety } }),
    // The rider's saved card (Stripe). Only the brand, last four and expiry are readable; the ids stay server-side.
    stripeCustomerId: text({ isFilterable: false, isOrderable: false, access: { read: denyAll, create: () => false, update: () => false } }), cardPaymentMethodId: text({ isFilterable: false, isOrderable: false, access: { read: denyAll, create: () => false, update: () => false } }),
    cardBrand: text({ access: { create: () => false, update: () => false } }), cardLast4: text({ access: { create: () => false, update: () => false } }),
    cardExpMonth: integer({ access: { create: () => false, update: () => false } }), cardExpYear: integer({ access: { create: () => false, update: () => false } }), cardSavedAt: timestamp({ access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})
