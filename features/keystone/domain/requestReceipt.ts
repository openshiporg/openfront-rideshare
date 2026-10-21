import { createHash } from 'node:crypto'
import { createRecoverableRequestProof, verifyOwnershipProof } from './ownershipProof'
import { humanSessionId, type Session } from '../access'

export type RequestIntent = {
  quoteId: string; passengerCount: number; accessibilityNeeds: { wheelchairAccessible: boolean }
  riderNotes: string; preciseRouteEncryptedRef: string; riderId: string | null
}

export function requestIntent(args: { quoteId: string; passengerCount?: number | null; accessibilityNeeds?: unknown; riderNotes?: string | null; preciseRouteEncryptedRef?: string | null }, riderId: string | null): RequestIntent {
  const passengerCount = args.passengerCount ?? 1
  if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 50) throw new Error('Passenger count must be an integer from 1 to 50.')
  const needs = args.accessibilityNeeds ?? {}
  if (!needs || typeof needs !== 'object' || Array.isArray(needs) || Object.keys(needs).some(key => key !== 'wheelchairAccessible') || ('wheelchairAccessible' in needs && typeof needs.wheelchairAccessible !== 'boolean')) throw new Error('Accessibility needs must contain only a wheelchairAccessible boolean.')
  const riderNotes = args.riderNotes ?? ''
  const preciseRouteEncryptedRef = args.preciseRouteEncryptedRef ?? ''
  if (typeof riderNotes !== 'string' || riderNotes.length > 1000 || typeof preciseRouteEncryptedRef !== 'string' || preciseRouteEncryptedRef.length > 1000) throw new Error('Request notes or route reference is invalid.')
  return { quoteId: args.quoteId, passengerCount, accessibilityNeeds: { wheelchairAccessible: (needs as { wheelchairAccessible?: boolean }).wheelchairAccessible === true }, riderNotes, preciseRouteEncryptedRef, riderId }
}

export function requestIntentHash(intent: RequestIntent) {
  return createHash('sha256').update(JSON.stringify(intent)).digest('hex')
}

export function receiptBinding(quote: { id: string; publicId: string; guestProofHash: string | null }, fleetId: string, intent: RequestIntent) {
  return { version: 2, quoteId: quote.id, quotePublicId: quote.publicId, fleetId, riderId: intent.riderId, intentHash: requestIntentHash(intent) }
}

export function recoverRequestReceipt(request: { id: string; requestNumber: string; status: string | null; guestProofHash: string | null; guestProofExpiresAt: Date | null; quoteSnapshot: unknown; riderId: string | null; fleetId: string | null }, quote: { id: string; publicId: string; guestProofHash: string | null }, intent: RequestIntent, quoteProof: string) {
  const binding = (request.quoteSnapshot as { _requestReceipt?: ReturnType<typeof receiptBinding> } | null)?._requestReceipt
  if (!binding || binding.version !== 2 || binding.quoteId !== quote.id || binding.quotePublicId !== quote.publicId || binding.fleetId !== request.fleetId || binding.riderId !== request.riderId || binding.intentHash !== requestIntentHash(intent) || !request.guestProofHash || !request.guestProofExpiresAt || request.guestProofExpiresAt.getTime() <= Date.now()) throw new Error('Original request receipt cannot be recovered with this intent; use the saved receipt or the owning account.')
  const proof = createRecoverableRequestProof(request.id, request.requestNumber, request.guestProofExpiresAt, quoteProof)
  if (!verifyOwnershipProof(proof.token, 'request', request.requestNumber, request.guestProofHash)) throw new Error('Original request receipt is revoked or unavailable; use the owning account.')
  return { requestId: request.id, requestNumber: request.requestNumber, status: request.status, requestProof: proof.token, replayed: true }
}

export function riderSessionId(session: { itemId?: string; listKey?: string; apiKeyScopes?: string[] } | undefined): string | null {
  return humanSessionId(session as Session | undefined)
}

export function ownsRequest(request: { riderId: string | null; requestNumber: string; guestProofHash: string | null; guestProofExpiresAt: Date | string | null }, session: Parameters<typeof riderSessionId>[0], proof?: string | null) {
  if (session && !riderSessionId(session)) return false
  const actorId = riderSessionId(session)
  if (request.riderId) return Boolean(actorId && request.riderId === actorId)
  return Boolean(proof && request.guestProofHash && request.guestProofExpiresAt && new Date(request.guestProofExpiresAt).getTime() > Date.now() && verifyOwnershipProof(proof, 'request', request.requestNumber, request.guestProofHash))
}
