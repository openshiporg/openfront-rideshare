import { GraphQLError } from 'graphql'

/** Database rules (migrations/20261107120000_rideshare_invariants) and what a person should read when one refuses a write. */
export const CONSTRAINT_MESSAGES: Record<string, { code: string; message: string; fields?: string[] }> = {
  FleetMembership_fleet_user_key: { code: 'RIDESHARE_DUPLICATE_MEMBER', message: 'That person is already on this fleet.', fields: ['fleet', 'user'] },
  FareRule_one_active_per_service_area: { code: 'RIDESHARE_DUPLICATE_ACTIVE_FARE', message: 'This service already has an active fare in that area. Save a new fare version instead.', fields: ['service', 'serviceArea'] },
  FareRule_service_area_version_key: { code: 'RIDESHARE_DUPLICATE_FARE_VERSION', message: 'That fare version already exists. Reload and save again.', fields: ['service', 'serviceArea', 'version'] },
  Payment_one_active_per_trip_purpose: { code: 'RIDESHARE_DUPLICATE_CHARGE', message: 'This ride already has a payment in progress or paid for that charge.', fields: ['trip', 'purpose'] },
  Review_trip_author_direction_key: { code: 'RIDESHARE_DUPLICATE_REVIEW', message: 'A review has already been submitted for this trip.', fields: ['trip', 'author', 'direction'] },
  Policy_one_active_per_fleet_kind: { code: 'RIDESHARE_DUPLICATE_ACTIVE_POLICY', message: 'This fleet already has an active policy of that kind. Retire it first.', fields: ['fleet', 'kind'] },
  Refund_within_payment: { code: 'RIDESHARE_REFUND_EXCEEDS_PAYMENT', message: 'Refunds can’t exceed what was paid, and must be in the payment’s currency.' },
  Payment_amount_positive: { code: 'RIDESHARE_INVALID_AMOUNT', message: 'A payment must be a positive amount.' },
  Refund_amount_positive: { code: 'RIDESHARE_INVALID_AMOUNT', message: 'A refund must be a positive amount.' },
  LedgerEntry_amount_non_negative: { code: 'RIDESHARE_INVALID_AMOUNT', message: 'Ledger amounts can’t be negative.' },
  FareRule_amounts_non_negative: { code: 'RIDESHARE_INVALID_AMOUNT', message: 'Fare amounts can’t be negative.' },
  Payment_currency_code: { code: 'RIDESHARE_INVALID_CURRENCY', message: 'Currency must be a three-letter code, such as USD.' },
  Refund_currency_code: { code: 'RIDESHARE_INVALID_CURRENCY', message: 'Currency must be a three-letter code, such as USD.' },
  LedgerEntry_currency_code: { code: 'RIDESHARE_INVALID_CURRENCY', message: 'Currency must be a three-letter code, such as USD.' },
  FareRule_currency_code: { code: 'RIDESHARE_INVALID_CURRENCY', message: 'Currency must be a three-letter code, such as USD.' },
  Fleet_currency_code: { code: 'RIDESHARE_INVALID_CURRENCY', message: 'Currency must be a three-letter code, such as USD.' },
  Fleet_location_retention_days: { code: 'RIDESHARE_INVALID_RETENTION', message: 'Location retention must be a whole number of days from 1 to 3650.' },
}

function chain(error: unknown) {
  const out: any[] = []
  let current: any = error
  for (let depth = 0; current && depth < 6; depth++) { out.push(current); current = current.originalError ?? current.cause }
  return out
}

/** The readable, coded refusal for a known constraint violation anywhere in the error's cause chain, or null. */
export function constraintRefusal(error: unknown): { code: string; message: string } | null {
  for (const link of chain(error)) {
    const text = [link?.message, typeof link?.meta === 'object' ? JSON.stringify(link.meta) : ''].join(' ')
    for (const [name, rule] of Object.entries(CONSTRAINT_MESSAGES)) if (text.includes(name)) return rule
    // Prisma sometimes reports a unique violation by its fields instead of the index name.
    const listed = /Unique constraint failed on the fields: \(([^)]*)\)/.exec(String(link?.message || ''))?.[1]?.match(/`([^`]+)`/g)?.map(field => field.slice(1, -1))
    const fields = link?.code === 'P2002' && Array.isArray(link?.meta?.target) ? link.meta.target : listed
    if (fields?.length) {
      const target = [...fields].map(String).sort().join(',')
      const match = Object.values(CONSTRAINT_MESSAGES).find(rule => rule.fields && [...rule.fields].sort().join(',') === target)
      if (match) return match
    }
  }
  return null
}

export function constraintGraphQLError(error: GraphQLError): GraphQLError {
  const refusal = constraintRefusal(error)
  if (!refusal) return error
  return new GraphQLError(refusal.message, { nodes: error.nodes, source: error.source, positions: error.positions, path: error.path, extensions: { code: refusal.code } })
}
