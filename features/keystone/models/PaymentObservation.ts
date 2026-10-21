import { list } from '@keystone-6/core'
import { json, relationship, text } from '@keystone-6/core/fields'
import { financeAccess } from '../access'
import { trackingFields } from './trackingFields'

/** Immutable provider-attempt observations. Existing providerEvidence blobs
 * remain historical input; new observations never overwrite one another. */
export const PaymentObservation = list({
  access: financeAccess,
  fields: {
    payment: relationship({ ref: 'Payment', access: { create: () => false, update: () => false } }),
    refund: relationship({ ref: 'Refund', access: { create: () => false, update: () => false } }),
    observationKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    details: json({ defaultValue: {} }),
    ...trackingFields,
  },
})
