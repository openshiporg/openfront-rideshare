import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSchema, createYoga } from 'graphql-yoga'
import { graphqlErrorMaskingPlugin } from '../features/keystone/domain/graphqlErrorMasking'
import { constraintRefusal } from '../features/keystone/domain/constraintErrors'
import { fleetConfigProblems } from '../features/keystone/domain/fleetConfig'

function prismaUnique(target: string[] | string) {
  const error: any = new Error('\nInvalid `prisma.payment.create()` invocation:\n\nUnique constraint failed on the fields: (`trip`,`purpose`)')
  error.code = 'P2002'; error.meta = { target }
  return error
}

test('a database rule refusing a write is answered with a readable coded error, not "Unexpected error."', async () => {
  const schema = createSchema({ typeDefs: 'type Query { charge: String refund: String other: String }', resolvers: { Query: {
    charge: () => { throw prismaUnique(['trip', 'purpose']) },
    refund: () => { throw new Error('Raw query failed. Code: `23514`. Message: `ERROR: Refunds (900) would exceed the payment (500).` constraint Refund_within_payment') },
    other: () => { throw new Error('connection reset by peer') },
  } } })
  const yoga = createYoga({ schema, plugins: [graphqlErrorMaskingPlugin(true)], maskedErrors: true })
  const response = await yoga.fetch('http://localhost/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ charge refund other }' }) })
  const body = await response.json()
  const byPath = Object.fromEntries(body.errors.map((error: any) => [error.path[0], error]))
  assert.equal(byPath.charge.message, 'This ride already has a payment in progress or paid for that charge.')
  assert.equal(byPath.charge.extensions.code, 'RIDESHARE_DUPLICATE_CHARGE')
  assert.equal(byPath.refund.extensions.code, 'RIDESHARE_REFUND_EXCEEDS_PAYMENT')
  // Anything that is not a known rule stays masked: no internals leak.
  assert.equal(byPath.other.message, 'Unexpected error.')
})

test('constraint names and unique field targets both map to the rule', () => {
  assert.equal(constraintRefusal(prismaUnique('FleetMembership_fleet_user_key'))?.code, 'RIDESHARE_DUPLICATE_MEMBER')
  assert.equal(constraintRefusal(prismaUnique(['serviceArea', 'service']))?.code, 'RIDESHARE_DUPLICATE_ACTIVE_FARE')
  assert.equal(constraintRefusal({ originalError: { message: 'violates check constraint "Fleet_location_retention_days"' } })?.code, 'RIDESHARE_INVALID_RETENTION')
  assert.equal(constraintRefusal(new Error('something else')), null)
})

test('fleet settings the app reads blindly are checked on every edit', () => {
  assert.deepEqual(fleetConfigProblems({ timezone: 'America/New_York', currencyCode: 'USD', preciseLocationRetentionDays: '30' }), [])
  assert.deepEqual(fleetConfigProblems({ name: 'Only the name changed' }), [])
  assert.match(fleetConfigProblems({ timezone: 'Mars/Olympus' })[0], /IANA/)
  assert.match(fleetConfigProblems({ timezone: '' })[0], /IANA/)
  assert.match(fleetConfigProblems({ currencyCode: 'usd' })[0], /three-letter/)
  assert.match(fleetConfigProblems({ preciseLocationRetentionDays: 'forever' })[0], /1 to 3650/)
  assert.match(fleetConfigProblems({ preciseLocationRetentionDays: '0' })[0], /1 to 3650/)
})

test('Keystone-wrapped unique errors (message only) still map', () => {
  assert.equal(constraintRefusal(new Error('Prisma error: Unique constraint failed on the fields: (`fleet`,`kind`)'))?.code, 'RIDESHARE_DUPLICATE_ACTIVE_POLICY')
})
