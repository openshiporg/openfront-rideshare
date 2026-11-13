import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { fleetScopedAccess, lockedFleetAccess, operatorAccess, permissions, relationFilter } from '../access'
import { trackingFields } from './trackingFields'
import { labels } from './labels'

const documentAccess = lockedFleetAccess('drivers')

export const Vehicle = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['label', 'plateMasked'] },
  access: operatorAccess,
  fields: {
    fleet: relationship({ ...relationFilter('Fleet'), ref: 'Fleet.vehicles', access: { create: () => false, update: () => false } }), drivers: relationship({ ...relationFilter('DriverProfile'), ref: 'DriverProfile.vehicles', many: true, access: { create: () => false, update: () => false } }),
    label: text({ validation: { isRequired: true } }), make: text(), model: text(), year: integer(), color: text(),
    plateMasked: text(), plateEncryptedRef: text({ isFilterable: false, isOrderable: false, access: { read: denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    vinEncryptedRef: text({ isFilterable: false, isOrderable: false, access: { read: denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    capacity: integer({ defaultValue: 4, validation: { min: 1, max: 50 } }), wheelchairAccessible: checkbox({ defaultValue: false }),
    status: select({ options: ['pending_review', 'active', 'maintenance', 'suspended', 'retired'].map(value => ({ label: value, value })), defaultValue: 'pending_review', access: { create: () => false, update: () => false } }),
    documents: relationship({ ...relationFilter('ComplianceDocument'), ref: 'ComplianceDocument.vehicle', many: true, access: { create: () => false, update: () => false } }), policyEvaluations: relationship({ ...relationFilter('PolicyEvaluation'), ref: 'PolicyEvaluation.vehicle', many: true, access: { create: () => false, update: () => false } }), trips: relationship({ ...relationFilter('Trip'), ref: 'Trip.vehicle', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const ComplianceDocument = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['issuer', 'referenceMasked'] },
  access: documentAccess,
  fields: {
    label: labels.complianceDocument,
    driver: relationship({ ...relationFilter('DriverProfile'), ref: 'DriverProfile.documents', access: { create: () => false, update: () => false } }), vehicle: relationship({ ...relationFilter('Vehicle'), ref: 'Vehicle.documents', access: { create: () => false, update: () => false } }),
    kind: select({ options: ['driver_license', 'vehicle_registration', 'insurance', 'inspection', 'background_check', 'business_license', 'other'].map(value => ({ label: value, value })) }),
    status: select({ options: ['submitted', 'under_review', 'accepted_evidence', 'rejected_evidence', 'expired', 'revoked'].map(value => ({ label: value, value })), defaultValue: 'submitted' }),
    issuer: text(), referenceMasked: text(), secureFileRef: text({ isFilterable: false, isOrderable: false, access: { read: denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    issuedAt: timestamp(), expiresAt: timestamp(), reviewedAt: timestamp(), reviewer: relationship({ ...relationFilter('User'), ref: 'User' }), reviewNotes: text({ ui: { displayMode: 'textarea' } }),
    evidenceMetadata: json({ defaultValue: {}, isFilterable: permissions.canManageDrivers, isOrderable: permissions.canManageDrivers, access: { read: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    ...trackingFields,
  },
})

export const Policy = list({
  ui: { hideCreate: true, hideDelete: true },
  access: fleetScopedAccess('fleetAdmin'),
  fields: {
    fleet: relationship({ ...relationFilter('Fleet'), ref: 'Fleet.policies', access: { create: () => false, update: () => false } }), name: text({ validation: { isRequired: true } }), version: text({ validation: { isRequired: true } }), jurisdiction: text(),
    kind: select({ options: ['driver_eligibility', 'vehicle_eligibility', 'insurance', 'licensing', 'background_check', 'location_retention', 'pricing', 'cancellation'].map(value => ({ label: value, value })) }),
    status: select({ options: ['draft', 'active', 'retired'].map(value => ({ label: value, value })), defaultValue: 'draft' }),
    requirements: json({ defaultValue: {} }), evidenceSources: json({ defaultValue: [] }), disclaimer: text({ defaultValue: 'Evidence recording is not legal approval or a compliance certification.', ui: { displayMode: 'textarea' } }),
    evaluations: relationship({ ...relationFilter('PolicyEvaluation'), ref: 'PolicyEvaluation.policy', many: true, access: { create: () => false, update: () => false } }), ...trackingFields,
  },
})

export const PolicyEvaluation = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: lockedFleetAccess('drivers'),
  fields: {
    label: labels.policyEvaluation,
    policy: relationship({ ...relationFilter('Policy'), ref: 'Policy.evaluations' }), driver: relationship({ ...relationFilter('DriverProfile'), ref: 'DriverProfile.policyEvaluations' }), vehicle: relationship({ ...relationFilter('Vehicle'), ref: 'Vehicle.policyEvaluations' }),
    outcome: select({ options: ['pending', 'eligible', 'ineligible', 'manual_review'].map(value => ({ label: value, value })), defaultValue: 'pending' }),
    reasons: json({ defaultValue: [] }), evidenceSnapshot: json({ defaultValue: [] }), evaluatedAt: timestamp(), expiresAt: timestamp(), evaluator: relationship({ ...relationFilter('User'), ref: 'User' }),
    ...trackingFields,
  },
})

export const ProviderConnection = list({
  ui: { hideCreate: true, hideDelete: true },
  access: fleetScopedAccess('fleetAdmin'),
  fields: {
    fleet: relationship({ ...relationFilter('Fleet'), ref: 'Fleet.providers', access: { create: () => false, update: () => false } }), name: text({ validation: { isRequired: true } }),
    kind: select({ options: ['mapping', 'payment', 'communications', 'identity', 'background_check', 'location', 'notification'].map(value => ({ label: value, value })) }),
    adapter: text({ validation: { isRequired: true } }), status: select({ options: ['unconfigured', 'sandbox', 'active', 'disabled'].map(value => ({ label: value, value })), defaultValue: 'unconfigured' }),
    config: json({ defaultValue: {} }), secretReference: text({ isFilterable: false, isOrderable: false, access: { read: denyAll } }),
    evidencePolicyUrl: text(), lastVerifiedAt: timestamp(), capabilities: json({ defaultValue: [] }),
    ...trackingFields,
  },
})
