import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verifyStripeSignature } from '../features/integrations/payment/stripeSignature'
import { applyStripeEvent } from '../features/keystone/mutations/stripeWebhook'

const secret = 'whsec_testsecret123456'
const body = JSON.stringify({ id: 'evt_1', type: 'x' })
const now = 1_800_000_000_000
const sign = (t: number, b = body, s = secret) => `t=${t},v1=${createHmac('sha256', s).update(`${t}.${b}`).digest('hex')}`

test('stripe signature: valid passes; tampered body, wrong secret, stale, missing and malformed fail', () => {
  const t = Math.floor(now / 1000)
  assert.equal(verifyStripeSignature(body, sign(t), secret, now), true)
  assert.equal(verifyStripeSignature(body + ' ', sign(t), secret, now), false)
  assert.equal(verifyStripeSignature(body, sign(t, body, 'whsec_other_secret_1'), secret, now), false)
  assert.equal(verifyStripeSignature(body, sign(t - 301), secret, now), false)
  assert.equal(verifyStripeSignature(body, null, secret, now), false)
  assert.equal(verifyStripeSignature(body, 't=abc,v1=zz', secret, now), false)
  assert.equal(verifyStripeSignature(body, `t=${t}`, secret, now), false)
  assert.equal(verifyStripeSignature(body, `t=${t},v1=abcd,${sign(t).split(',')[1]}`, secret, now), true, 'any matching v1 is enough (key rotation)')
})

test('stripe events: malformed, unknown payment and unrelated types change nothing', async () => {
  const prisma: any = { payment: { findFirst: async () => null }, refund: { findFirst: async () => null } }
  assert.deepEqual(await applyStripeEvent(prisma, { type: 'checkout.session.completed' }), { handled: false, reason: 'malformed' })
  assert.deepEqual(await applyStripeEvent(prisma, { type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', mode: 'payment' } } }), { handled: false, reason: 'unknown_payment' })
  assert.deepEqual(await applyStripeEvent(prisma, { type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', mode: 'setup' } } }), { handled: false, reason: 'not_a_payment' })
  assert.deepEqual(await applyStripeEvent(prisma, { type: 'customer.created', data: { object: { id: 'cus_1' } } }), { handled: false, reason: 'ignored_type' })
  assert.deepEqual(await applyStripeEvent(prisma, { type: 'refund.updated', data: { object: { id: 're_1', status: 'pending' } } }), { handled: true, reason: 'not_final' })
  assert.deepEqual(await applyStripeEvent(prisma, { type: 'refund.updated', data: { object: { id: 're_1', status: 'succeeded' } } }), { handled: false, reason: 'unknown_refund' })
})

test('stripe events: a session for a different trip is refused before any money moves', async () => {
  const prisma: any = { payment: { findFirst: async () => ({ id: 'p1', tripId: 'trip-A', amountMinor: 100, currencyCode: 'USD' }) } }
  const r = await applyStripeEvent(prisma, { type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', mode: 'payment', client_reference_id: 'trip-B', payment_status: 'paid', amount_total: 100, currency: 'usd' } } })
  assert.deepEqual(r, { handled: false, reason: 'trip_mismatch' })
  const wrongAmount = await applyStripeEvent(prisma, { type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', mode: 'payment', client_reference_id: 'trip-A', payment_status: 'paid', amount_total: 99, currency: 'usd' } } })
  assert.deepEqual(wrongAmount, { handled: false, reason: 'amount_mismatch' })
})

test('request expiry only touches requests with no trip and no live offer, past the waiting window', async () => {
  const { expireStaleRideRequests } = await import('../features/keystone/mutations/maintenance')
  let seen: any
  const prisma: any = { rideRequest: { updateMany: async (q: any) => { seen = q; return { count: 3 } } } }
  const at = new Date('2026-11-07T12:00:00Z')
  assert.equal(await expireStaleRideRequests(prisma, at), 3)
  assert.deepEqual(seen.where.status, { in: ['requested', 'matching'] })
  assert.deepEqual(seen.where.trip, { is: null })
  assert.deepEqual(seen.where.matchOffers, { none: { status: { in: ['offered', 'accepted'] } } })
  assert.equal(+seen.where.OR[0].createdAt.lt, +at - 2 * 3600_000)
  assert.equal(+seen.where.OR[1].requestedFor.lt, +at - 3600_000)
  assert.equal(seen.data.status, 'expired')
})

test('no timer, worker or retry queue: the notification retry module is gone and maintenance has no notification step', async () => {
  const { existsSync, readFileSync } = await import('node:fs')
  assert.equal(existsSync(new URL('../features/keystone/lib/notification-retry.ts', import.meta.url)), false)
  assert.ok(!/retryStuckNotifications/.test(readFileSync(new URL('../features/keystone/mutations/maintenance.ts', import.meta.url), 'utf8')))
  assert.equal(existsSync(new URL('../instrumentation.ts', import.meta.url)), false)
})
