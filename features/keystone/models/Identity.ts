import { list } from '@keystone-6/core'
import { checkbox, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { fleetScopedAccess, lockedOperationalAccess, permissions } from '../access'
import { trackingFields } from './trackingFields'
import { DEFAULT_STORE_LOGO_ICON, DEFAULT_STORE_LOGO_COLOR, normalizeStoreLogoColor } from '../../platform/settings/branding/store-logo'
import { sanitizeStoreLogoSvg } from '../utils/storeLogo'

export const Fleet = list({
  access: fleetScopedAccess('fleetAdmin'),
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    status: select({ options: [{ label: 'Setup', value: 'setup' }, { label: 'Active', value: 'active' }, { label: 'Paused', value: 'paused' }], defaultValue: 'setup' }),
    publicDescription: text({ ui: { displayMode: 'textarea' } }),
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
    preciseLocationRetentionDays: text({ defaultValue: '30' }),
    memberships: relationship({ ref: 'FleetMembership.fleet', many: true, access: { create: () => false, update: () => false } }), drivers: relationship({ ref: 'DriverProfile.fleet', many: true, access: { create: () => false, update: () => false } }),
    riders: relationship({ ref: 'RiderProfile.homeFleet', many: true, access: { create: () => false, update: () => false } }), vehicles: relationship({ ref: 'Vehicle.fleet', many: true, access: { create: () => false, update: () => false } }),
    serviceAreas: relationship({ ref: 'ServiceArea.fleet', many: true, access: { create: () => false, update: () => false } }), services: relationship({ ref: 'RideService.fleet', many: true, access: { create: () => false, update: () => false } }),
    fareRules: relationship({ ref: 'FareRule.fleet', many: true, access: { create: () => false, update: () => false } }), rides: relationship({ ref: 'RideRequest.fleet', many: true, access: { create: () => false, update: () => false } }), trips: relationship({ ref: 'Trip.fleet', many: true, access: { create: () => false, update: () => false } }),
    policies: relationship({ ref: 'Policy.fleet', many: true, access: { create: () => false, update: () => false } }), providers: relationship({ ref: 'ProviderConnection.fleet', many: true, access: { create: () => false, update: () => false } }),
    marketplaceRegistration: relationship({ ref: 'MarketplaceRegistration.fleet', access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const FleetMembership = list({
  access: lockedOperationalAccess,
  fields: {
    fleet: relationship({ ref: 'Fleet.memberships', access: { create: () => false, update: () => false } }), user: relationship({ ref: 'User.fleetMemberships', access: { create: () => false, update: () => false } }),
    role: select({ options: ['owner', 'dispatcher', 'support', 'finance', 'viewer'].map(value => ({ label: value, value })), defaultValue: 'viewer' }),
    status: select({ options: ['invited', 'active', 'suspended'].map(value => ({ label: value, value })), defaultValue: 'invited' }),
    invitedAt: timestamp(), acceptedAt: timestamp(),
    ...trackingFields,
  },
})

export const DriverProfile = list({
  access: fleetScopedAccess('drivers'),
  fields: {
    user: relationship({ ref: 'User.driverProfile', access: { create: () => false, update: () => false } }), fleet: relationship({ ref: 'Fleet.drivers', access: { create: () => false, update: () => false } }),
    publicName: text({ validation: { isRequired: true } }), publicBio: text({ ui: { displayMode: 'textarea' } }), publicPhotoUrl: text(),
    status: select({ options: ['applicant', 'pending_review', 'active', 'paused', 'ineligible', 'offboarded'].map(value => ({ label: value, value })), defaultValue: 'applicant', access: { create: () => false, update: () => false } }),
    dispatchStatus: select({ options: ['offline', 'available', 'offered', 'assigned', 'on_trip'].map(value => ({ label: value, value })), defaultValue: 'offline', access: { create: () => false, update: () => false } }),
    acceptsScheduled: checkbox({ defaultValue: true }), languages: json({ defaultValue: [] }), accessibilityTrainingEvidence: text(),
    documents: relationship({ ref: 'ComplianceDocument.driver', many: true, access: { create: () => false, update: () => false } }), vehicles: relationship({ ref: 'Vehicle.drivers', many: true, access: { create: () => false, update: () => false } }),
    availabilityRules: relationship({ ref: 'AvailabilityRule.driver', many: true, access: { create: () => false, update: () => false } }), availabilityExceptions: relationship({ ref: 'AvailabilityException.driver', many: true, access: { create: () => false, update: () => false } }),
    policyEvaluations: relationship({ ref: 'PolicyEvaluation.driver', many: true, access: { create: () => false, update: () => false } }), matchOffers: relationship({ ref: 'MatchOffer.driver', many: true, access: { create: () => false, update: () => false } }), trips: relationship({ ref: 'Trip.driver', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const RiderProfile = list({
  access: fleetScopedAccess('safety'),
  fields: {
    user: relationship({ ref: 'User.riderProfile', access: { create: () => false, update: () => false } }), homeFleet: relationship({ ref: 'Fleet.riders', access: { create: () => false, update: () => false } }), displayName: text({ validation: { isRequired: true } }),
    savedPlaces: json({ defaultValue: [], access: { read: permissions.canManagePeople, update: permissions.canManagePeople } }),
    accessibilityPreferences: json({ defaultValue: {} }), communicationPreferences: json({ defaultValue: {} }),
    emergencyContactEncryptedRef: text({ access: { read: permissions.canManageSafety, update: permissions.canManageSafety } }),
    ...trackingFields,
  },
})
