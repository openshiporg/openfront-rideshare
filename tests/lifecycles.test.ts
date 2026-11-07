import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertTransition, canTransition, COLLECTABLE_FARE_TRIP_STATUSES, lifecycles } from '../features/keystone/domain/lifecycles'
import { nextTripStatus } from '../features/keystone/domain/tripState'

test('every target state of every machine is itself a known state', () => {
  for (const [name, map] of Object.entries(lifecycles)) {
    const states = new Set(Object.keys(map))
    for (const [from, targets] of Object.entries(map)) for (const to of targets) assert.ok(states.has(to), `${name}: ${from} -> ${to} targets an unknown state`)
  }
})

test('a refunded or cancelled payment is final, a captured one can only be refunded', () => {
  assert.equal(canTransition('payment', 'refunded', 'captured'), false)
  assert.equal(canTransition('payment', 'cancelled', 'captured'), false)
  assert.equal(canTransition('payment', 'captured', 'pending'), false)
  assert.equal(canTransition('payment', 'captured', 'partially_refunded'), true)
  assert.equal(canTransition('payment', 'partially_refunded', 'refunded'), true)
  assert.equal(canTransition('payment', 'failed', 'pending'), true)
})

test('a refund settles once: succeeded never reopens', () => {
  assert.equal(canTransition('refund', 'succeeded', 'processing'), false)
  assert.equal(canTransition('refund', 'succeeded', 'failed'), false)
  assert.equal(canTransition('refund', 'processing', 'succeeded'), true)
  assert.throws(() => assertTransition('refund', 'succeeded', 'succeeded', 'refund'), /can’t move/)
})

test('a revoked or rejected document is not silently re-accepted', () => {
  assert.equal(canTransition('document', 'revoked', 'accepted_evidence'), false)
  assert.equal(canTransition('document', 'rejected_evidence', 'accepted_evidence'), false)
  assert.equal(canTransition('document', 'submitted', 'accepted_evidence'), true)
  assert.equal(canTransition('document', 'accepted_evidence', 'revoked'), true)
  assert.equal(canTransition('document', 'accepted_evidence', 'rejected_evidence'), false)
})

test('a retired vehicle stays retired, and nothing skips back to pending review', () => {
  assert.equal(canTransition('vehicle', 'retired', 'active'), false)
  assert.equal(canTransition('vehicle', 'active', 'pending_review'), false)
  assert.equal(canTransition('vehicle', 'maintenance', 'active'), true)
})

test('a driver can be re-approved only from a state that was reviewed', () => {
  assert.equal(canTransition('driver', 'pending_review', 'active'), true)
  assert.equal(canTransition('driver', 'active', 'applicant'), false)
  assert.equal(canTransition('driver', 'active', 'pending_review'), false)
})

test('safety incidents and support cases follow their flows and closed is final', () => {
  assert.equal(canTransition('incident', 'closed', 'open'), false)
  assert.equal(canTransition('incident', 'open', 'closed'), false)
  assert.equal(canTransition('supportCase', 'closed', 'open'), false)
  assert.equal(canTransition('supportCase', 'resolved', 'open'), true)
})

test('review moderation cannot resurrect a removed review', () => {
  assert.equal(canTransition('review', 'removed', 'published'), false)
  assert.equal(canTransition('review', 'pending', 'published'), true)
})

test('a fare is not collectable on a cancelled or no-show trip', () => {
  assert.ok(!(COLLECTABLE_FARE_TRIP_STATUSES as readonly string[]).includes('cancelled'))
  assert.ok(!(COLLECTABLE_FARE_TRIP_STATUSES as readonly string[]).includes('no_show'))
  assert.ok((COLLECTABLE_FARE_TRIP_STATUSES as readonly string[]).includes('completed'))
})

test('trip transitions: no cancel after start, no completing an arrived trip, no restart after completion', () => {
  assert.throws(() => nextTripStatus('in_progress', 'cancel'), /cannot transition/)
  assert.throws(() => nextTripStatus('driver_arrived', 'complete'), /cannot transition/)
  assert.throws(() => nextTripStatus('completed', 'start_en_route'), /cannot transition/)
  assert.throws(() => nextTripStatus('no_show', 'start_trip'), /cannot transition/)
  assert.equal(nextTripStatus('driver_arrived', 'start_trip'), 'in_progress')
})
