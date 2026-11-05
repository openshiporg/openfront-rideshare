import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultServiceId, earliestScheduled, initialFlow, rideStage, riderFlow, type FlowEvent, type FlowState } from '../features/storefront/domain/riderFlow'

const here = { label: '3009 Opal St, Harbor City', name: '3009 Opal St', detail: 'Harbor City', point: [-118.3, 33.79] as [number, number] }
const mall = { label: 'Del Amo Fashion Center, 3525 West Carson Street', name: 'Del Amo Fashion Center', detail: 'Torrance', point: [-118.35, 33.83] as [number, number] }
const run = (events: FlowEvent[], from: FlowState = initialFlow) => events.reduce(riderFlow, from)

test('the pickup time defaults to Now and a destination goes straight to the ride list', () => {
  const state = run([
    { type: 'located', source: 'gps', place: here },
    { type: 'selectService', serviceId: 'standard' },
    { type: 'openSearch', field: 'dropoff' },
    { type: 'pick', field: 'dropoff', place: mall },
  ])
  assert.equal(state.when, null)
  assert.deepEqual(state.phase, { name: 'choose' })
  // One tap: Request is accepted from the ride list without any time step.
  assert.deepEqual(riderFlow(state, { type: 'request' }).phase, { name: 'requesting' })
})

test('the city fallback never overrides GPS, and GPS never overrides a chosen pickup', () => {
  const gps = run([{ type: 'located', source: 'gps', place: here }, { type: 'located', source: 'city', place: mall }])
  assert.equal(gps.pickup, here)
  const chosen = run([{ type: 'pick', field: 'pickup', place: mall }, { type: 'located', source: 'gps', place: here }])
  assert.equal(chosen.pickup, mall)
})

test('a missing pickup is asked for after the destination; back from the list keeps the destination', () => {
  const noPickup = run([{ type: 'pick', field: 'dropoff', place: mall }])
  assert.deepEqual(noPickup.phase, { name: 'search', field: 'pickup' })
  const listed = run([{ type: 'located', source: 'gps', place: here }, { type: 'pick', field: 'dropoff', place: mall }, { type: 'back' }])
  assert.deepEqual(listed.phase, { name: 'search', field: 'dropoff' })
  assert.equal(listed.dropoff, mall)
})

test('scheduling is opt-in and can be turned back to Now', () => {
  const later = run([{ type: 'setWhen', when: '2026-11-05T18:00:00.000Z' }])
  assert.equal(later.when, '2026-11-05T18:00:00.000Z')
  assert.equal(riderFlow(later, { type: 'setWhen', when: null }).when, null)
})

test('a request in flight cannot be changed or sent twice', () => {
  const requesting = run([{ type: 'located', source: 'gps', place: here }, { type: 'selectService', serviceId: 's' }, { type: 'pick', field: 'dropoff', place: mall }, { type: 'request' }])
  assert.equal(riderFlow(requesting, { type: 'request' }), requesting)
  assert.equal(riderFlow(requesting, { type: 'pick', field: 'dropoff', place: here }), requesting)
  const lost = riderFlow(requesting, { type: 'requestUncertain' })
  assert.equal(lost.phase.name, 'unconfirmed')
  assert.equal(riderFlow(lost, { type: 'openSearch', field: 'dropoff' }), lost)
})

test('the everyday ride is preselected: bookable, not accessible-only, cheapest', () => {
  const services = [
    { id: 'accessible', wheelchairAccessible: true, readiness: { bookingEnabled: true } },
    { id: 'xl', wheelchairAccessible: false, readiness: { bookingEnabled: true } },
    { id: 'standard', wheelchairAccessible: false, readiness: { bookingEnabled: true } },
    { id: 'closed', wheelchairAccessible: false, readiness: { bookingEnabled: false } },
  ]
  const prices: Record<string, number> = { accessible: 900, xl: 1800, standard: 1200, closed: 100 }
  assert.equal(defaultServiceId(services, id => prices[id]), 'standard')
})

test('rider words follow the request and trip status', () => {
  assert.equal(rideStage('matching', null), 'finding')
  assert.equal(rideStage('matched', 'driver_assigned'), 'assigned')
  assert.equal(rideStage('matched', 'driver_arrived'), 'arrived')
  assert.equal(rideStage('matched', 'in_progress'), 'onTrip')
  assert.equal(rideStage('matched', 'completed'), 'completed')
  assert.equal(rideStage('cancelled', null), 'cancelled')
  assert.equal(rideStage('matching', 'cancelled', 'reassignment_pending'), 'reassigning')
  assert.equal(rideStage('expired', null), 'noDriver')
  assert.equal(rideStage('matching', null, null, new Date(Date.now() + 3 * 3600_000).toISOString()), 'scheduled')
})

test('a scheduled ride starts no sooner than the lead time, on a 5-minute mark', () => {
  const at = earliestScheduled(new Date(2026, 10, 4, 9, 2), 30)
  assert.equal(at.getHours(), 9)
  assert.equal(at.getMinutes(), 35)
  assert.equal(earliestScheduled(new Date(2026, 10, 4, 9, 2), 0).getMinutes(), 20)
})
