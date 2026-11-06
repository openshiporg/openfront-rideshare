import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { vehicleArt } from '../features/lib/vehicles'

test('every ride category draws from the one vehicle set', () => {
  const files = ['standard', 'comfort', 'xl', 'accessible', 'pet_friendly', 'scheduled', 'unknown', null].map(category => vehicleArt(category))
  for (const file of files) { assert.match(file, /^\/vehicles\/[a-z-]+\.svg$/); assert.ok(existsSync(`public${file}`), file) }
  assert.equal(new Set(files.slice(0, 6)).size, 6)
})

test('wheelchair rides show the van, big groups the SUV', () => {
  assert.equal(vehicleArt('standard', { wheelchair: true }), '/vehicles/minivan.svg')
  assert.equal(vehicleArt(null, { seats: 6 }), '/vehicles/suv-car.svg')
  assert.equal(vehicleArt(null, { seats: 4 }), '/vehicles/hatchback.svg')
})
