import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isFutureScheduledRequest, isLateScheduledRequest } from '../features/keystone/domain/dispatchSchedule'
import { money } from '../features/keystone/lib/trip-receipt'

test('a pickup time that just passed can still get a driver, for up to an hour', () => {
  const now = new Date('2026-11-17T12:00:00Z')
  assert.equal(isLateScheduledRequest(new Date('2026-11-17T11:59:50Z'), now), true)
  assert.equal(isLateScheduledRequest(new Date('2026-11-17T11:01:00Z'), now), true)
  assert.equal(isLateScheduledRequest(new Date('2026-11-17T10:59:00Z'), now), false)
  assert.equal(isLateScheduledRequest(new Date('2026-11-17T12:05:00Z'), now), false)
  assert.equal(isFutureScheduledRequest(new Date('2026-11-17T12:05:00Z'), now), true)
})

test('receipt amounts use the currency\'s own decimals', () => {
  assert.equal(money(1250, 'USD'), '$12.50')
  assert.equal(money(1250, 'JPY'), '¥1,250')
  assert.equal(money(1250, 'BHD').replace(/\s/g, ' '), 'BHD 1.250')
})
