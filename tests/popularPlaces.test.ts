import { test } from 'node:test'
import assert from 'node:assert/strict'
import { popularPlaces } from '../features/keystone/domain/popularPlaces'

const req = (riderId: string | null, dropoffLabel: string, pickupLabel = '') => ({ riderId, dropoffLabel, pickupLabel })

test('a place is public only once three different riders used it', () => {
  const rows = [req('a', 'Harbor City Ferry Terminal'), req('a', 'Harbor City Ferry Terminal'), req('b', 'Harbor City Ferry Terminal'), req('a', 'Bayview Market'), req('b', 'Bayview Market'), req('c', 'Bayview Market')]
  assert.deepEqual(popularPlaces(rows), ['Bayview Market'])
  assert.deepEqual(popularPlaces([...rows, req('c', 'harbor city ferry terminal')]), ['Harbor City Ferry Terminal', 'Bayview Market'])
})

test('guests and street addresses never become suggestions', () => {
  const rows = ['a', 'b', 'c', 'd'].flatMap(id => [req(id, '212 NE 15th St'), req(id, 'Pier 33 Apt 4'), req(null, 'Airport Terminal 1')])
  assert.deepEqual(popularPlaces(rows), [])
})

test('service areas are excluded, most riders first, capped at three', () => {
  const rows = ['a', 'b', 'c', 'd'].flatMap(id => [req(id, 'Harbor City central neighborhoods'), req(id, 'Ferry Terminal', 'Harbor City Station'), req(id, 'Airport Terminal 1')]).concat([req('e', 'Airport Terminal 1'), req('a', 'Bayview Market'), req('b', 'Bayview Market'), req('c', 'Bayview Market')])
  assert.deepEqual(popularPlaces(rows, { exclude: ['Harbor City Central Neighborhoods'] }), ['Airport Terminal 1', 'Ferry Terminal', 'Harbor City Station'])
})
