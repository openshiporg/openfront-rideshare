import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GraphQLScalarType } from 'graphql'
import { dateTimeFieldResolvers, toDateTime } from '../features/keystone/domain/dateTimeFields'
import { typeDefs } from '../features/keystone/mutations'

// Mirrors Keystone's DateTime scalar: it serializes Date instances only.
const DateTime = new GraphQLScalarType({ name: 'DateTime', serialize(value) { if (!(value instanceof Date)) throw new TypeError(`unexpected value provided to DateTime scalar: ${value}`); return value.toISOString() } })

test('every DateTime field on the rideshare extension types resolves to a Date', () => {
  const resolvers = dateTimeFieldResolvers(typeDefs)
  const declared = [...typeDefs.matchAll(/\btype\s+(\w+)\s*\{([^}]*)\}/g)].flatMap(([, type, body]) => type === 'Query' || type === 'Mutation' ? [] : [...body.matchAll(/(\w+)\s*:\s*DateTime!?/g)].map(field => `${type}.${field[1]}`))
  assert.ok(declared.includes('MarketplaceRideQuote.expiresAt'))
  assert.ok(declared.includes('DriverWorkspaceOffer.expiresAt'))
  for (const path of declared) {
    const [type, field] = path.split('.')
    const resolve = resolvers[type]?.[field]
    assert.ok(resolve, `${path} has no resolver`)
    assert.equal(DateTime.serialize(resolve({ [field]: '2026-10-24T00:31:16.961Z' })), '2026-10-24T00:31:16.961Z', path)
  }
})

test('toDateTime keeps Dates, parses ISO strings and drops empty or invalid values', () => {
  const date = new Date('2026-10-24T00:00:00.000Z')
  assert.equal(toDateTime(date), date)
  assert.equal(toDateTime('2026-10-24T00:00:00.000Z')?.toISOString(), date.toISOString())
  assert.equal(toDateTime(null), null)
  assert.equal(toDateTime(''), null)
  assert.equal(toDateTime('not a date'), null)
})
