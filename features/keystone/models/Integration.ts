import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { lockedFleetAccess } from '../access'
import { trackingFields } from './trackingFields'
import { labels } from './labels'

export const Notification = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: lockedFleetAccess('fleetAdmin'),
  fields: {
    label: labels.notification,
    trip: relationship({ ref: 'Trip', access: { create: () => false, update: () => false } }), recipient: relationship({ ref: 'User', access: { create: () => false, update: () => false } }), channel: select({ options: ['email', 'sms', 'push', 'webhook'].map(value => ({ label: value, value })) }), templateKey: text(),
    status: select({ options: ['queued', 'sending', 'sent', 'delivered', 'failed', 'dead_letter'].map(value => ({ label: value, value })), defaultValue: 'queued' }),
    payload: json({ defaultValue: {} }), providerReference: text({ access: { read: denyAll } }), idempotencyKey: text({ isIndexed: 'unique' }), attemptCount: integer({ defaultValue: 0 }), nextAttemptAt: timestamp(), sentAt: timestamp(), lastError: text(), ...trackingFields,
  },
})

export const MarketplaceRegistration = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['sourceId', 'platform'] },
  access: lockedFleetAccess('fleetAdmin'),
  fields: {
    label: labels.marketplaceRegistration,
    fleet: relationship({ ref: 'Fleet.marketplaceRegistration', access: { create: () => false, update: () => false } }), sourceId: text({ validation: { isRequired: true }, isIndexed: 'unique' }), platform: text({ defaultValue: 'openfront-rideshare' }),
    status: select({ options: ['draft', 'active', 'paused', 'revoked'].map(value => ({ label: value, value })), defaultValue: 'draft' }), manifestVersion: text({ defaultValue: '1' }), publicBaseUrl: text(),
    capabilities: json({ defaultValue: ['marketplace.discovery', 'rideshare.quote', 'rideshare.request', 'rideshare.trip.view'] }), lastVerifiedAt: timestamp(), verificationEvidence: json({ defaultValue: {} }), ...trackingFields,
  },
})
