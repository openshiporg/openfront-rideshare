import { GraphQLError } from 'graphql'
import { canAccessFleet, humanSessionId } from '../access'
import { marketplaceRideshareQuote, requestRide } from './marketplaceRideshare'
import { autoDispatchAfter } from './paymentTriggers'
import { normalizeReceiptEmail } from '../lib/request-confirmation'

// Dispatcher phone booking (taxi-dispatch call-taker screen): a dispatcher books a ride for a
// caller. It runs the rider's own quote -> request pipeline as a guest, so the fare, dispatch,
// confirmation and trip receipt behave exactly as if the caller had booked online. The caller's
// name and phone ride along in the request notes, where the dispatcher and driver see them.

const KEY = /^[A-Za-z0-9_-]{32,64}$/
const bad = (message: string) => new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })

type Args = {
  idempotencyKey: string; serviceId: string; pickupLabel: string; dropoffLabel: string; pickupPoint?: unknown; dropoffPoint?: unknown
  scheduledFor?: string | null; passengerCount?: number | null; wheelchairAccessible?: boolean | null
  riderName: string; riderPhone: string; receiptEmail?: string | null; notes?: string | null
}

export function phoneBookingNotes(args: Pick<Args, 'riderName' | 'riderPhone' | 'notes'>) {
  const name = String(args.riderName ?? '').trim().replace(/\s+/g, ' ')
  const phone = String(args.riderPhone ?? '').trim()
  if (!name || name.length > 120) throw bad('Enter the caller’s name.')
  if (!/^\+?[0-9 ().-]{7,24}$/.test(phone) || phone.replace(/\D/g, '').length < 7) throw bad('Enter a callback phone number.')
  const notes = String(args.notes ?? '').trim()
  const text = `Phone booking · ${name} · ${phone}${notes ? ` · ${notes}` : ''}`
  if (text.length > 1000) throw bad('Notes are too long.')
  return text
}

export async function createOperatorRide(_root: unknown, args: Args, context: any) {
  if (!humanSessionId(context.session)) throw new Error('Authentication is required.')
  if (typeof args.idempotencyKey !== 'string' || !KEY.test(args.idempotencyKey)) throw bad('Request key is invalid.')
  const service = await context.prisma.rideService.findUnique({ where: { id: String(args.serviceId || '') }, select: { id: true, fleetId: true } })
  if (!service?.fleetId || !await canAccessFleet(context, context.session, service.fleetId, 'operations')) throw bad('Choose a service you dispatch for.')
  const riderNotes = phoneBookingNotes(args)
  const receiptEmail = normalizeReceiptEmail(args.receiptEmail)
  const handoffId = `phone:${args.idempotencyKey}`

  // A retried submit (lost response) returns the ride it already booked instead of booking twice.
  const prior = await context.prisma.rideQuote.findFirst({ where: { handoffId }, select: { request: { select: { id: true, requestNumber: true, status: true, fleetId: true } } } })
  if (prior?.request) {
    if (prior.request.fleetId !== service.fleetId) throw bad('Request key belongs to a different booking.')
    return { requestId: prior.request.id, requestNumber: prior.request.requestNumber, status: prior.request.status, replayed: true }
  }
  if (prior) throw new GraphQLError('This booking was started but not placed. Start a new booking.', { extensions: { code: 'BAD_USER_INPUT' } })

  const guest = context.withSession(undefined)
  const quote: any = await marketplaceRideshareQuote(null, {
    serviceId: service.id, pickupLabel: args.pickupLabel, dropoffLabel: args.dropoffLabel, pickupPoint: args.pickupPoint ?? null, dropoffPoint: args.dropoffPoint ?? null,
    scheduledFor: args.scheduledFor || null, passengerCount: args.passengerCount ?? 1, wheelchairAccessible: args.wheelchairAccessible ?? false, handoffId,
  }, guest)
  const placed: any = await autoDispatchAfter(requestRide, 'request')(null, {
    quoteId: quote.quoteId, quoteProof: quote.quoteProof, passengerCount: args.passengerCount ?? 1,
    accessibilityNeeds: { wheelchairAccessible: args.wheelchairAccessible === true }, riderNotes, receiptEmail,
  }, guest)
  return { requestId: placed.requestId, requestNumber: placed.requestNumber, status: placed.status, replayed: false, fare: quote.fare, scheduledFor: quote.scheduledFor }
}
