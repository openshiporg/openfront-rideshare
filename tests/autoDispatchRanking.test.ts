import test from 'node:test'
import assert from 'node:assert/strict'
import { coarsePoint, distanceKm, freshLocation, rankDrivers, LOCATION_FRESH_MS } from '../features/keystone/domain/autoDispatchRanking'
import { rideReadiness, operationsEnabled } from '../features/keystone/domain/operationalReadiness'

test('nearest located driver is offered first; unlocated drivers come last in a stable order', () => {
  const ranked = rankDrivers([
    { driverId: 'c', vehicleId: 'v3', km: null },
    { driverId: 'b', vehicleId: 'v2', km: 4.2 },
    { driverId: 'a', vehicleId: 'v1', km: null },
    { driverId: 'd', vehicleId: 'v4', km: 0.8 },
  ])
  assert.deepEqual(ranked.map(item => item.driverId), ['d', 'b', 'a', 'c'])
})

test('distance is great-circle kilometres', () => {
  // Lomita → Torrance Del Amo, about 6 km.
  const km = distanceKm([-118.3151, 33.7922], [-118.3523, 33.8318])
  assert.ok(km > 5 && km < 6.5, String(km))
  assert.equal(distanceKm([10, 10], [10, 10]), 0)
})

test('a position older than ten minutes is ignored', () => {
  const now = new Date('2026-11-05T12:00:00Z')
  const at = (ms: number) => ({ lastLocationLng: -118.3, lastLocationLat: 33.8, lastLocationAt: new Date(now.getTime() - ms) })
  assert.deepEqual(freshLocation(at(60_000), now), [-118.3, 33.8])
  assert.equal(freshLocation(at(LOCATION_FRESH_MS + 1), now), null)
  assert.equal(freshLocation({ lastLocationLng: null, lastLocationLat: 33.8, lastLocationAt: now }, now), null)
})

test('reported positions are rounded to about 100 m and validated', () => {
  assert.deepEqual(coarsePoint(-118.315149, 33.792249), [-118.315, 33.792])
  assert.equal(coarsePoint(200, 10), null)
  assert.equal(coarsePoint('1' as any, 2), null)
  assert.equal(coarsePoint(Number.NaN, 2), null)
})

test('auto dispatch is an operating mode riders can book in', () => {
  assert.equal(operationsEnabled('auto'), true)
  assert.equal(rideReadiness('auto').mode, 'auto')
  assert.equal(rideReadiness('auto').bookingEnabled, true)
})
