import type { PrismaClient } from '@prisma/client'
import { executePaymentAdapter } from '../utils/paymentProviderAdapter'
import { settleRefund } from './finance'
import { retrieveRefund, stripeSecretKey } from '../../integrations/payment/stripe'
import { STALE_SENDING_MS } from '../lib/notification-retry'

// Housekeeping for states that only move when time passes. The app has no scheduler, so these run from the reads
// that already act as the dispatch clock (rider status poll, driver workspace), at most once a minute per process.
// Each step is a compare-and-set, so two processes or a repeated run do no harm.

const ON_DEMAND_WAIT_MS = 2 * 60 * 60_000      // matches the auto-dispatch horizon: after this nobody is looking for a driver
const SCHEDULED_GRACE_MS = 60 * 60_000          // a booked pickup time that passed an hour ago without a driver
const STALE_REFUND_MS = 5 * 60_000

/** Requests nobody served become `expired`. Never while an offer is live or a trip exists. Returns the count. */
export async function expireStaleRideRequests(prisma: PrismaClient, now = new Date()) {
  const onDemandBefore = new Date(now.getTime() - ON_DEMAND_WAIT_MS)
  const scheduledBefore = new Date(now.getTime() - SCHEDULED_GRACE_MS)
  const result = await prisma.rideRequest.updateMany({
    where: {
      status: { in: ['requested', 'matching'] },
      trip: { is: null },
      matchOffers: { none: { status: { in: ['offered', 'accepted'] } } },
      OR: [{ requestedFor: null, createdAt: { lt: onDemandBefore } }, { requestedFor: { lt: scheduledBefore } }],
    },
    data: { status: 'expired' },
  })
  return result.count
}

/** A refund that stayed `processing` is asked about again: the stored provider reference when there is one, otherwise
 * the same refund call with the same idempotency key (the provider answers with the first result, it never refunds twice). */
export async function reconcileStaleRefunds(prisma: PrismaClient, now = new Date()) {
  const rows = await prisma.refund.findMany({
    where: { status: 'processing', updatedAt: { lt: new Date(now.getTime() - STALE_REFUND_MS) } },
    orderBy: { updatedAt: 'asc' }, take: 10,
    select: { id: true, amountMinor: true, currencyCode: true, providerReference: true, idempotencyKey: true,
      provider: { select: { id: true, code: true, isInstalled: true, refundPaymentFunction: true, createPaymentFunction: true, capturePaymentFunction: true, getPaymentStatusFunction: true, handleWebhookFunction: true } },
      payment: { select: { providerReference: true } } },
  })
  let settled = 0
  for (const refund of rows) {
    try {
      if (refund.provider?.code !== 'pp_stripe' || refund.provider.isInstalled !== 'yes' || !stripeSecretKey()) continue
      let status: string | undefined
      let externalId = refund.providerReference
      if (/^re_/.test(refund.providerReference || '')) {
        const live = await retrieveRefund(refund.providerReference)
        status = live.status; externalId = live.id
      } else {
        const evidence = await executePaymentAdapter({ provider: refund.provider, functionName: 'refundPaymentFunction', args: { paymentId: refund.payment?.providerReference, amount: refund.amountMinor, currency: refund.currencyCode, idempotencyKey: refund.idempotencyKey } })
        status = evidence.status === 'succeeded' ? 'succeeded' : 'pending'; externalId = String(evidence.externalId || '')
      }
      const final = status === 'succeeded' ? 'succeeded' : status === 'failed' ? 'failed' : status === 'canceled' ? 'cancelled' : null
      if (!final) continue
      const result = await settleRefund(prisma, { refundId: refund.id, status: final, externalId: externalId || undefined, source: 'stripe_reconcile' })
      if (result.settled) settled++
    } catch { /* provider unreachable: stays processing, tried again on the next sweep */ }
  }
  return settled
}

/** Notifications stuck in `sending` or `failed` are retried by re-running their delivery (see notification-retry). */
export async function retryStuckNotifications(prisma: PrismaClient, now = new Date()) {
  const stale = new Date(now.getTime() - STALE_SENDING_MS)
  const rows = await prisma.notification.findMany({
    where: { status: { in: ['sending', 'failed'] }, updatedAt: { lt: stale }, templateKey: { in: ['ride_request_received', 'trip_receipt'] } },
    orderBy: { updatedAt: 'asc' }, take: 10, select: { templateKey: true, idempotencyKey: true, tripId: true },
  })
  let retried = 0
  for (const row of rows) {
    if (row.templateKey === 'trip_receipt' && row.tripId) { const { deliverTripReceipt } = await import('../lib/trip-receipt'); await deliverTripReceipt(prisma, row.tripId); retried++ }
    else if (row.templateKey === 'ride_request_received') {
      const requestId = row.idempotencyKey.replace(/^ride-request-received:/, '')
      const { deliverRequestReceived } = await import('../lib/request-confirmation'); await deliverRequestReceived(prisma, requestId); retried++
    }
  }
  return retried
}

/** Trip locations are written with `expiresAt` = recorded time + the fleet's retention days. Past that they are deleted,
 * so the retention the fleet promises riders is what the database actually holds. Bounded per run. */
export async function purgeExpiredLocations(prisma: PrismaClient, now = new Date()) {
  const rows = await prisma.locationEvent.findMany({ where: { expiresAt: { lte: now } }, orderBy: { expiresAt: 'asc' }, take: 500, select: { id: true } })
  if (!rows.length) return 0
  const result = await prisma.locationEvent.deleteMany({ where: { id: { in: rows.map(row => row.id) }, expiresAt: { lte: now } } })
  return result.count
}

let last = 0
let running = false
/** Fire-and-forget from read paths. Never throws and never delays the read. */
export function runMaintenance(prisma: PrismaClient, { everyMs = 60_000 } = {}) {
  const now = Date.now()
  if (running || now - last < everyMs) return
  last = now; running = true
  void (async () => {
    for (const step of [expireStaleRideRequests, reconcileStaleRefunds, retryStuckNotifications, purgeExpiredLocations]) {
      try { await step(prisma) } catch (error) { console.error('Maintenance step failed:', step.name, error instanceof Error ? error.message : 'unknown') }
    }
  })().finally(() => { running = false })
}
