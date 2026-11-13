import { list } from '@keystone-6/core'
import { json, relationship, text } from '@keystone-6/core/fields'
import { financeAccess, relationFilter } from '../access'
import { trackingFields } from './trackingFields'
import { labels } from './labels'

/** Immutable provider-attempt observations. Existing providerEvidence blobs
 * remain historical input; new observations never overwrite one another. */
export const PaymentObservation = list({
  ui: { hideCreate: true, hideDelete: true, labelField: 'label', searchFields: ['observationKey'] },
  access: financeAccess,
  fields: {
    label: labels.paymentObservation,
    payment: relationship({ ...relationFilter('Payment'), ref: 'Payment', access: { create: () => false, update: () => false } }),
    refund: relationship({ ...relationFilter('Refund'), ref: 'Refund', access: { create: () => false, update: () => false } }),
    observationKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    details: json({ defaultValue: {} }),
    ...trackingFields,
  },
})
