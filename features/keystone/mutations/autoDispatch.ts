import type { PrismaClient } from '@prisma/client'
import { loadCurrentEligibility } from '../domain/eligibility'
import { isCurrentlyAvailableAt } from '../domain/currentAvailability'
import { placeRideOffer } from './rideLifecycle'
import { releaseElapsedOffers } from './offerMaintenance'
import { distanceKm, freshLocation, rankDrivers, type Candidate } from '../domain/autoDispatchRanking'

// Auto-dispatch: a fleet in `auto` mode offers each new on-demand ride to the nearest available driver, one at
// a time. A decline or an expired offer moves it to the next nearest; when nobody is left the request waits on
// the dispatch board for an operator, exactly as in manual mode. Scheduled rides stay with the operator.
// The offer goes through placeRideOffer, so every eligibility, capacity and reservation check is the manual one.

export const AUTO_DISPATCH_ACTOR = 'system:auto-dispatch'
export const AUTO_OFFER_SECONDS = 60
const recent = new Map<string, number>()

function pickupOf(quote: any): [number, number] | null {
  const point = quote?.routeEvidence?.pickup
  return Array.isArray(point) && point.length === 2 && point.every((value: unknown) => typeof value === 'number' && Number.isFinite(value)) ? [point[0], point[1]] : null
}

/** Offers one waiting request to the next nearest driver if it has no live offer. Never throws: dispatch is best
 * effort and the operator board is the fallback. `throttleMs` skips repeat calls (rider polls every few seconds). */
export async function advanceAutoDispatch(prisma: PrismaClient, requestId: string, { throttleMs = 0 } = {}) {
  if (throttleMs) {
    const last = recent.get(requestId) || 0
    if (Date.now() - last < throttleMs) return { offered: false, reason: 'throttled' as const }
    recent.set(requestId, Date.now())
    if (recent.size > 5000) for (const [key, at] of recent) if (Date.now() - at > 60_000) recent.delete(key)
  }
  try { return await advance(prisma, requestId) } catch (error) {
    return { offered: false, reason: 'error' as const, message: error instanceof Error ? error.message.slice(0, 200) : 'unknown' }
  }
}

async function advance(prisma: PrismaClient, requestId: string) {
  const header = await prisma.rideRequest.findUnique({ where: { id: requestId }, select: { id: true, fleetId: true, status: true, requestedFor: true, fleet: { select: { operationsMode: true, status: true } } } })
  if (!header?.fleetId || header.fleet?.operationsMode !== 'auto' || header.fleet.status !== 'active') return { offered: false, reason: 'manual' as const }
  if (!['requested', 'matching'].includes(header.status || '') || header.requestedFor) return { offered: false, reason: 'not_waiting' as const }
  await releaseElapsedOffers(prisma, { fleetId: header.fleetId, requestId })
  const now = new Date()
  const live = await prisma.matchOffer.findFirst({ where: { requestId, OR: [{ status: 'accepted' }, { status: 'offered', expiresAt: { gt: now }, reservationReleasedAt: null }] }, select: { id: true } })
  if (live) return { offered: false, reason: 'live_offer' as const }

  const request = await prisma.rideRequest.findUnique({ where: { id: requestId }, select: { passengerCount: true, accessibilityNeeds: true, matchOffers: { select: { driverId: true } }, quote: { select: { routeEvidence: true, service: { select: { status: true, passengerCapacity: true, wheelchairAccessible: true } } } } } })
  const service = request?.quote?.service
  if (!request || !service || service.status !== 'active') return { offered: false, reason: 'not_waiting' as const }
  const pickup = pickupOf(request.quote)
  const tried = new Set(request.matchOffers.map(offer => offer.driverId).filter(Boolean))
  const needs = request.accessibilityNeeds && typeof request.accessibilityNeeds === 'object' && !Array.isArray(request.accessibilityNeeds) ? request.accessibilityNeeds as Record<string, unknown> : {}
  const passengers = request.passengerCount || 1

  const drivers = await prisma.driverProfile.findMany({
    where: { fleetId: header.fleetId, status: 'active', dispatchStatus: 'available', id: { notIn: [...tried] as string[] } },
    select: { id: true, lastLocationLng: true, lastLocationLat: true, lastLocationAt: true },
    take: 200,
  })
  const candidates: Candidate[] = []
  for (const driver of drivers) {
    if (!await loadCurrentEligibility(prisma, 'driver', driver.id, header.fleetId, now) || !await isCurrentlyAvailableAt(prisma, driver.id, now)) continue
    const vehicles = await prisma.vehicle.findMany({ where: {
      fleetId: header.fleetId, status: 'active', drivers: { some: { id: driver.id } }, capacity: { gte: passengers },
      ...(needs.wheelchairAccessible === true || service.wheelchairAccessible ? { wheelchairAccessible: true } : {}),
    }, orderBy: { id: 'asc' }, take: 5, select: { id: true } })
    let vehicleId: string | null = null
    for (const vehicle of vehicles) if (await loadCurrentEligibility(prisma, 'vehicle', vehicle.id, header.fleetId, now)) { vehicleId = vehicle.id; break }
    if (!vehicleId) continue
    const at = freshLocation(driver, now)
    candidates.push({ driverId: driver.id, vehicleId, km: at && pickup ? distanceKm(at, pickup) : null })
  }
  for (const candidate of rankDrivers(candidates)) {
    try {
      await placeRideOffer(prisma, { requestId, driverId: candidate.driverId, vehicleId: candidate.vehicleId, expiresInSeconds: AUTO_OFFER_SECONDS, idempotencyKey: `auto:${requestId}:${candidate.driverId}` }, {
        actorId: AUTO_DISPATCH_ACTOR, onlyOffer: true,
        authorize: async tx => Boolean(await tx.fleet.findFirst({ where: { id: header.fleetId!, operationsMode: 'auto', status: 'active' }, select: { id: true } })),
      })
      return { offered: true, driverId: candidate.driverId, km: candidate.km }
    } catch (error) {
      // Someone else got there first (an operator, another poll): stop. Otherwise this driver just became ineligible; try the next.
      if (error instanceof Error && /already has a live offer|not matchable|Dispatch reservation changed/.test(error.message)) return { offered: false, reason: 'live_offer' as const }
    }
  }
  return { offered: false, reason: candidates.length ? 'all_busy' as const : 'no_driver' as const }
}

/** Every waiting on-demand request in a fleet, oldest first: when a driver comes online or moves. */
export async function advanceFleetAutoDispatch(prisma: PrismaClient, fleetId: string | null | undefined, { throttleMs = 0 } = {}) {
  if (!fleetId) return
  if (throttleMs) {
    const key = `fleet:${fleetId}`
    if (Date.now() - (recent.get(key) || 0) < throttleMs) return
    recent.set(key, Date.now())
  }
  try {
    const fleet = await prisma.fleet.findUnique({ where: { id: fleetId }, select: { operationsMode: true } })
    if (fleet?.operationsMode !== 'auto') return
    const waiting = await prisma.rideRequest.findMany({ where: { fleetId, status: { in: ['requested', 'matching'] }, requestedFor: null, createdAt: { gt: new Date(Date.now() - 2 * 60 * 60_000) } }, orderBy: { createdAt: 'asc' }, take: 10, select: { id: true } })
    for (const request of waiting) await advanceAutoDispatch(prisma, request.id)
  } catch { /* best effort */ }
}

/** The signed-in driver reports where they are while online. Stored rounded; never shown to riders. */
export async function reportDriverLocation(_root: unknown, args: { lng: number; lat: number; accuracyMeters?: number | null }, context: any) {
  const { currentHumanActor } = await import('../access')
  const { coarsePoint } = await import('../domain/autoDispatchRanking')
  const actor = await currentHumanActor(context.prisma, context.session)
  if (!actor) throw new Error('Sign in as a driver.')
  const point = coarsePoint(args.lng, args.lat)
  if (!point) throw new Error('Location is invalid.')
  if (args.accuracyMeters != null && (!Number.isFinite(args.accuracyMeters) || args.accuracyMeters > 5000)) return { saved: false }
  const driver = await context.prisma.driverProfile.findFirst({ where: { userId: actor.id, status: 'active' }, select: { id: true, fleetId: true, dispatchStatus: true } })
  if (!driver || driver.dispatchStatus === 'offline') return { saved: false }
  await context.prisma.driverProfile.update({ where: { id: driver.id }, data: { lastLocationLng: point[0], lastLocationLat: point[1], lastLocationAt: new Date() } })
  if (driver.dispatchStatus === 'available') await advanceFleetAutoDispatch(context.prisma, driver.fleetId)
  return { saved: true }
}
