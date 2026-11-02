import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GraphQLScalarType, Kind } from 'graphql'
import { reviewedIso, sameReviewedVersion } from '../features/keystone/domain/reviewedVersion'

// Mirrors Keystone's DateTime scalar: arguments arrive in resolvers as Date instances.
const DateTime = new GraphQLScalarType({ name: 'DateTime', parseValue: value => new Date(String(value)), parseLiteral: node => node.kind === Kind.STRING ? new Date(node.value) : null })

test('staff cancel: the reviewed updatedAt from the preview matches after the DateTime scalar parses it', () => {
  const row = new Date('2026-11-02T01:11:40.087Z')
  const previewed = row.toISOString()
  const arg = DateTime.parseValue(previewed)
  assert.ok(arg instanceof Date)
  assert.notEqual(row.toISOString(), arg as unknown as string, 'the raw comparison that refused every cancel')
  assert.equal(sameReviewedVersion(row, arg), true)
  assert.equal(sameReviewedVersion(row, previewed), true)
})

test('a trip changed after review is still refused', () => {
  const row = new Date('2026-11-02T01:12:00.000Z')
  assert.equal(sameReviewedVersion(row, DateTime.parseValue('2026-11-02T01:11:40.087Z')), false)
  assert.equal(sameReviewedVersion(row, 'not a date'), false)
  assert.equal(sameReviewedVersion(row, null), false)
})

test('the replay binding stores one canonical form for Date and string', () => {
  assert.equal(reviewedIso(new Date('2026-11-02T01:11:40.087Z')), reviewedIso('2026-11-02T01:11:40.087Z'))
})
