import { list } from '@keystone-6/core'
import { json, relationship, text } from '@keystone-6/core/fields'
import { lockedFleetAccess } from '../access'
import { trackingFields } from './trackingFields'

export const FleetBrandingChange = list({
  access: lockedFleetAccess('fleetAdmin'),
  fields: {
    fleet: relationship({ ref: 'Fleet', access: { create: () => false, update: () => false } }),
    actor: relationship({ ref: 'User', access: { create: () => false, update: () => false } }),
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    command: json({ defaultValue: {} }), result: json({ defaultValue: {} }),
    ...trackingFields,
  },
})
