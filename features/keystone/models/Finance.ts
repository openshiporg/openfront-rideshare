import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { financeAccess, permissions } from '../access'
import { trackingFields } from './trackingFields'
import { labels } from './labels'

export const PaymentProvider = list({
  access: { operation: { query: permissions.canManageFinance, create: permissions.canManageIntegrations, update: permissions.canManageIntegrations, delete: permissions.canManageIntegrations } },
  fields: {
    name: text({ validation: { isRequired: true } }), code: text({ validation: { isRequired: true }, isIndexed: 'unique' }), isInstalled: select({ options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }], defaultValue: 'no' }),
    credentialsReference: text({ access: { read: denyAll } }), metadata: json({ defaultValue: {} }),
    createPaymentFunction: text({ validation: { isRequired: true } }), capturePaymentFunction: text({ validation: { isRequired: true } }), refundPaymentFunction: text({ validation: { isRequired: true } }), getPaymentStatusFunction: text({ validation: { isRequired: true } }), handleWebhookFunction: text({ validation: { isRequired: true } }),
    payments: relationship({ ref: 'Payment.provider', many: true, access: { create: () => false, update: () => false } }), refunds: relationship({ ref: 'Refund.provider', many: true, access: { create: () => false, update: () => false } }), payouts: relationship({ ref: 'Payout.provider', many: true, access: { create: () => false, update: () => false } }), ...trackingFields,
  },
})

export const Payment = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['providerReference'] },
  access: financeAccess,
  fields: {
    label: labels.payment,
    trip: relationship({ ref: 'Trip.payments', access: { create: () => false, update: () => false } }), provider: relationship({ ref: 'PaymentProvider.payments', access: { create: () => false, update: () => false } }), amountMinor: integer({ validation: { min: 0 } }), currencyCode: text(),
    status: select({ options: ['pending', 'authorized', 'captured', 'failed', 'partially_refunded', 'refunded', 'cancelled'].map(value => ({ label: value, value })), defaultValue: 'pending' }),
    providerReference: text(), idempotencyKey: text({ isIndexed: 'unique', access: { read: denyAll } }), providerEvidence: json({ defaultValue: {}, access: { read: permissions.canManageFinance } }), capturedAt: timestamp(),
    refunds: relationship({ ref: 'Refund.payment', many: true, access: { create: () => false, update: () => false } }), ledgerEntries: relationship({ ref: 'LedgerEntry.payment', many: true, access: { create: () => false, update: () => false } }), ...trackingFields,
  },
})

export const Refund = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['reason'] },
  access: financeAccess,
  fields: {
    label: labels.refund,
    payment: relationship({ ref: 'Payment.refunds', access: { create: () => false, update: () => false } }), provider: relationship({ ref: 'PaymentProvider.refunds', access: { create: () => false, update: () => false } }), amountMinor: integer({ validation: { min: 0 } }), currencyCode: text(), reason: text(),
    status: select({ options: ['requested', 'processing', 'succeeded', 'failed', 'cancelled'].map(value => ({ label: value, value })), defaultValue: 'requested' }), providerReference: text(), idempotencyKey: text({ isIndexed: 'unique', access: { read: denyAll } }), processedAt: timestamp(), ...trackingFields,
  },
})

export const LedgerEntry = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: financeAccess,
  fields: {
    label: labels.ledgerEntry,
    trip: relationship({ ref: 'Trip.ledgerEntries', access: { create: () => false, update: () => false } }), payment: relationship({ ref: 'Payment.ledgerEntries', access: { create: () => false, update: () => false } }), payout: relationship({ ref: 'Payout.ledgerEntries', access: { create: () => false, update: () => false } }),
    entryKey: text({ isIndexed: 'unique', validation: { isRequired: true } }), kind: select({ options: ['rider_charge', 'tax', 'platform_fee', 'driver_earning', 'fleet_share', 'tip', 'refund', 'adjustment', 'payout_transfer'].map(value => ({ label: value, value })) }),
    account: text({ validation: { isRequired: true } }), direction: select({ options: ['debit', 'credit'].map(value => ({ label: value, value })) }), amountMinor: integer({ validation: { min: 0 } }), currencyCode: text(), effectiveAt: timestamp({ defaultValue: { kind: 'now' } }), memo: text(), metadata: json({ defaultValue: {} }),
    ...trackingFields,
  },
})

export const Payout = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: financeAccess,
  fields: {
    label: labels.payout,
    driver: relationship({ ref: 'DriverProfile' , access: { create: () => false, update: () => false } }), provider: relationship({ ref: 'PaymentProvider.payouts', access: { create: () => false, update: () => false } }), amountMinor: integer({ validation: { min: 0 } }), currencyCode: text(),
    status: select({ options: ['pending', 'approved', 'submitted', 'paid', 'failed', 'cancelled'].map(value => ({ label: value, value })), defaultValue: 'pending' }), periodStart: timestamp(), periodEnd: timestamp(), providerReference: text(), evidence: json({ defaultValue: {} }), ledgerEntries: relationship({ ref: 'LedgerEntry.payout', many: true, access: { create: () => false, update: () => false } }), paidAt: timestamp(), ...trackingFields,
  },
})
