import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { lockedFleetAccess, lockedOperationalAccess, safetyAccess, relationFilter } from '../access'
import { trackingFields } from './trackingFields'
import { labels } from './labels'

export const SafetyIncident = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'caseNumber', searchFields: ['caseNumber', 'summary'] },
  access: lockedFleetAccess('safety'),
  fields: {
    trip: relationship({ ...relationFilter('Trip'), ref: 'Trip.incidents', access: { create: () => false, update: () => false } }), caseNumber: text({ isIndexed: 'unique' }), severity: select({ options: ['low', 'medium', 'high', 'critical'].map(value => ({ label: value, value })), defaultValue: 'medium' }),
    status: select({ options: ['open', 'triage', 'investigating', 'resolved', 'closed'].map(value => ({ label: value, value })), defaultValue: 'open' }), category: text(), summary: text(), restrictedDetails: json({ defaultValue: {}, isFilterable: safetyAccess.operation.query, isOrderable: safetyAccess.operation.query, access: { read: safetyAccess.operation.query, update: safetyAccess.operation.update } }),
    evidenceRefs: json({ defaultValue: [] }), reportedBy: relationship({ ...relationFilter('User'), ref: 'User' }), assignedTo: relationship({ ...relationFilter('User'), ref: 'User' }), reportedAt: timestamp({ defaultValue: { kind: 'now' } }), resolvedAt: timestamp(),
    ...trackingFields,
  },
})

export const SupportCase = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'caseNumber', searchFields: ['caseNumber'] },
  access: lockedFleetAccess('safety'),
  fields: {
    trip: relationship({ ...relationFilter('Trip'), ref: 'Trip.supportCases', access: { create: () => false, update: () => false } }), caseNumber: text({ isIndexed: 'unique' }), status: select({ options: ['open', 'waiting', 'resolved', 'closed'].map(value => ({ label: value, value })), defaultValue: 'open' }),
    category: text(), subject: text(), description: text({ ui: { displayMode: 'textarea' } }), priority: select({ options: ['low', 'normal', 'high', 'urgent'].map(value => ({ label: value, value })), defaultValue: 'normal' }),
    requester: relationship({ ...relationFilter('User'), ref: 'User' }), assignedTo: relationship({ ...relationFilter('User'), ref: 'User' }), resolvedAt: timestamp(), ...trackingFields,
  },
})

export const Conversation = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: lockedOperationalAccess,
  fields: { label: labels.conversation, trip: relationship({ ...relationFilter('Trip'), ref: 'Trip.conversation', access: { create: () => false, update: () => false } }), status: select({ options: ['open', 'closed', 'blocked'].map(value => ({ label: value, value })), defaultValue: 'open' }), messages: relationship({ ...relationFilter('Message'), ref: 'Message.conversation', many: true, access: { create: () => false, update: () => false } }), ...trackingFields },
})

export const Message = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: lockedOperationalAccess,
  fields: {
    label: labels.message,
    conversation: relationship({ ...relationFilter('Conversation'), ref: 'Conversation.messages', access: { create: () => false, update: () => false } }), senderType: select({ options: ['rider', 'driver', 'operator', 'system'].map(value => ({ label: value, value })) }), sender: relationship({ ...relationFilter('User'), ref: 'User', access: { create: () => false, update: () => false } }),
    body: text({ ui: { displayMode: 'textarea' } }), relayProviderReference: text({ isFilterable: false, isOrderable: false, access: { read: denyAll } }), status: select({ options: ['queued', 'sent', 'delivered', 'failed', 'blocked'].map(value => ({ label: value, value })), defaultValue: 'queued' }), sentAt: timestamp(), metadata: json({ defaultValue: {} }), ...trackingFields,
  },
})

export const Review = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: lockedOperationalAccess,
  fields: {
    label: labels.review,
    trip: relationship({ ...relationFilter('Trip'), ref: 'Trip.reviews', access: { create: () => false, update: () => false } }), author: relationship({ ...relationFilter('User'), ref: 'User.reviews', access: { create: () => false, update: () => false } }), direction: select({ options: ['rider_to_driver', 'driver_to_rider'].map(value => ({ label: value, value })) }),
    rating: integer({ validation: { min: 1, max: 5 } }), body: text({ ui: { displayMode: 'textarea' } }), status: select({ options: ['pending', 'published', 'hidden', 'removed'].map(value => ({ label: value, value })), defaultValue: 'pending' }), submittedAt: timestamp({ defaultValue: { kind: 'now' } }), moderatedAt: timestamp(), moderationReason: text(),
    ...trackingFields,
  },
})
