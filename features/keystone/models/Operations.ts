import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { fleetScopedAccess, lockedFleetAccess, operatorAccess, permissions } from '../access'
import { trackingFields } from './trackingFields'
import { labels } from './labels'

const documentAccess = lockedFleetAccess('drivers')

export const Vehicle = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['label', 'plateMasked'] },
  access: operatorAccess,
  fields: {
    fleet: relationship({ ref: 'Fleet.vehicles', access: { create: () => false, update: () => false } }), drivers: relationship({ ref: 'DriverProfile.vehicles', many: true, access: { create: () => false, update: () => false } }),
    label: text({ validation: { isRequired: true } }), make: text(), model: text(), year: integer(), color: text(),
    plateMasked: text(), plateEncryptedRef: text({ access: { read: denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    vinEncryptedRef: text({ access: { read: denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    capacity: integer({ defaultValue: 4, validation: { min: 1, max: 50 } }), wheelchairAccessible: checkbox({ defaultValue: false }),
    status: select({ options: ['pending_review', 'active', 'maintenance', 'suspended', 'retired'].map(value => ({ label: value, value })), defaultValue: 'pending_review', access: { create: () => false, update: () => false } }),
    documents: relationship({ ref: 'ComplianceDocument.vehicle', many: true, access: { create: () => false, update: () => false } }), policyEvaluations: relationship({ ref: 'PolicyEvaluation.vehicle', many: true, access: { create: () => false, update: () => false } }), trips: relationship({ ref: 'Trip.vehicle', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const ComplianceDocument = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['issuer', 'referenceMasked'] },
  access: documentAccess,
  fields: {
    label: labels.complianceDocument,
    driver: relationship({ ref: 'DriverProfile.documents', access: { create: () => false, update: () => false } }), vehicle: relationship({ ref: 'Vehicle.documents', access: { create: () => false, update: () => false } }),
    kind: select({ options: ['driver_license', 'vehicle_registration', 'insurance', 'inspection', 'background_check', 'business_license', 'other'].map(value => ({ label: value, value })) }),
    status: select({ options: ['submitted', 'under_review', 'accepted_evidence', 'rejected_evidence', 'expired', 'revoked'].map(value => ({ label: value, value })), defaultValue: 'submitted' }),
    issuer: text(), referenceMasked: text(), secureFileRef: text({ access: { read: denyAll, create: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    issuedAt: timestamp(), expiresAt: timestamp(), reviewedAt: timestamp(), reviewer: relationship({ ref: 'User' }), reviewNotes: text({ ui: { displayMode: 'textarea' } }),
    evidenceMetadata: json({ defaultValue: {}, access: { read: permissions.canManageDrivers, update: permissions.canManageDrivers } }),
    ...trackingFields,
  },
})

export const Policy = list({
  ui: { hideCreate: true, hideDelete: true },
  access: fleetScopedAccess('fleetAdmin'),
  fields: {
    fleet: relationship({ ref: 'Fleet.policies', access: { create: () => false, update: () => false } }), name: text({ validation: { isRequired: true } }), version: text({ validation: { isRequired: true } }), jurisdiction: text(),
    kind: select({ options: ['driver_eligibility', 'vehicle_eligibility', 'insurance', 'licensing', 'background_check', 'location_retention', 'pricing', 'cancellation'].map(value => ({ label: value, value })) }),
    status: select({ options: ['draft', 'active', 'retired'].map(value => ({ label: value, value })), defaultValue: 'draft' }),
    requirements: json({ defaultValue: {} }), evidenceSources: json({ defaultValue: [] }), disclaimer: text({ defaultValue: 'Evidence recording is not legal approval or a compliance certification.', ui: { displayMode: 'textarea' } }),
    evaluations: relationship({ ref: 'PolicyEvaluation.policy', many: true, access: { create: () => false, update: () => false } }), ...trackingFields,
  },
})

export const PolicyEvaluation = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: lockedFleetAccess('drivers'),
  fields: {
    label: labels.policyEvaluation,
    policy: relationship({ ref: 'Policy.evaluations' }), driver: relationship({ ref: 'DriverProfile.policyEvaluations' }), vehicle: relationship({ ref: 'Vehicle.policyEvaluations' }),
    outcome: select({ options: ['pending', 'eligible', 'ineligible', 'manual_review'].map(value => ({ label: value, value })), defaultValue: 'pending' }),
    reasons: json({ defaultValue: [] }), evidenceSnapshot: json({ defaultValue: [] }), evaluatedAt: timestamp(), expiresAt: timestamp(), evaluator: relationship({ ref: 'User' }),
    ...trackingFields,
  },
})

export const ProviderConnection = list({
  ui: { hideCreate: true, hideDelete: true },
  access: fleetScopedAccess('fleetAdmin'),
  fields: {
    fleet: relationship({ ref: 'Fleet.providers', access: { create: () => false, update: () => false } }), name: text({ validation: { isRequired: true } }),
    kind: select({ options: ['mapping', 'payment', 'communications', 'identity', 'background_check', 'location', 'notification'].map(value => ({ label: value, value })) }),
    adapter: text({ validation: { isRequired: true } }), status: select({ options: ['unconfigured', 'sandbox', 'active', 'disabled'].map(value => ({ label: value, value })), defaultValue: 'unconfigured' }),
    config: json({ defaultValue: {} }), secretReference: text({ access: { read: denyAll } }),
    evidencePolicyUrl: text(), lastVerifiedAt: timestamp(), capabilities: json({ defaultValue: [] }),
    ...trackingFields,
  },
})
