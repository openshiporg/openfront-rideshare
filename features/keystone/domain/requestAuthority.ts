import { currentHumanActor, humanSessionId, type Session } from '../access'
import { ownsRequest } from './requestReceipt'
import { Prisma } from '@prisma/client'
import { fenceHumanAuthority } from './authorityFence'

export const requestAuthoritySelect = {
  id: true, requestNumber: true, riderId: true, fleetId: true,
  guestProofHash: true, guestProofExpiresAt: true,
} as const

/** Only native, still-persisted humans or a bounded original guest proof. A
 * rejected credential is never downgraded to anonymous guest authority. */
export async function currentRiderId(db: any, session?: Session): Promise<string | null> {
  if (!session) return null
  if (!humanSessionId(session)) throw new Error('A current rider account session is required.')
  await fenceHumanAuthority(db, session)
  const actor = await currentHumanActor(db, session)
  if (!actor) throw new Error('A current rider account session is required.')
  return actor.id
}

export async function authorizedRequestHeader(db: any, session: Session | undefined, requestId: string, proof?: string | null) {
  const riderId = await currentRiderId(db, session)
  if (typeof requestId !== 'string' || !requestId || requestId.length > 200) return null
  if (!riderId && (typeof proof !== 'string' || proof.length < 40 || proof.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(proof))) return null
  const header = await db.rideRequest.findUnique({ where: { id: requestId }, select: requestAuthoritySelect })
  if (!header || !ownsRequest(header, session, proof)) return null
  return header
}

/** The immutable receipt binding records the ORIGINAL owner kind. An account
 * FK becoming null must never convert that receipt into a guest request. Missing
 * legacy provenance is unavailable, not guessed/backfilled. This predicate runs
 * in the private SELECT, before any private graph is returned from the database. */
export function requestOwnerWhere(header: { id: string; fleetId: string | null; riderId: string | null }) {
  return {
    id: header.id, fleetId: header.fleetId, riderId: header.riderId,
    AND: [
      { quoteSnapshot: { path: ['_requestReceipt', 'version'], equals: 2 } },
      header.riderId
        ? { quoteSnapshot: { path: ['_requestReceipt', 'riderId'], equals: header.riderId } }
        : { quoteSnapshot: { path: ['_requestReceipt', 'riderId'], equals: Prisma.JsonNull } },
    ],
  }
}
