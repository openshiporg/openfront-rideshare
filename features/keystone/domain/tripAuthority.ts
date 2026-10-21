import type { Prisma } from '@prisma/client'
import { canAccessFleet, currentHumanActor, type AuthorityReader, type FleetCapability, type Session } from '../access'

export type TripAuthorityReader = AuthorityReader & Pick<Prisma.TransactionClient, 'trip' | 'rideRequest' | 'matchOffer' | 'driverProfile' | 'vehicle'>
export const tripAuthoritySelect = { id: true, fleetId: true, riderId: true, requestId: true, acceptedOfferId: true, driverId: true, vehicleId: true } as const
export type TripAuthorityHeader = Prisma.TripGetPayload<{ select: typeof tripAuthoritySelect }>
export type TripPurpose = 'operator' | 'participant' | 'driverOrOperator' | 'riderOrOperator' | 'reviewParticipant'

export function sameTripAuthority(a: TripAuthorityHeader, b: TripAuthorityHeader): boolean {
  return a.id === b.id && a.fleetId === b.fleetId && a.riderId === b.riderId && a.requestId === b.requestId &&
    a.acceptedOfferId === b.acceptedOfferId && a.driverId === b.driverId && a.vehicleId === b.vehicleId
}

/** Minimal native authorization/tuple headers only. No labels, proof hashes,
 * economics, evidence, contacts, events or private projections before scope.
 * Caller supplies its transaction client; this is snapshot authority, not a
 * claim that every authority writer participates in a commit-time fence. */
export async function authorizedTripHeader(db: TripAuthorityReader, session: Session | undefined, tripId: string, purpose: TripPurpose, capability: FleetCapability = 'operations') {
  const actor = await currentHumanActor(db, session)
  if (!actor) return null
  const header = await db.trip.findUnique({ where: { id: tripId }, select: tripAuthoritySelect })
  if (!header?.fleetId) return null
  const fleet = await db.fleet.findUnique({ where: { id: header.fleetId }, select: { id: true } })
  if (fleet?.id !== header.fleetId) return null
  const operator = purpose !== 'reviewParticipant' && await canAccessFleet({ prisma: db }, session, header.fleetId, capability)
  const driver = header.driverId
    ? await db.driverProfile.findUnique({ where: { id: header.driverId }, select: { id: true, userId: true, fleetId: true, status: true } }) : null
  const assignedDriver = Boolean(['participant', 'driverOrOperator', 'reviewParticipant'].includes(purpose) && driver && driver.userId === actor.id && driver.status === 'active' && driver.fleetId === header.fleetId)
  const rider = ['participant', 'riderOrOperator', 'reviewParticipant'].includes(purpose) && header.riderId === actor.id
  if (!operator && !assignedDriver && !rider) return null

  // Validate the related resource headers BEFORE loading their private graph.
  const request = header.requestId ? await db.rideRequest.findUnique({ where: { id: header.requestId }, select: {
    id: true, fleetId: true, riderId: true, trip: { select: { id: true } },
    quote: { select: { requestId: true, service: { select: { fleetId: true } } } },
  } }) : null
  const offer = header.acceptedOfferId ? await db.matchOffer.findUnique({ where: { id: header.acceptedOfferId }, select: {
    id: true, requestId: true, driverId: true, vehicleId: true,
  } }) : null
  const vehicle = header.vehicleId ? await db.vehicle.findUnique({ where: { id: header.vehicleId }, select: { id: true, fleetId: true } }) : null
  const bound = Boolean(request && request.id === header.requestId && request.trip?.id === header.id && request.fleetId === header.fleetId && request.riderId === header.riderId &&
    request.quote?.requestId === request.id && request.quote.service?.fleetId === header.fleetId &&
    offer && offer.id === header.acceptedOfferId && offer.requestId === header.requestId && offer.driverId === header.driverId && offer.vehicleId === header.vehicleId &&
    driver && driver.id === header.driverId && driver.fleetId === header.fleetId &&
    vehicle && vehicle.id === header.vehicleId && vehicle.fleetId === header.fleetId)
  return { header, actorId: actor.id, operator, assignedDriver, rider, bound }
}

/** Conditional private SELECT: reassignment cannot turn an authorized old
 * header into an unscoped new graph, even for read-committed callers. */
export function tripAuthorityWhere(header: TripAuthorityHeader): Prisma.TripWhereInput {
  return {
    ...header,
    request: { is: { id: header.requestId || '', fleetId: header.fleetId, riderId: header.riderId,
      quote: { is: { requestId: header.requestId, service: { is: { fleetId: header.fleetId } } } },
    } },
    acceptedOffer: { is: { id: header.acceptedOfferId || '', requestId: header.requestId, driverId: header.driverId, vehicleId: header.vehicleId } },
    driver: { is: { id: header.driverId || '', fleetId: header.fleetId } },
    vehicle: { is: { id: header.vehicleId || '', fleetId: header.fleetId } },
  }
}
