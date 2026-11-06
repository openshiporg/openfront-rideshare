import assert from 'node:assert/strict'
import test from 'node:test'
import { deliverTripReceipt, receiptLines, tripReceiptHtml } from '../features/keystone/lib/trip-receipt'
import { phoneBookingNotes } from '../features/keystone/mutations/operatorBooking'
import { driverEarningsCsv } from '../features/platform/finance/domain/driverEarnings'

const SMTP = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_STORE_LINK']
for (const key of SMTP) process.env[key] = key === 'SMTP_STORE_LINK' ? 'https://ride.test' : 'x'

const fare = { currencyCode: 'USD', baseFareMinor: 350, distanceMinor: 792, durationMinor: 278, bookingFeeMinor: 100, totalMinor: 1520 }

function fakeTrip(overrides: any = {}) {
  const rows = new Map<string, any>()
  const trip = { id: 't1', status: 'completed', requestId: 'r1', riderId: 'u1', confirmationCode: 'TRIP-1', startedAt: new Date(), completedAt: new Date('2026-11-06T05:36:35Z'), pickupLabel: 'A', dropoffLabel: 'B', finalFareSnapshot: fare, bookingSnapshot: {}, fleet: { name: 'Harbor', timezone: 'America/New_York' }, rider: { email: 'r@x.co', name: 'Ria' }, driver: { publicName: 'Maya R.' }, payments: [{ status: 'captured', purpose: 'fare', amountMinor: 1520, currencyCode: 'USD', providerEvidence: { card: { brand: 'visa', last4: '4242' } } }], ...overrides }
  return { rows, prisma: {
    trip: { findUnique: async () => trip },
    notification: {
      findUnique: async ({ where }: any) => rows.get(where.idempotencyKey) || (where.idempotencyKey === 'ride-request-received:r1' ? { payload: { receiptEmail: 'guest@x.co' } } : null),
      create: async ({ data }: any) => { if (rows.has(data.idempotencyKey)) throw Object.assign(new Error('dup'), { code: 'P2002' }); const row = { id: `n${rows.size}`, ...data }; rows.set(data.idempotencyKey, row); return row },
      update: async ({ where, data }: any) => { for (const row of rows.values()) if (row.id === where.id) Object.assign(row, { status: data.status }); return {} },
    },
  } }
}

test('receipt lines itemise the fare and reconcile to the total', () => {
  const lines = receiptLines(fare)
  assert.equal(lines.total, 1520)
  assert.deepEqual(lines.lines.map(line => line.label), ['Base fare', 'Distance', 'Time', 'Booking fee'])
  const minimum = receiptLines({ currencyCode: 'USD', baseFareMinor: 300, totalMinor: 800 })
  assert.equal(minimum.lines.at(-1)?.label, 'Minimum fare adjustment')
  assert.equal(minimum.lines.at(-1)?.amount, '$5.00')
})

test('trip receipt is sent once, names the card charged and escapes content', async () => {
  const { rows, prisma } = fakeTrip({ pickupLabel: '<b>Pier</b>' })
  const sent: any[] = []
  const send = async (mail: any) => { sent.push(mail); return { sent: true, messageId: 'm1' } }
  await deliverTripReceipt(prisma, 't1', send)
  await deliverTripReceipt(prisma, 't1', send)
  assert.equal(sent.length, 1)
  assert.equal(sent[0].to, 'r@x.co')
  assert.match(sent[0].paymentLine, /Charged \$15\.20 to your Visa ending 4242/)
  assert.equal(rows.get('trip-receipt:t1').status, 'sent')
  assert.ok(!tripReceiptHtml(sent[0]).includes('<b>Pier</b>'))
})

test('guest trip receipt goes to the email given at request time; cash trips say what is due', async () => {
  const { prisma } = fakeTrip({ riderId: null, rider: null, payments: [] })
  const sent: any[] = []
  await deliverTripReceipt(prisma, 't1', async mail => { sent.push(mail); return { sent: true } })
  assert.equal(sent[0].to, 'guest@x.co')
  assert.match(sent[0].paymentLine, /due to the fleet/)
})

test('no receipt for trips that did not complete', async () => {
  const { rows, prisma } = fakeTrip({ status: 'cancelled' })
  await deliverTripReceipt(prisma, 't1', async () => ({ sent: true }))
  assert.equal(rows.size, 0)
})

test('phone booking notes carry the caller and reject bad input', () => {
  assert.equal(phoneBookingNotes({ riderName: ' Dana  Cole ', riderPhone: '+1 (310) 555-0142', notes: 'Gate code 42' }), 'Phone booking · Dana Cole · +1 (310) 555-0142 · Gate code 42')
  assert.throws(() => phoneBookingNotes({ riderName: '', riderPhone: '3105550142' }), /name/)
  assert.throws(() => phoneBookingNotes({ riderName: 'Dana', riderPhone: 'call me' }), /phone/)
})

test('driver earnings CSV totals per driver and neutralises formulas', () => {
  const csv = driverEarningsCsv({ from: '2026-11-01', to: '2026-11-07', truncated: false, drivers: [
    { driverId: 'd1', driverName: '=Maya, R.', currencyCode: 'USD', trips: 3, onTripSeconds: 5400, faresMinor: 4560, feesMinor: 500, collectedMinor: 3040, refundedMinor: 1520, uncollectedMinor: 2020 },
  ] })
  const [header, row] = csv.trim().split('\r\n')
  assert.match(header, /^Driver,Currency,Completed trips.*Outstanding/)
  assert.equal(row, `"'=Maya, R.",USD,3,1.50,45.60,5.00,50.60,30.40,15.20,15.20,20.20`)
})
