import { canAccessFleet } from '../access'
import { fenceHumanAuthority } from '../domain/authorityFence'
import { refreshDriverPresentDispatchStatus } from '../domain/driverDispatchPresence'

/** An independent transaction: releasing an elapsed, UNCONSUMED reservation
 * must not roll back because a subsequent new offer fails eligibility. */
export async function expireRideOffers(_root: unknown, args: { fleetId: string; driverId?: string; vehicleId?: string }, context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    await fenceHumanAuthority(tx, context.session, args.fleetId)
    if (!await canAccessFleet({ prisma: tx }, context.session, args.fleetId, 'operations')) throw new Error('Fleet is unavailable.')
    const now = new Date()
    const rows = await tx.matchOffer.findMany({
      where: { status: 'offered', expiresAt: { lte: now }, reservationReleasedAt: null,
        request: { is: { fleetId: args.fleetId } }, driver: { is: { fleetId: args.fleetId } }, vehicle: { is: { fleetId: args.fleetId } },
        ...(args.driverId || args.vehicleId ? { OR: [...(args.driverId ? [{ driverId: args.driverId }] : []), ...(args.vehicleId ? [{ vehicleId: args.vehicleId }] : [])] } : {}),
      }, orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }], take: 51,
      select: { id: true, driverId: true, requestId: true, vehicleId: true },
    })
    const batch = rows.slice(0, 50)
    const keys = [...new Set<string>(batch.flatMap((row: any) => [`driver:${row.driverId}`, `offer:${row.id}`, `request:${row.requestId}`, `vehicle:${row.vehicleId}`]))].sort()
    for (const key of keys) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`
    let releasedCount = 0
    for (const row of batch) {
      const result = await tx.matchOffer.updateMany({ where: { ...row, status: 'offered', expiresAt: { lte: now }, reservationReleasedAt: null }, data: { status: 'expired', reservationReleasedAt: now, respondedAt: now } })
      releasedCount += result.count
    }
    for (const driverId of [...new Set<string>(batch.map((row: any) => row.driverId).filter(Boolean))].sort()) await refreshDriverPresentDispatchStatus(tx, driverId, now)
    return { releasedCount, hasMore: rows.length > 50 }
  }, { isolationLevel: 'Serializable' })
}

export async function expireRequestFleetOffers(_root: unknown, args: { requestId: string }, context: any) {
  const header = await context.prisma.rideRequest.findUnique({ where: { id: args.requestId }, select: { fleetId: true } })
  if (!header?.fleetId) throw new Error('Request is unavailable.')
  // The independent sweep performs current authority checks under its own
  // physical fence. No labels, proofs or candidate records are read here.
  return expireRideOffers(null, { fleetId: header.fleetId }, context)
}
