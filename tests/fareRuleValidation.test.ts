import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fareRuleForValidation, validateFareRule } from '../features/keystone/domain/fare'

const stored = { id: 'f1', name: 'Standard transparent fare', status: 'active', version: 1, currencyCode: 'USD', baseFareMinor: 350, perDistanceUnitMinor: 185, distanceUnit: 'mile', perMinuteMinor: 35, bookingFeeMinor: 100, minimumFareMinor: 850, cancellationFeeMinor: 500, noShowFeeMinor: 900, maximumMultiplierBasisPoints: 10000, rules: {} }
// Shape of Keystone resolvedData on update: every field key, undefined when not in the write.
const keys = Object.keys(stored).filter(key => key !== 'id')
const resolved = (changes: Record<string, unknown>) => ({ ...Object.fromEntries(keys.map(key => [key, undefined])), ...changes })

test('a no-op update of a valid stored fare rule validates', () => {
  assert.doesNotThrow(() => validateFareRule(fareRuleForValidation(stored, resolved({}))))
})

test('a single-field edit keeps the other stored values', () => {
  const merged = fareRuleForValidation(stored, resolved({ name: 'Renamed' }))
  assert.equal(merged.baseFareMinor, 350)
  assert.doesNotThrow(() => validateFareRule(merged))
})

test('the old spread erased stored values and refused every update', () => {
  assert.throws(() => validateFareRule({ ...stored, ...resolved({}) } as never))
})

test('invalid changes are still refused', () => {
  assert.throws(() => validateFareRule(fareRuleForValidation(stored, resolved({ baseFareMinor: -1 }))))
  assert.throws(() => validateFareRule(fareRuleForValidation(stored, resolved({ currencyCode: 'usd' }))))
  assert.throws(() => validateFareRule(fareRuleForValidation(stored, resolved({ maximumMultiplierBasisPoints: 9000 }))))
})

test('create uses resolved data alone', () => {
  const { id, ...create } = stored
  assert.doesNotThrow(() => validateFareRule(fareRuleForValidation(undefined, create)))
})
