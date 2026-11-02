import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverRequestReceived, normalizeReceiptEmail } from '../features/keystone/lib/request-confirmation'

const SMTP = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_STORE_LINK']
const configure = (on: boolean) => { for (const key of SMTP) { if (on) process.env[key] = key === 'SMTP_STORE_LINK' ? 'https://ride.test' : 'x'; else delete process.env[key] } }
function fake(rider: any = { email: 'a@b.co', name: 'Ann' }) {
  const rows = new Map<string, any>()
  const request = { id: 'r1', riderId: rider ? 'u1' : null, requestNumber: 'RIDE-1', requestedFor: new Date('2026-11-03T18:00:00.000Z'), pickupLabel: 'A', dropoffLabel: 'B', fleet: { name: 'Fleet', timezone: 'America/Chicago' }, rider }
  return { rows, prisma: {
    rideRequest: { findUnique: async () => request },
    notification: {
      create: async ({ data }: any) => { if (rows.has(data.idempotencyKey)) throw Object.assign(new Error('dup'), { code: 'P2002' }); const row = { id: `n${rows.size}`, ...data }; rows.set(data.idempotencyKey, row); return row },
      update: async ({ where, data }: any) => { for (const row of rows.values()) if (row.id === where.id) row.status = data.status; return {} },
    },
  } }
}
const KEY = 'ride-request-received:r1'

test('sends once on success and links the rider account', async () => {
  configure(true)
  const { rows, prisma } = fake()
  const sent: any[] = []
  await deliverRequestReceived(prisma, 'r1', async mail => { sent.push(mail); return { sent: true } })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].link, 'https://ride.test/account/rides')
  assert.match(sent[0].whenLabel, /CST/)
  assert.equal(rows.get(KEY).status, 'sent')
})

test('a replay does not resend', async () => {
  configure(true)
  const { prisma } = fake()
  let count = 0
  const send = async () => { count++; return { sent: true } }
  await deliverRequestReceived(prisma, 'r1', send)
  await deliverRequestReceived(prisma, 'r1', send)
  assert.equal(count, 1)
})

test('a mail throw is recorded as failed and never surfaces', async () => {
  configure(true)
  const { rows, prisma } = fake()
  await deliverRequestReceived(prisma, 'r1', async () => { throw new Error('boom') })
  assert.equal(rows.get(KEY).status, 'failed')
})

test('unconfigured mail is recorded as skipped', async () => {
  configure(false)
  const { rows, prisma } = fake()
  let count = 0
  await deliverRequestReceived(prisma, 'r1', async () => { count++; return { sent: true } })
  assert.equal(count, 0)
  assert.equal(rows.get(KEY).status, 'skipped_not_configured')
})

test('a guest request without an email is recorded, not mailed', async () => {
  configure(true)
  const { rows, prisma } = fake(null)
  let count = 0
  await deliverRequestReceived(prisma, 'r1', async () => { count++; return { sent: true } })
  assert.equal(count, 0)
  assert.equal(rows.get(KEY).status, 'skipped_no_recipient')
})

test('bookkeeping failure never throws', async () => {
  await deliverRequestReceived({ rideRequest: { findUnique: async () => { throw new Error('db down') } } }, 'r1')
})

test('a guest with an Email for receipt is mailed, with the guest receipt link in a URL fragment', async () => {
  configure(true)
  const { rows, prisma } = fake(null)
  const sent: any[] = []
  await deliverRequestReceived(prisma, 'r1', async mail => { sent.push(mail); return { sent: true } }, { receiptEmail: 'guest@resend.dev', requestProof: 'abc.def' })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'guest@resend.dev')
  assert.equal(sent[0].link, 'https://ride.test/#receipt=r=r1&n=RIDE-1&p=abc.def')
  assert.equal(rows.get(KEY).status, 'sent')
})

test('a guest email without a proof falls back to a non sign-in page only for signed-in riders', async () => {
  configure(true)
  const { prisma } = fake()
  const sent: any[] = []
  await deliverRequestReceived(prisma, 'r1', async mail => { sent.push(mail); return { sent: true } }, {})
  assert.equal(sent[0].link, 'https://ride.test/account/rides')
})

test('the receipt email is validated and normalised server-side', () => {
  assert.equal(normalizeReceiptEmail('  Guest@Resend.DEV '), 'guest@resend.dev')
  assert.equal(normalizeReceiptEmail(''), null)
  assert.equal(normalizeReceiptEmail(null), null)
  assert.throws(() => normalizeReceiptEmail('nope'), /valid email/)
  assert.throws(() => normalizeReceiptEmail('a@b'), /valid email/)
  assert.throws(() => normalizeReceiptEmail(7), /valid email/)
})

import { receiptFromFragment } from '../features/storefront/domain/riderReceiptStorage'
test('the emailed receipt fragment parses, and anything malformed is ignored', () => {
  assert.deepEqual(receiptFromFragment('#receipt=r=r1&n=RIDE-1&p=abc.def'), { requestId: 'r1', requestNumber: 'RIDE-1', requestProof: 'abc.def', status: 'requested' })
  assert.equal(receiptFromFragment(''), null)
  assert.equal(receiptFromFragment('#other=1'), null)
  assert.equal(receiptFromFragment('#receipt=r=r1&n=RIDE-1'), null)
  assert.equal(receiptFromFragment('#receipt=r=r1&n=RIDE-1&p=no-dot'), null)
})
