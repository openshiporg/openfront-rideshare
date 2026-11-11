// Trip receipt email on completion (Uber / taxi-dispatch model): sent once per trip after the
// trip has committed and any saved-card charge has run, so it states what was actually charged.
// The Notification row (unique idempotencyKey per trip) is the dedupe record. Recipient: the rider
// account's email, else the guest's "Email for receipt" kept on the request-received notification.
import { requestConfirmationConfigured } from './request-confirmation'

export type TripReceiptMail = {
  to: string; fleetName: string; confirmationCode: string; name: string; whenLabel: string; pickup: string; dropoff: string;
  driverName: string | null; lines: Array<{ label: string; amount: string }>; total: string; paymentLine: string; link: string
}
type Send = (mail: TripReceiptMail) => Promise<{ sent: boolean; error?: string; messageId?: string }>

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

export function money(minor: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100) } catch { return `${(minor / 100).toFixed(2)} ${currency}` }
}

/** The fare lines a rider expects on a receipt, from the fare snapshot the trip completed with. */
export function receiptLines(fare: any) {
  const currency = typeof fare?.currencyCode === 'string' ? fare.currencyCode : 'USD'
  const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  const lines = [
    { label: 'Base fare', minor: n(fare?.baseFareMinor) },
    { label: 'Distance', minor: n(fare?.distanceMinor) },
    { label: 'Time', minor: n(fare?.durationMinor) },
    { label: 'Booking fee', minor: n(fare?.bookingFeeMinor) },
  ].filter(line => line.minor > 0)
  const total = n(fare?.totalMinor)
  const listed = lines.reduce((sum, line) => sum + line.minor, 0)
  if (total > listed) lines.push({ label: 'Minimum fare adjustment', minor: total - listed })
  return { currency, total, lines: lines.map(line => ({ label: line.label, amount: money(line.minor, currency) })) }
}

export function tripReceiptHtml(mail: TripReceiptMail) {
  return emailLayout({
    storeName: mail.fleetName,
    preheader: `Trip ${mail.confirmationCode}: ${mail.total}`,
    title: `Thanks for riding, ${mail.name}`,
    body: `${emailParagraph(`Trip <strong>${escapeHtml(mail.confirmationCode)}</strong><br>${escapeHtml(mail.whenLabel)}${mail.driverName ? `<br>Driver: ${escapeHtml(mail.driverName)}` : ''}`)}
${emailPanel(`From: ${escapeHtml(mail.pickup)}<br>To: ${escapeHtml(mail.dropoff)}`)}
${emailTotals([...mail.lines.map(line => ({ label: line.label, value: line.amount })), { label: 'Total', value: mail.total }])}
${emailMuted(escapeHtml(mail.paymentLine))}
${emailButton('View your rides', mail.link)}`,
  })
}

async function sendTripReceiptEmail(mail: TripReceiptMail) {
  try {
    const port = Number(process.env.SMTP_PORT)
    // Loaded lazily so the mail module never joins the keystone import graph at build time.
    const { createTransport } = await import('nodemailer')
    const info = await createTransport({ host: process.env.SMTP_HOST, port, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }).sendMail({
      to: mail.to, from: process.env.SMTP_FROM, subject: `Your ${mail.fleetName} receipt · ${mail.confirmationCode}`, html: tripReceiptHtml(mail),
    })
    return { sent: true, messageId: typeof (info as any)?.messageId === 'string' ? (info as any).messageId : undefined }
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : 'send_failed' }
  }
}

function paymentLine(payments: Array<{ status: string | null; purpose: string | null; amountMinor: number | null; currencyCode: string | null; providerEvidence: any }>, total: string) {
  const fare = payments.find(payment => (payment.purpose || 'fare') === 'fare' && ['captured', 'succeeded', 'paid', 'confirmed'].includes(String(payment.status)))
  if (fare) {
    const card = fare.providerEvidence?.card
    return card?.last4 ? `Charged ${total} to your ${String(card.brand || 'card').replace(/^\w/, c => c.toUpperCase())} ending ${card.last4}.` : `Paid ${total}.`
  }
  if (payments.some(payment => (payment.purpose || 'fare') === 'fare' && payment.status === 'failed')) return `Your card was declined for ${total}. The fleet will contact you to settle the fare.`
  return `${total} is due to the fleet. Pay as agreed with your driver or from your trip page.`
}

import { emailButton, emailLayout, emailMuted, emailPanel, emailParagraph, emailTotals } from "./email-layout"

export async function deliverTripReceipt(prisma: any, tripId: string, send?: Send) {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, status: true, requestId: true, riderId: true, confirmationCode: true, startedAt: true, completedAt: true, pickupLabel: true, dropoffLabel: true, finalFareSnapshot: true, bookingSnapshot: true,
        fleet: { select: { name: true, timezone: true } }, rider: { select: { email: true, name: true } }, driver: { select: { publicName: true } },
        payments: { orderBy: [{ createdAt: 'desc' }], take: 20, select: { status: true, purpose: true, amountMinor: true, currencyCode: true, providerEvidence: true } } },
    })
    if (!trip || trip.status !== 'completed') return
    let row: any
    try {
      row = await prisma.notification.create({ data: { tripId: trip.id, recipientId: trip.riderId || null, channel: 'email', templateKey: 'trip_receipt', status: 'sending', payload: { tripId: trip.id, confirmationCode: trip.confirmationCode }, idempotencyKey: `trip-receipt:${trip.id}` }, select: { id: true } })
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error
      return
    }
    const mark = (status: string, error?: string, messageId?: string) => prisma.notification.update({ where: { id: row.id }, data: { status, attemptCount: { increment: 1 }, ...(messageId ? { providerReference: messageId.slice(0, 200) } : {}), ...(status === 'sent' ? { sentAt: new Date() } : {}), ...(error ? { lastError: error.slice(0, 200) } : {}) } })
    try {
      const guest = !trip.rider?.email && trip.requestId
        ? await prisma.notification.findUnique({ where: { idempotencyKey: `ride-request-received:${trip.requestId}` }, select: { payload: true } })
        : null
      const email = trip.rider?.email || (typeof guest?.payload?.receiptEmail === 'string' ? guest.payload.receiptEmail : null)
      if (!email) { await mark('skipped_no_recipient'); return }
      if (!requestConfirmationConfigured()) { await mark('skipped_not_configured'); return }
      const fare = trip.finalFareSnapshot || (trip.bookingSnapshot as any)?.quote || {}
      const { currency, total, lines } = receiptLines(fare)
      const zone = trip.fleet?.timezone || 'UTC'
      const at = trip.completedAt || new Date()
      const whenLabel = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(at)
      const totalLabel = money(total, currency)
      const base = String(process.env.SMTP_STORE_LINK).replace(/\/$/, '')
      const result = await (send || sendTripReceiptEmail)({
        to: email, fleetName: trip.fleet?.name || 'Your ride service', confirmationCode: trip.confirmationCode, name: trip.rider?.name || 'there', whenLabel,
        pickup: trip.pickupLabel || '', dropoff: trip.dropoffLabel || '', driverName: trip.driver?.publicName || null,
        lines, total: totalLabel, paymentLine: paymentLine(trip.payments || [], totalLabel), link: trip.riderId ? `${base}/account/rides` : `${base}/`,
      })
      await (result.sent ? mark('sent', undefined, result.messageId) : mark('failed', result.error || 'send_failed'))
    } catch (error) {
      try { await mark('failed', error instanceof Error ? error.message : 'send_failed') } catch { /* bookkeeping must never surface */ }
    }
  } catch (error) {
    console.error('Trip receipt bookkeeping failed:', error instanceof Error ? error.message : 'unknown')
  }
}

/** Sends the receipt after the trip command (and its saved-card charge wrapper) has answered; never changes the answer. */
export function receiptAfterTransition<R>(resolver: (root: unknown, args: any, context: any) => Promise<R>) {
  return async (root: unknown, args: any, context: any) => {
    const result: any = await resolver(root, args, context)
    if (result?.id && result.status === 'completed') {
      await Promise.race([deliverTripReceipt(context.prisma, result.id), new Promise(resolve => setTimeout(resolve, 8000))]).catch(() => {})
    }
    return result
  }
}
