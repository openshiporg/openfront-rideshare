import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { lockedFleetAccess, lockedOperationalAccess, safetyAccess } from '../access'
import { trackingFields } from './trackingFields'

export const SafetyIncident = list({
  access: lockedFleetAccess('safety'),
  fields: {
    trip: relationship({ ref: 'Trip.incidents', access: { create: () => false, update: () => false } }), caseNumber: text({ isIndexed: 'unique' }), severity: select({ options: ['low', 'medium', 'high', 'critical'].map(value => ({ label: value, value })), defaultValue: 'medium' }),
    status: select({ options: ['open', 'triage', 'investigating', 'resolved', 'closed'].map(value => ({ label: value, value })), defaultValue: 'open' }), category: text(), summary: text(), restrictedDetails: json({ defaultValue: {}, access: { read: safetyAccess.operation.query, update: safetyAccess.operation.update } }),
    evidenceRefs: json({ defaultValue: [] }), reportedBy: relationship({ ref: 'User' }), assignedTo: relationship({ ref: 'User' }), reportedAt: timestamp({ defaultValue: { kind: 'now' } }), resolvedAt: timestamp(),
    ...trackingFields,
  },
})

export const SupportCase = list({
  access: lockedFleetAccess('safety'),
  fields: {
    trip: relationship({ ref: 'Trip.supportCases', access: { create: () => false, update: () => false } }), caseNumber: text({ isIndexed: 'unique' }), status: select({ options: ['open', 'waiting', 'resolved', 'closed'].map(value => ({ label: value, value })), defaultValue: 'open' }),
    category: text(), subject: text(), description: text({ ui: { displayMode: 'textarea' } }), priority: select({ options: ['low', 'normal', 'high', 'urgent'].map(value => ({ label: value, value })), defaultValue: 'normal' }),
    requester: relationship({ ref: 'User' }), assignedTo: relationship({ ref: 'User' }), resolvedAt: timestamp(), ...trackingFields,
  },
})

export const Conversation = list({
  access: lockedOperationalAccess,
  fields: { trip: relationship({ ref: 'Trip.conversation', access: { create: () => false, update: () => false } }), status: select({ options: ['open', 'closed', 'blocked'].map(value => ({ label: value, value })), defaultValue: 'open' }), messages: relationship({ ref: 'Message.conversation', many: true, access: { create: () => false, update: () => false } }), ...trackingFields },
})

export const Message = list({
  access: lockedOperationalAccess,
  fields: {
    conversation: relationship({ ref: 'Conversation.messages', access: { create: () => false, update: () => false } }), senderType: select({ options: ['rider', 'driver', 'operator', 'system'].map(value => ({ label: value, value })) }), sender: relationship({ ref: 'User', access: { create: () => false, update: () => false } }),
    body: text({ ui: { displayMode: 'textarea' } }), relayProviderReference: text({ access: { read: denyAll } }), status: select({ options: ['queued', 'sent', 'delivered', 'failed', 'blocked'].map(value => ({ label: value, value })), defaultValue: 'queued' }), sentAt: timestamp(), metadata: json({ defaultValue: {} }), ...trackingFields,
  },
})

export const Review = list({
  access: lockedOperationalAccess,
  fields: {
    trip: relationship({ ref: 'Trip.reviews', access: { create: () => false, update: () => false } }), author: relationship({ ref: 'User.reviews', access: { create: () => false, update: () => false } }), direction: select({ options: ['rider_to_driver', 'driver_to_rider'].map(value => ({ label: value, value })) }),
    rating: integer({ validation: { min: 1, max: 5 } }), body: text({ ui: { displayMode: 'textarea' } }), status: select({ options: ['pending', 'published', 'hidden', 'removed'].map(value => ({ label: value, value })), defaultValue: 'pending' }), submittedAt: timestamp({ defaultValue: { kind: 'now' } }), moderatedAt: timestamp(), moderationReason: text(),
    ...trackingFields,
  },
})
