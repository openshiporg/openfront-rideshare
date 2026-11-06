import { fleetIdsFor, humanSessionId, isGlobalAdministrator } from '../access'
import { moneySnapshot } from './finance'

// Driver earnings report (taxi-dispatch / Uber Fleet "earnings statement"): per driver over a period,
// completed trips, gross fares, card collected, card refunds, cancellation/no-show fees and the
// net still to settle in cash. Finance-scoped; read-only. No payout policy is applied (none is
// configured), so this is gross trip revenue attributed to the driver who drove the trip.

type Row = {
  driverId: string; driverName: string; currencyCode: string; trips: number; onTripSeconds: number
  faresMinor: number; feesMinor: number; collectedMinor: number; refundedMinor: number; uncollectedMinor: number
}

const MAX_DAYS = 93
const MAX_TRIPS = 5000

function period(from?: string | null, to?: string | null) {
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date()
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 6 * 86_400_000 - (end.getTime() % 86_400_000))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) throw new Error('Choose a valid date range.')
  if (end.getTime() - start.getTime() > MAX_DAYS * 86_400_000) throw new Error(`Choose a range of ${MAX_DAYS} days or less.`)
  return { start, end }
}

const PAID = ['captured', 'partially_refunded', 'refunded']

export async function driverEarningsReport(_root: unknown, args: { from?: string | null; to?: string | null }, context: any) {
  if (!humanSessionId(context.session)) throw new Error('Authentication is required.')
  const global = await isGlobalAdministrator({ context, session: context.session } as any)
  const fleetIds = global ? null : await fleetIdsFor(context, context.session, 'finance')
  if (fleetIds && fleetIds.length === 0) throw new Error('Finance access is required.')
  const { start, end } = period(args.from, args.to)
  const prisma = context.prisma
  const fleetWhere = fleetIds ? { fleetId: { in: fleetIds } } : {}
  const trips = await prisma.trip.findMany({
    where: { ...fleetWhere, driverId: { not: null }, OR: [{ status: 'completed', completedAt: { gte: start, lte: end } }, { status: { in: ['cancelled', 'no_show'] }, updatedAt: { gte: start, lte: end } }] },
    take: MAX_TRIPS + 1,
    orderBy: [{ id: 'asc' }],
    select: {
      id: true, status: true, startedAt: true, completedAt: true, bookingSnapshot: true, finalFareSnapshot: true,
      driver: { select: { id: true, publicName: true } },
      cancellations: { select: { feeMinor: true, currencyCode: true } },
      payments: { select: { status: true, amountMinor: true, currencyCode: true, purpose: true, refunds: { where: { status: 'succeeded' }, select: { amountMinor: true } } } },
    },
  })
  const truncated = trips.length > MAX_TRIPS
  const rows = new Map<string, Row>()
  for (const trip of trips.slice(0, MAX_TRIPS)) {
    if (!trip.driver) continue
    const snapshot: any = trip.finalFareSnapshot ? { quote: trip.finalFareSnapshot } : trip.bookingSnapshot
    let fare: { amount: number; currency: string } | null = null
    try { fare = moneySnapshot(snapshot) } catch { fare = null }
    const completed = trip.status === 'completed'
    const fees = (trip.cancellations || []).reduce((sum: number, c: any) => sum + (c.feeMinor || 0), 0)
    const currency = fare?.currency || trip.cancellations?.[0]?.currencyCode || trip.payments?.[0]?.currencyCode || 'USD'
    if (!completed && fees === 0) continue
    const key = `${trip.driver.id}:${currency}`
    const row = rows.get(key) || { driverId: trip.driver.id, driverName: trip.driver.publicName || 'Driver', currencyCode: currency, trips: 0, onTripSeconds: 0, faresMinor: 0, feesMinor: 0, collectedMinor: 0, refundedMinor: 0, uncollectedMinor: 0 }
    if (completed) {
      row.trips += 1
      row.faresMinor += fare?.amount || 0
      if (trip.startedAt && trip.completedAt) row.onTripSeconds += Math.max(0, Math.round((trip.completedAt.getTime() - trip.startedAt.getTime()) / 1000))
    }
    row.feesMinor += fees
    const due = (completed ? fare?.amount || 0 : 0) + fees
    let collected = 0
    for (const payment of trip.payments || []) {
      if (!PAID.includes(payment.status || '') || (payment.currencyCode && payment.currencyCode !== currency)) continue
      collected += payment.amountMinor || 0
      row.refundedMinor += (payment.refunds || []).reduce((sum: number, r: any) => sum + (r.amountMinor || 0), 0)
    }
    row.collectedMinor += collected
    row.uncollectedMinor += Math.max(0, due - collected)
    rows.set(key, row)
  }
  const drivers = [...rows.values()].sort((a, b) => b.faresMinor + b.feesMinor - (a.faresMinor + a.feesMinor) || a.driverName.localeCompare(b.driverName))
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), truncated, drivers }
}
