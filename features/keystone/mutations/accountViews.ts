import { myRideshareRequests } from './riderReceipts'
import { currentRiderId } from '../domain/requestAuthority'
import { decodeKeyset, encodeKeyset } from '../domain/keysetCursor'
import { rideReadiness } from '../domain/operationalReadiness'

export async function myDriverWorkspace(_root: unknown, args: { offersCursor?: string | null; tripsCursor?: string | null } | null, context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    const actorId = await currentRiderId(tx, context.session)
    if (!actorId) throw new Error('A current driver account session is required.')
    const driver = await tx.driverProfile.findFirst({ where: { userId: actorId }, select: { id: true, userId: true, fleetId: true, publicName: true, status: true, dispatchStatus: true } })
    const readiness = rideReadiness()
    const empty = { actorId, driver: driver ? { id: driver.id, publicName: driver.publicName, status: driver.status, dispatchStatus: driver.dispatchStatus } : null, offers: [], trips: [], offersNextCursor: null, tripsNextCursor: null, actionsEnabled: false, actionsBlockedReason: 'An active fleet-linked driver profile is required.' }
    if (!driver?.fleetId || driver.status !== 'active') return empty
    const scope = JSON.stringify([actorId, driver.fleetId, driver.id])
    const offerBoundary = decodeKeyset(args?.offersCursor, 'driver_offers', scope)
    const tripBoundary = decodeKeyset(args?.tripsCursor, 'driver_trips', scope)
    const [offerRows, tripRows] = await Promise.all([
      tx.matchOffer.findMany({ where: { driverId: driver.id, driver: { is: { userId: actorId, fleetId: driver.fleetId, status: 'active' } }, request: { is: { fleetId: driver.fleetId } }, vehicle: { is: { fleetId: driver.fleetId } }, status: 'offered', expiresAt: { gt: new Date() },
        ...(offerBoundary ? { OR: offerBoundary.time ? [{ offeredAt: { lt: new Date(offerBoundary.time) } }, { offeredAt: new Date(offerBoundary.time), id: { lt: offerBoundary.id } }, { offeredAt: null }] : [{ offeredAt: null, id: { lt: offerBoundary.id } }] } : {}),
      }, orderBy: [{ offeredAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }], take: 26,
      select: { id: true, status: true, offeredAt: true, expiresAt: true, request: { select: { id: true, requestNumber: true, requestedFor: true, passengerCount: true, pickupLabel: true, dropoffLabel: true } }, vehicle: { select: { id: true, label: true, make: true, model: true, color: true, plateMasked: true } } } }),
      tx.trip.findMany({ where: { driverId: driver.id, fleetId: driver.fleetId, driver: { is: { userId: actorId, fleetId: driver.fleetId, status: 'active' } }, vehicle: { is: { fleetId: driver.fleetId } }, status: { in: ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress'] },
        ...(tripBoundary ? { OR: tripBoundary.time ? [{ scheduledFor: { gt: new Date(tripBoundary.time) } }, { scheduledFor: new Date(tripBoundary.time), id: { gt: tripBoundary.id } }] : [{ scheduledFor: null, id: { gt: tripBoundary.id } }, { scheduledFor: { not: null } }] } : {}),
      }, orderBy: [{ scheduledFor: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }], take: 26,
      select: { id: true, acceptedOfferId: true, confirmationCode: true, status: true, scheduledFor: true, pickupLabel: true, dropoffLabel: true, vehicle: { select: { id: true, label: true, plateMasked: true } } } }),
    ])
    const next = (rows: any[], purpose: string, field: string) => rows.length > 25 ? encodeKeyset(purpose, scope, { id: rows[24].id, time: rows[24][field]?.toISOString() || null }) : null
    return { ...empty, offers: offerRows.slice(0,25), trips: tripRows.slice(0,25), offersNextCursor: next(offerRows, 'driver_offers', 'offeredAt'), tripsNextCursor: next(tripRows, 'driver_trips', 'scheduledFor'), actionsEnabled: readiness.bookingEnabled, actionsBlockedReason: readiness.bookingEnabled ? null : readiness.reason }
  }, { isolationLevel: 'RepeatableRead' })
}

export async function myRideshareTrips(_root: unknown, _args: unknown, context: any) {
  const history = await myRideshareRequests(_root, {}, context)
  // Retained legacy first-page API; connected account uses cursor history.
  return history.items.filter((item: any) => item.trip).map((item: any) => ({ ...item.trip, createdAt: item.createdAt }))
}
