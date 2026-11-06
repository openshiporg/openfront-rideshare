import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPlace, shortStreet, typedHouseNumber } from '../features/integrations/mapping/address'

test('an address keeps its house number and town', () => {
  const place = formatPlace({ type: 'house', osm_key: 'building', housenumber: '24205', street: 'Narbonne Avenue', city: 'Lomita', state: 'California' })
  assert.deepEqual(place, { label: '24205 Narbonne Ave, Lomita', name: '24205 Narbonne Ave', detail: 'Lomita' })
})

test('a named place leads with its name, then the address', () => {
  const place = formatPlace({ type: 'house', osm_key: 'shop', name: 'Del Amo Fashion Center', housenumber: '3525', street: 'West Carson Street', district: 'Southwood', city: 'Torrance' })
  assert.equal(place?.label, 'Del Amo Fashion Center, 3525 W Carson St, Torrance')
  assert.equal(place?.name, 'Del Amo Fashion Center')
  assert.equal(place?.detail, '3525 W Carson St · Torrance')
})

test('typing the address of a business keeps the address first', () => {
  const place = formatPlace({ type: 'house', osm_key: 'amenity', name: 'Alehouse', housenumber: '24123', street: 'Narbonne Avenue', city: 'Lomita' }, '24123 Narbonne Ave, Lomita')
  assert.equal(place?.label, '24123 Narbonne Ave, Lomita')
  assert.equal(place?.name, '24123 Narbonne Ave')
  assert.equal(place?.detail, 'Lomita · Alehouse')
})

test('a street result keeps the house number the rider typed', () => {
  const place = formatPlace({ type: 'street', osm_key: 'highway', name: 'Pacific Coast Highway', district: 'Harbor City', city: 'Los Angeles' }, '1600 Pacific Coast Highway, Harbor City')
  assert.equal(place?.label, '1600 Pacific Coast Hwy, Los Angeles')
  // …but not when the typed text names another street.
  assert.equal(formatPlace({ type: 'street', osm_key: 'highway', name: 'Lomita Boulevard', city: 'Lomita' }, '1600 Pacific Coast Highway')?.label, 'Lomita Blvd, Lomita')
})

test('a bare street (reverse lookup) still names its town', () => {
  assert.equal(formatPlace({ type: 'street', osm_key: 'highway', name: 'South Normandie Avenue', district: 'Harbor City', city: 'Los Angeles' })?.label, 'S Normandie Ave, Los Angeles')
})

test('cities and empty results', () => {
  assert.equal(formatPlace({ type: 'city', name: 'Torrance', state: 'California' })?.label, 'Torrance')
  assert.equal(formatPlace({}), null)
})

test('street and house-number helpers', () => {
  assert.equal(shortStreet('East Pacific Coast Highway'), 'E Pacific Coast Hwy')
  assert.equal(shortStreet('Avenue'), 'Avenue')
  assert.equal(shortStreet('West 253rd Street'), 'W 253rd St')
  assert.equal(typedHouseNumber('24123 Narbonne Ave'), '24123')
  assert.equal(typedHouseNumber('Pier 33'), null)
  assert.equal(typedHouseNumber('7 Eleven'), '7')
})
