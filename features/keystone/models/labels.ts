import { graphql } from '@keystone-6/core'
import { virtual } from '@keystone-6/core/fields'

// Readable record labels for lists with no natural name field, so the dashboard shows
// "Maya R. · driver license" instead of a cuid in titles, columns and pickers.
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const words = (value: unknown) => typeof value === 'string' && value ? value.replaceAll('_', ' ') : ''
const join = (...parts: unknown[]) => parts.filter(part => typeof part === 'string' && part).join(' · ')
const money = (minor: unknown, currency: unknown) => typeof minor === 'number' && typeof currency === 'string' && currency
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100)
  : ''
const shortDate = (value: unknown) => value instanceof Date || typeof value === 'string' ? new Date(value).toISOString().slice(0, 10) : ''

async function driverName(context: any, id: unknown) {
  return typeof id === 'string' ? (await context.prisma.driverProfile.findUnique({ where: { id }, select: { publicName: true } }))?.publicName || '' : ''
}
async function vehicleLabel(context: any, id: unknown) {
  return typeof id === 'string' ? (await context.prisma.vehicle.findUnique({ where: { id }, select: { label: true } }))?.label || '' : ''
}

export function recordLabel(resolve: (item: any, context: any) => Promise<string> | string) {
  return virtual({
    field: graphql.field({ type: graphql.String, resolve: async (item: any, _args: unknown, context: any) => (await resolve(item, context)) || String(item.id) }),
    ui: { itemView: { fieldMode: 'hidden' }, createView: { fieldMode: 'hidden' } },
  })
}

export const labels = {
  fareSummary: virtual({
    field: graphql.field({ type: graphql.String, resolve: (item: any) => {
      const unit = item.distanceUnit === 'kilometer' ? 'km' : 'mile'
      return [`${money(item.baseFareMinor, item.currencyCode)} base`, `${money(item.perDistanceUnitMinor, item.currencyCode)}/${unit}`, `${money(item.perMinuteMinor, item.currencyCode)}/min`, `${money(item.minimumFareMinor, item.currencyCode)} minimum`].join(' · ')
    } }),
    ui: { createView: { fieldMode: 'hidden' } },
  }),
  fleetMembership: recordLabel(async (item, context) => {
    const user = typeof item.userId === 'string' ? await context.prisma.user.findUnique({ where: { id: item.userId }, select: { name: true } }) : null
    return join(user?.name, words(item.role))
  }),
  availabilityRule: recordLabel(item => join(DAYS[item.dayOfWeek] || '', item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : '', item.timezone)),
  availabilityException: recordLabel(async (item, context) => join(await driverName(context, item.driverId), words(item.kind), shortDate(item.startsAt))),
  complianceDocument: recordLabel(async (item, context) => join(await driverName(context, item.driverId) || await vehicleLabel(context, item.vehicleId), words(item.kind))),
  policyEvaluation: recordLabel(async (item, context) => join(await driverName(context, item.driverId) || await vehicleLabel(context, item.vehicleId), words(item.outcome))),
  marketplaceRegistration: recordLabel(item => join(item.platform, words(item.status))),
  matchOffer: recordLabel(async (item, context) => join(await driverName(context, item.driverId), words(item.status))),
  payment: recordLabel(item => join(money(item.amountMinor, item.currencyCode), words(item.status))),
  refund: recordLabel(item => join('Refund', money(item.amountMinor, item.currencyCode), words(item.status))),
  ledgerEntry: recordLabel(item => join(words(item.kind) || 'Entry', money(item.amountMinor, item.currencyCode))),
  payout: recordLabel(async (item, context) => join(await driverName(context, item.driverId), money(item.amountMinor, item.currencyCode), words(item.status))),
  cancellation: recordLabel(item => join('Cancellation', words(item.reasonCode), shortDate(item.createdAt))),
  locationEvent: recordLabel(item => join(words(item.actorType), shortDate(item.recordedAt))),
  conversation: recordLabel(item => join('Conversation', words(item.status))),
  message: recordLabel(item => join(words(item.senderType), typeof item.body === 'string' ? item.body.slice(0, 40) : '')),
  review: recordLabel(item => join(typeof item.rating === 'number' ? `${item.rating}/5` : '', words(item.direction))),
  notification: recordLabel(item => join(words(item.channel), words(item.templateKey), words(item.status))),
  paymentObservation: recordLabel(item => join('Observation', item.observationKey)),
  requestCancellationCommand: recordLabel(item => join('Request cancellation', shortDate(item.createdAt))),
  fleetBrandingChange: recordLabel(item => join('Branding change', shortDate(item.createdAt))),
}
