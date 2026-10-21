import { canAccessFleet, humanSessionId } from '../access'
import { fenceHumanAuthority } from '../domain/authorityFence'
import { loadCurrentEligibility } from '../domain/eligibility'
import { isCurrentlyAvailableAt } from '../domain/currentAvailability'
import { decodeKeyset, encodeKeyset } from '../domain/keysetCursor'
import { isFutureScheduledRequest } from '../domain/dispatchSchedule'

/** Dedicated operations-purpose DTO. Dispatchers never need generic owner-only
 * Fleet/Policy reads, raw evaluations, evidence, contacts or provider config. */
export async function dispatchCandidatePage(_root: unknown, args: { requestId: string; cursor?: string | null; query?: string | null }, context: any) {
  const actorId = humanSessionId(context.session)
  if (!actorId) return null
  const query = args.query?.trim() || ''
  if (query.length > 100) throw new Error('Candidate search is too long.')
  return context.prisma.$transaction(async (tx: any) => {
    const header = await tx.rideRequest.findUnique({ where: { id: args.requestId }, select: { id: true, fleetId: true } })
    if (!header?.fleetId) return null
    await fenceHumanAuthority(tx, context.session, header.fleetId)
    if (!await canAccessFleet({ prisma: tx }, context.session, header.fleetId, 'operations')) return null
    const request = await tx.rideRequest.findFirst({ where: header, select: { id: true, status: true, requestedFor: true, passengerCount: true, accessibilityNeeds: true, quote: { select: { service: { select: { status: true, fleetId: true, passengerCapacity: true, wheelchairAccessible: true } } } } } })
    if (!request) return null
    const now = new Date()
    const service = request.quote?.service
    const fleet = await tx.fleet.findUnique({ where: { id: header.fleetId }, select: { status: true } })
    const scope = JSON.stringify([actorId, header.fleetId, header.id, query])
    const boundary = decodeKeyset(args.cursor, 'dispatch_pairs', scope)
    let after: [string, string | null] | null = null
    if (boundary) {
      try { after = JSON.parse(boundary.id) } catch { throw new Error('Invalid candidate cursor.') }
      if (boundary.time !== null || !Array.isArray(after) || after.length !== 2 || typeof after[0] !== 'string' || !after[0] || (after[1] !== null && (typeof after[1] !== 'string' || !after[1]))) throw new Error('Invalid candidate cursor.')
    }
    const base = { requestId: header.id, actorId, evaluatedAt: now.toISOString(), items: [] as any[], nextCursor: null as string | null }
    const scheduled = Boolean(request.requestedFor)
    if (!['requested','matching'].includes(request.status) || fleet?.status !== 'active' || !service || service.status !== 'active' || service.fleetId !== header.fleetId || (scheduled && !isFutureScheduledRequest(request.requestedFor, now))) return { ...base, blockedReason: 'The request or its service is unavailable for a new offer.' }
    const at = scheduled ? new Date(request.requestedFor) : now
    const needs = request.accessibilityNeeds && typeof request.accessibilityNeeds === 'object' ? request.accessibilityNeeds : {}
    if (!Number.isSafeInteger(request.passengerCount) || request.passengerCount < 1 || request.passengerCount > service.passengerCapacity) return { ...base, blockedReason: 'Passenger capacity evidence is unavailable.' }
    const drivers = await tx.driverProfile.findMany({ where: {
      fleetId: header.fleetId, status: 'active', dispatchStatus: { in: scheduled ? ['available','offered','assigned','on_trip'] : ['available'] },
      ...(scheduled ? { acceptsScheduled: true } : {}),
      ...(query ? { OR: [{ id: query }, { publicName: { contains: query, mode: 'insensitive' } }] } : {}),
      ...(after ? { id: { [after[1] === null ? 'gt' : 'gte']: after[0] } } : {}),
    }, orderBy: { id: 'asc' }, take: 11, select: { id: true, publicName: true } })
    const cursor = (driverId: string, vehicleId: string | null) => encodeKeyset('dispatch_pairs', scope, { id: JSON.stringify([driverId, vehicleId]), time: null })
    for (const driver of drivers.slice(0, 10)) {
      if (!await loadCurrentEligibility(tx, 'driver', driver.id, header.fleetId, now) || !await isCurrentlyAvailableAt(tx, driver.id, at)) { base.nextCursor = cursor(driver.id, null); continue }
      const vehicles = await tx.vehicle.findMany({ where: {
        fleetId: header.fleetId, status: 'active', drivers: { some: { id: driver.id, fleetId: header.fleetId } }, capacity: { gte: request.passengerCount },
        ...(needs.wheelchairAccessible === true || service.wheelchairAccessible ? { wheelchairAccessible: true } : {}),
        ...(after && after[0] === driver.id && after[1] ? { id: { gt: after[1] } } : {}),
      }, orderBy: { id: 'asc' }, take: 26, select: { id: true, label: true, capacity: true } })
      for (const vehicle of vehicles.slice(0,25)) {
        base.nextCursor = cursor(driver.id, vehicle.id)
        if (!await loadCurrentEligibility(tx, 'vehicle', vehicle.id, header.fleetId, now)) continue
        const liveOffer = await tx.matchOffer.findFirst({ where: { requestId: request.id, OR: [{ status: 'accepted' }, { status: 'offered', expiresAt: { gt: now }, OR: [{ driverId: driver.id }, { vehicleId: vehicle.id }] }] }, select: { id: true } })
        if (liveOffer) continue
        base.items.push({ driverId: driver.id, driverName: driver.publicName, vehicleId: vehicle.id, vehicleLabel: vehicle.label, capacity: vehicle.capacity })
        if (base.items.length === 20) return { ...base, blockedReason: null }
      }
      if (vehicles.length > 25) return { ...base, blockedReason: null }
      base.nextCursor = cursor(driver.id, null)
    }
    if (drivers.length <= 10) base.nextCursor = null
    return { ...base, blockedReason: null }
  }, { isolationLevel: 'RepeatableRead' })
}
