import test from 'node:test'
import assert from 'node:assert/strict'
import { DRIVER_RATING_MIN_REVIEWS, driverRating, imageUrl } from '../features/keystone/domain/publicMedia'

const review = (rating: number, extra: Record<string, unknown> = {}) => ({ status: 'published', direction: 'rider_to_driver', rating, ...extra })

test('driver rating: hidden below five published rider reviews', () => {
  assert.equal(DRIVER_RATING_MIN_REVIEWS, 5)
  assert.equal(driverRating([]), null)
  assert.equal(driverRating(null), null)
  assert.equal(driverRating([5, 5, 5, 5].map(r => review(r))), null)
})

test('driver rating: average of published rider_to_driver ratings, with the count', () => {
  assert.deepEqual(driverRating([5, 4, 5, 5, 4].map(r => review(r))), { average: 4.6, count: 5 })
  assert.deepEqual(driverRating([5, 4, 4, 5, 5, 4].map(r => review(r))), { average: 4.5, count: 6 })
  assert.deepEqual(driverRating([5, 5, 4, 4, 4, 4].map(r => review(r))), { average: 4.33, count: 6 })
})

test('driver rating: pending, hidden, driver-written and malformed reviews never count', () => {
  const noise = [
    review(1, { status: 'pending' }), review(1, { status: 'hidden' }), review(1, { status: 'removed' }),
    review(1, { direction: 'driver_to_rider' }), review(0), review(6), review(4.5), { status: 'published', direction: 'rider_to_driver', rating: null },
  ]
  assert.equal(driverRating([...noise, ...[5, 5, 5, 5].map(r => review(r))]), null, 'noise must not lift a thin sample past the threshold')
  assert.deepEqual(driverRating([...noise, ...[5, 5, 5, 5, 4].map(r => review(r))]), { average: 4.8, count: 5 })
})

test('image url: null without a stored image or when storage fails, signed url otherwise', async () => {
  const context = (fail = false) => ({ images: () => ({ getUrl: async (id: string, ext: string) => { if (fail) throw new Error('no storage'); return `https://bucket.example/${id}.${ext}` } }) })
  assert.equal(await imageUrl(context(), null, 'photo'), null)
  assert.equal(await imageUrl(context(), { photo_id: null, photo_extension: null }, 'photo'), null)
  assert.equal(await imageUrl(context(), { photo_id: 'abc', photo_extension: 'exe' }, 'photo'), null)
  assert.equal(await imageUrl(context(true), { photo_id: 'abc', photo_extension: 'png' }, 'photo'), null)
  assert.equal(await imageUrl(context(), { photo_id: 'abc', photo_extension: 'png' }, 'photo'), 'https://bucket.example/abc.png')
})
