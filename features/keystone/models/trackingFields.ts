import { timestamp } from '@keystone-6/core/fields'

export const trackingFields = {
  createdAt: timestamp({ defaultValue: { kind: 'now' }, isIndexed: true }),
  updatedAt: timestamp({ db: { updatedAt: true }, isIndexed: true }),
}
