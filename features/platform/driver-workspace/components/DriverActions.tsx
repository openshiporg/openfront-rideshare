'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TripOperatorActions } from '@/features/platform/trips/components/TripOperatorActions'
import { Button } from '@/components/ui/button'
import { isOfferLeaseActive } from '@/features/keystone/domain/offerLease'
import { listOfferResponseIntents, offerResponseStorageKey, acknowledgeOfferResponse, persistOfferResponseIntent, readOfferResponseIntent, type OfferResponseIntent } from '../domain/offerResponseIntent'

type ResponsePayload = { respondToRideOffer?: { accepted: boolean; requestId: string; tripId: string | null; confirmationCode: string | null } }
const responseMutation = `mutation Respond($offerId: ID!, $response: String!, $idempotencyKey: String!) { respondToRideOffer(offerId: $offerId, response: $response, idempotencyKey: $idempotencyKey) { accepted requestId tripId confirmationCode } }`

function responseReceipt(result: ResponsePayload, intent: OfferResponseIntent) {
  const outcome = result?.respondToRideOffer
  if (typeof outcome?.accepted !== 'boolean' || !outcome.requestId || (outcome.accepted && (intent.response !== 'accept' || !outcome.tripId || !outcome.confirmationCode)) || (!outcome.accepted && (outcome.tripId !== null || outcome.confirmationCode !== null))) throw new Error('Source response is incomplete; recover the same command.')
  return outcome.accepted ? `Assignment ${outcome.confirmationCode}. Rider notification is not confirmed.` : 'No assignment was accepted for this response.'
}

async function mutate<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })
  const payload = await response.json()
  if (!response.ok || payload.errors?.length) throw new Error('The command outcome is unconfirmed. Recover the original response.')
  return payload.data as T
}

function commandKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export function DriverOfferActions({ offerId, expiresAt, canAccept }: { offerId: string; expiresAt: string; canAccept: boolean }) {
  const router = useRouter()
  const keys = useRef(new Map<string, string>())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pendingRef = useRef<OfferResponseIntent | null>(null)
  const [pending, setPending] = useState<OfferResponseIntent | null>(null)
  const [receipt, setReceipt] = useState('')
  useEffect(() => {
    try {
      const saved = readOfferResponseIntent(sessionStorage.getItem(offerResponseStorageKey(offerId)), offerId)
      pendingRef.current = saved; setPending(saved)
    } catch { setError('Saved offer response cannot be read. Reconcile the original command before acting.'); setBusy(true) }
  }, [offerId])
  const [leaseState, setLeaseState] = useState<'checking' | 'active' | 'expired'>('checking')
  useEffect(() => {
    const deadline = Date.parse(expiresAt)
    if (!isOfferLeaseActive(expiresAt, new Date())) {
      setLeaseState('expired')
      return
    }
    setLeaseState('active')
    const timeout = window.setTimeout(() => setLeaseState('expired'), deadline - Date.now())
    return () => window.clearTimeout(timeout)
  }, [expiresAt])
  async function respond(response: 'accept' | 'decline') {
    if (busy || (pendingRef.current && pendingRef.current.response !== response)) return
    if (!pendingRef.current && !isOfferLeaseActive(expiresAt, new Date())) {
      setLeaseState('expired')
      setError('This offer lease has expired. Refresh the workspace before taking another action.')
      return
    }
    if (response === 'accept' && !canAccept) {
      setError('Offer acceptance is disabled because the driver profile is not active.')
      return
    }
    const mapKey = `${offerId}:${response}`
    const idempotencyKey = pendingRef.current?.idempotencyKey || keys.current.get(mapKey) || commandKey()
    const intent = { offerId, response, idempotencyKey }
    try { persistOfferResponseIntent(sessionStorage, intent) } catch { setError('Original response cannot be durably saved. No command was sent.'); return }
    pendingRef.current = intent; setPending(intent)
    keys.current.set(mapKey, idempotencyKey)
    setBusy(true)
    setError('')
    try {
      const result = await mutate<ResponsePayload>(responseMutation, intent)
      const acknowledgement = responseReceipt(result, intent)
      acknowledgeOfferResponse(sessionStorage, intent, acknowledgement)
      pendingRef.current = null; setPending(null); setReceipt(acknowledgement)
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Offer response failed. Retry with the same command key.')
    } finally { setBusy(false) }
  }
  return <div className="mt-4 space-y-2"><div className="flex flex-wrap gap-2"><Button type="button" disabled={Boolean(receipt) || busy || (pending ? pending.response !== 'accept' : leaseState !== 'active') || !canAccept} onClick={() => void respond('accept')}>{busy ? 'Sending…' : 'Accept'}</Button><Button type="button" disabled={Boolean(receipt) || busy || (pending ? pending.response !== 'decline' : leaseState !== 'active')} variant="outline" onClick={() => void respond('decline')}>Decline</Button></div>{pending && <p role="status" className="text-xs text-amber-800 dark:text-amber-300">An original {pending.response} command is saved across reload. Retry only that response with its original key; expired offers are checked by the source and are never newly accepted on retry.</p>}{receipt && <p role="status" className="text-xs text-emerald-800 dark:text-emerald-200">{receipt}</p>}{leaseState === 'checking' && <p role="status" className="text-xs text-muted-foreground">Checking offer expiry before enabling actions…</p>}{leaseState === 'expired' && <p role="status" className="text-xs text-amber-800 dark:text-amber-300">Offer lease expired. Refresh the workspace; no response was sent.</p>}{leaseState === 'active' && !canAccept && <p role="status" className="text-xs text-amber-800 dark:text-amber-300">Acceptance is disabled because the driver profile is not active; declining remains available.</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>
}

export function DriverResponseRecovery({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [commands, setCommands] = useState<OfferResponseIntent[]>([])
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  function load() {
    try {
      const saved = listOfferResponseIntents(sessionStorage)
      setCommands(saved.commands)
      setError(saved.unreadable ? 'Some saved commands are unreadable. Reconcile those outcomes before starting another response.' : '')
      setPage(0)
    } catch { setError('Saved driver commands are unavailable; unknown outcomes require source reconciliation.') }
  }
  useEffect(() => { load() }, [])
  async function recover(intent: OfferResponseIntent) {
    if (busy || !enabled) return
    // Explicit click only: no new key, opposite response, expiry extension or
    // inferred success. Source rechecks current driver and request assignment.
    try { persistOfferResponseIntent(sessionStorage, intent) } catch { setError('Original command cannot be preserved; no retry was sent.'); return }
    setBusy(true); setMessage(''); setError('')
    try {
      const result = await mutate<ResponsePayload>(responseMutation, intent)
      const acknowledgement = responseReceipt(result, intent)
      acknowledgeOfferResponse(sessionStorage, intent, acknowledgement)
      setMessage(acknowledgement); load()
      router.refresh()
    } catch { setError('The original response cannot currently be recovered. It may have committed, expired, been cancelled/reassigned, or lost current driver authority. Do not substitute another response or key.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-3 rounded-xl border p-4" aria-live="polite"><h2 className="font-semibold">Saved offer response recovery</h2><p className="text-xs text-muted-foreground">Saved commands remain here when an offer leaves the active queue, including after a lost acknowledgement or reload. Only the exact original command is retried. Acknowledged responses leave this unresolved list after their receipts are retained.</p><Button type="button" variant="outline" size="sm" disabled={busy} onClick={load}>Refresh saved commands</Button>{commands.length ? <ul className="space-y-2">{commands.slice(page * 25, (page + 1) * 25).map(intent => <li key={intent.offerId} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Offer {intent.offerId} · original {intent.response}</span><Button type="button" variant="outline" size="sm" disabled={busy || !enabled} onClick={() => void recover(intent)}>Recover original response</Button></li>)}</ul> : <p className="text-sm text-muted-foreground">No saved offer response commands in this tab.</p>}{commands.length > 25 && <div className="flex items-center gap-3"><Button type="button" variant="outline" size="sm" disabled={busy || page === 0} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="text-xs">Page {page + 1}</span><Button type="button" variant="outline" size="sm" disabled={busy || (page + 1) * 25 >= commands.length} onClick={() => setPage(value => value + 1)}>Next</Button></div>}{message && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-200">{message}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</section>
}

export function DriverTripActions({ tripId, status, actorId, acceptedOfferId }: { tripId: string; status: string; actorId: string; acceptedOfferId: string }) {
  return <TripOperatorActions tripId={tripId} status={status} actorId={actorId} acceptedOfferId={acceptedOfferId} actionsEnabled driverMode />
}
