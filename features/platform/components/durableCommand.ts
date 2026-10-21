'use client'

import { useEffect, useRef, useState } from 'react'

export type CommandIntent = { version: 1; actorId: string; resource: string; purpose: 'offer' | 'transition' | 'cancel'; key: string; body: Record<string, unknown>; phase: 'pending' | 'resolved'; receipt?: string }
export const commandPrefix = 'openfront-rideshare-command-v1:'
export const commandStorageKey = (actorId: string, resource: string) => `${commandPrefix}${encodeURIComponent(actorId)}:${encodeURIComponent(resource)}`
export function readCommand(raw: string | null, actorId: string, resource: string): CommandIntent | null {
  if (!raw) return null
  if (raw.length > 16_384) throw new Error('Saved command is unreadable.')
  const value = JSON.parse(raw)
  if (value?.version !== 1 || value.actorId !== actorId || value.resource !== resource || !['offer','transition','cancel'].includes(value.purpose) || !['pending','resolved'].includes(value.phase) || typeof value.key !== 'string' || value.key.length < 12 || value.key.length > 200 || !value.body || typeof value.body !== 'object' || Array.isArray(value.body)) throw new Error('Saved command is unreadable.')
  return value
}
function persist(storage: Storage, key: string, intent: CommandIntent) {
  const serialized = JSON.stringify(intent)
  storage.setItem(key, serialized)
  if (storage.getItem(key) !== serialized) throw new Error('Original command cannot be saved. No command was sent.')
}
const transitionStatuses: Record<string,string> = { start_en_route: 'driver_en_route', arrive: 'driver_arrived', start_trip: 'in_progress', complete: 'completed', no_show: 'no_show' }
export async function sendSavedCommand(intent: CommandIntent): Promise<string> {
  const definitions = {
    offer: `mutation DurableOffer($requestId: ID!, $driverId: ID!, $vehicleId: ID!, $idempotencyKey: String!, $expectedActorId: ID!) { offerRideToDriver(requestId: $requestId, driverId: $driverId, vehicleId: $vehicleId, idempotencyKey: $idempotencyKey, expectedActorId: $expectedActorId) { id status expiresAt request { id } driver { id } vehicle { id } } }`,
    transition: `mutation DurableTransition($tripId: ID!, $action: String!, $idempotencyKey: String!, $expectedAcceptedOfferId: ID!, $expectedActorId: ID!) { transitionTrip(tripId: $tripId, action: $action, idempotencyKey: $idempotencyKey, expectedAcceptedOfferId: $expectedAcceptedOfferId, expectedActorId: $expectedActorId) { id status } }`,
    cancel: `mutation DurableCancel($tripId: ID!, $reasonCode: String!, $reason: String!, $reassign: Boolean!, $idempotencyKey: String!, $expectedActorId: ID!, $expectedAcceptedOfferId: ID!, $expectedUpdatedAt: DateTime!, $expectedFeeMinor: Int!, $expectedCurrencyCode: String!) { cancelRide(tripId: $tripId, reasonCode: $reasonCode, reason: $reason, reassign: $reassign, idempotencyKey: $idempotencyKey, expectedActorId: $expectedActorId, expectedAcceptedOfferId: $expectedAcceptedOfferId, expectedUpdatedAt: $expectedUpdatedAt, expectedFeeMinor: $expectedFeeMinor, expectedCurrencyCode: $expectedCurrencyCode) { id feeMinor currencyCode refundRequired trip { id } } }`,
  }
  const response = await fetch('/api/graphql', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12_000), body: JSON.stringify({ query: definitions[intent.purpose], variables: { ...intent.body, idempotencyKey: intent.key, expectedActorId: intent.actorId } }) })
  const payload = await response.json()
  if (!response.ok || payload.errors?.length || !payload.data) throw new Error('Command outcome is unconfirmed. Recover the original command.')
  if (intent.purpose === 'offer') {
    const row = payload.data.offerRideToDriver
    if (!row?.id || !['offered','accepted','declined','expired','withdrawn'].includes(row.status) || !Number.isFinite(Date.parse(row.expiresAt)) || row.request?.id !== intent.body.requestId || row.driver?.id !== intent.body.driverId || row.vehicle?.id !== intent.body.vehicleId) throw new Error('Offer receipt is incomplete.')
    return `Offer ${row.id} recorded.`
  }
  if (intent.purpose === 'transition') {
    const row = payload.data.transitionTrip
    if (row?.id !== intent.body.tripId || row.status !== transitionStatuses[String(intent.body.action)]) throw new Error('Trip receipt is incomplete.')
    return `Trip update acknowledged: ${row.status.replaceAll('_',' ')}.`
  }
  const row = payload.data.cancelRide
  if (!row?.id || row.trip?.id !== intent.body.tripId || row.feeMinor !== intent.body.expectedFeeMinor || row.currencyCode !== intent.body.expectedCurrencyCode || !['no','partial','full','manual_review'].includes(row.refundRequired)) throw new Error('Cancellation receipt is incomplete.')
  return `Cancellation ${row.id} recorded. Fee ${row.feeMinor} ${row.currencyCode} minor units; refund ${row.refundRequired.replaceAll('_',' ')}. This does not confirm money movement.`
}

export async function executeDurableCommand(actorId: string, resource: string, proposed?: { purpose: CommandIntent['purpose']; body: Record<string,unknown> }) {
  if (!actorId || !resource || !navigator.locks) throw new Error('Durable command storage and browser locking are required. No command was sent.')
  const key = commandStorageKey(actorId, resource)
  return navigator.locks.request(key, async () => {
    let intent = readCommand(localStorage.getItem(key), actorId, resource)
    if (intent?.phase === 'pending') {
      if (proposed && (intent.purpose !== proposed.purpose || JSON.stringify(intent.body) !== JSON.stringify(proposed.body))) throw new Error('Recover the original command before changing the action.')
    } else {
      if (!proposed) throw new Error('No unresolved command is saved.')
      if (intent?.phase === 'resolved' && intent.purpose === proposed.purpose && JSON.stringify(intent.body) === JSON.stringify(proposed.body)) return intent
      intent = { version: 1, actorId, resource, purpose: proposed.purpose, body: proposed.body, key: crypto.randomUUID(), phase: 'pending' }
      persist(localStorage, key, intent)
    }
    const receipt = await sendSavedCommand(intent)
    const resolved: CommandIntent = { ...intent, phase: 'resolved', receipt }
    // Archive/readback BEFORE freeing the resource's original intent.
    persist(localStorage, `${key}:history:${intent.key}`, resolved)
    persist(localStorage, key, resolved)
    return resolved
  })
}

export function useDurableCommand(actorId: string, resource: string) {
  const [intent, setIntent] = useState<CommandIntent | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const flight = useRef(false)
  function load() {
    try { setIntent(readCommand(localStorage.getItem(commandStorageKey(actorId, resource)), actorId, resource)); setReady(Boolean(actorId)) }
    catch { setReady(false); setError('Original command storage is unreadable. Reconciliation is required.') }
  }
  useEffect(() => { load(); window.addEventListener('storage', load); return () => window.removeEventListener('storage', load) }, [actorId, resource])
  async function execute(proposed?: { purpose: CommandIntent['purpose']; body: Record<string,unknown> }) {
    if (flight.current || !ready) return
    flight.current = true; setBusy(true); setError('')
    try { setIntent(await executeDurableCommand(actorId, resource, proposed)) }
    catch { setError('Outcome is unconfirmed. Recover the saved original command; do not send another action.') }
    finally { load(); flight.current = false; setBusy(false) }
  }
  return { intent, ready, busy, error, execute, pending: intent?.phase === 'pending' }
}
