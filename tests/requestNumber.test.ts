import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fleetDateStamp, rideRequestNumber } from '../features/keystone/domain/requestNumber'

test('a ride booked 7:36 PM Central on 11-12 is numbered 11-12, not the UTC day', () => {
  const at = new Date('2026-11-13T01:36:00Z')
  assert.equal(rideRequestNumber(at, 'America/Chicago', 'ABCD1234'), 'RIDE-20261112-ABCD1234')
})

test('a missing or unknown zone falls back to UTC', () => {
  const at = new Date('2026-11-13T01:36:00Z')
  assert.equal(fleetDateStamp(at, null), '20261113')
  assert.equal(fleetDateStamp(at, 'Not/AZone'), '20261113')
})
