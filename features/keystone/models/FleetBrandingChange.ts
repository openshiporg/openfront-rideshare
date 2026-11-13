import { list } from '@keystone-6/core'
import { json, relationship, text } from '@keystone-6/core/fields'
import { lockedFleetAccess, relationFilter } from '../access'
import { trackingFields } from './trackingFields'
import { labels } from './labels'

export const FleetBrandingChange = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: [] },
  access: lockedFleetAccess('fleetAdmin'),
  fields: {
    label: labels.fleetBrandingChange,
    fleet: relationship({ ...relationFilter('Fleet'), ref: 'Fleet', access: { create: () => false, update: () => false } }),
    actor: relationship({ ...relationFilter('User'), ref: 'User', access: { create: () => false, update: () => false } }),
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    command: json({ defaultValue: {} }), result: json({ defaultValue: {} }),
    ...trackingFields,
  },
})
