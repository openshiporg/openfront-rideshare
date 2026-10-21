import { list } from '@keystone-6/core'
import { json, relationship, text } from '@keystone-6/core/fields'
import { trackingFields } from './trackingFields'

/** Command-private append-only receipts. A cancellation must not mutate the
 * accepted quote snapshot or turn an old assignment into an unbound receipt. */
export const RequestCancellationCommand = list({
  access: { operation: { query: () => false, create: () => false, update: () => false, delete: () => false } },
  fields: {
    request: relationship({ ref: 'RideRequest', access: { create: () => false, update: () => false } }),
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    command: json({ defaultValue: {} }), result: json({ defaultValue: {} }),
    ...trackingFields,
  },
})
