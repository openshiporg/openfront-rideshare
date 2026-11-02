import { test } from 'node:test'
import assert from 'node:assert/strict'
import { earliestPickup, pickupDays, pickupSlots, toLocalInputValue } from '../features/storefront/domain/pickupSlots'

const now = new Date(2026, 10, 1, 19, 2) // Sun Nov 1 2026, 7:02 PM local

test('earliest pickup honours the book-ahead lead and rounds to a 15-minute slot', () => {
  assert.equal(toLocalInputValue(earliestPickup(now, 0)), '2026-11-01T19:15')
  assert.equal(toLocalInputValue(earliestPickup(now, 120)), '2026-11-01T21:15')
  assert.equal(toLocalInputValue(earliestPickup(now, 30)), '2026-11-01T19:45')
})

test('no slot is earlier than the lead time allows', () => {
  const slots = pickupSlots(now, now, 120)
  assert.equal(toLocalInputValue(slots[0]), '2026-11-01T21:15')
  assert.ok(slots.every(slot => slot.getTime() >= now.getTime() + 120 * 60_000))
  assert.equal(pickupSlots(new Date(2026, 10, 2), now, 120).length, 96)
})

test('a lead that crosses midnight starts the day list tomorrow', () => {
  const late = new Date(2026, 10, 1, 23, 0)
  const days = pickupDays(late, 120)
  assert.equal(days[0].getDate(), 2)
  assert.equal(pickupSlots(late, late, 120).length, 0)
})

test('days run through the booking horizon', () => {
  assert.equal(pickupDays(now, 0).length, 8)
})
