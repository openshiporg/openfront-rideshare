'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TripOperatorActions } from '@/features/platform/trips/components/TripOperatorActions'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { isOfferLeaseActive } from '@/features/keystone/domain/offerLease'
import { listOfferResponseIntents, offerResponseStorageKey, acknowledgeOfferResponse, persistOfferResponseIntent, readOfferResponseIntent, type OfferResponseIntent } from '../domain/offerResponseIntent'

type ResponsePayload = { respondToRideOffer?: { accepted: boolean; requestId: string; tripId: string | null; confirmationCode: string | null } }
const responseMutation = `mutation Respond($offerId: ID!, $response: String!, $idempotencyKey: String!) { respondToRideOffer(offerId: $offerId, response: $response, idempotencyKey: $idempotencyKey) { accepted requestId tripId confirmationCode } }`

function responseReceipt(result: ResponsePayload, intent: OfferResponseIntent) {
  const outcome = result?.respondToRideOffer
  if (typeof outcome?.accepted !== 'boolean' || !outcome.requestId || (outcome.accepted && (intent.response !== 'accept' || !outcome.tripId || !outcome.confirmationCode)) || (!outcome.accepted && (outcome.tripId !== null || outcome.confirmationCode !== null))) throw new Error('Source response is incomplete; recover the same command.')
  return outcome.accepted ? `Assigned · ${outcome.confirmationCode}` : 'Declined'
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
      setError('Offer expired. Refresh to see current offers.')
      return
    }
    if (response === 'accept' && !canAccept) {
      setError('Profile not active; accept is off.')
      return
    }
    const mapKey = `${offerId}:${response}`
    const idempotencyKey = pendingRef.current?.idempotencyKey || keys.current.get(mapKey) || commandKey()
    const intent = { offerId, response, idempotencyKey }
    try { persistOfferResponseIntent(sessionStorage, intent) } catch { setError('This browser could not save the response. Nothing was sent.'); return }
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
  return <div className="space-y-2">
    <ActionTrack label="Offer response" className="grid w-full grid-cols-2">
      <TrackButton size="lg" disabled={Boolean(receipt) || busy || (pending ? pending.response !== 'decline' : leaseState !== 'active')} onClick={() => void respond('decline')}>{pending?.response === 'decline' ? 'Retry decline' : 'Decline'}</TrackButton>
      <TrackButton tone="primary" size="lg" disabled={Boolean(receipt) || busy || (pending ? pending.response !== 'accept' : leaseState !== 'active') || !canAccept} onClick={() => void respond('accept')}>{busy ? 'Sending…' : pending?.response === 'accept' ? 'Retry accept' : 'Accept'}</TrackButton>
    </ActionTrack>
    {pending && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{pending.response === 'accept' ? 'Accept' : 'Decline'} unconfirmed; retry sends the same response</p>}
    {receipt && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">{receipt}</p>}
    {leaseState === 'checking' && <p role="status" className="text-xs text-muted-foreground">Checking offer…</p>}
    {leaseState === 'expired' && !pending && !receipt && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">Offer expired</p>}
    {leaseState === 'active' && !canAccept && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">Profile not active; accept is off</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
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
      setError(saved.unreadable ? 'Some saved responses are unreadable.' : '')
      setPage(0)
    } catch { setError('Saved responses unavailable.') }
  }
  useEffect(() => { load() }, [])
  async function recover(intent: OfferResponseIntent) {
    if (busy || !enabled) return
    // Explicit click only: no new key, opposite response, expiry extension or
    // inferred success. Source rechecks current driver and request assignment.
    try { persistOfferResponseIntent(sessionStorage, intent) } catch { setError('This browser could not save the response. Nothing was sent.'); return }
    setBusy(true); setMessage(''); setError('')
    try {
      const result = await mutate<ResponsePayload>(responseMutation, intent)
      const acknowledgement = responseReceipt(result, intent)
      acknowledgeOfferResponse(sessionStorage, intent, acknowledgement)
      setMessage(acknowledgement); load()
      router.refresh()
    } catch { setError('Still unconfirmed. The offer may have expired or been reassigned.') }
    finally { setBusy(false) }
  }
  if (!commands.length && !error && !message) return null
  return <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4" aria-live="polite" aria-label="Unconfirmed offer responses">
    <div className="flex flex-wrap items-center justify-between gap-2"><StatusTitle as="h2" tone="amber" status={`${commands.length}`} className="text-sm font-semibold">Unconfirmed responses</StatusTitle><ActionTrack><TrackButton disabled={busy} onClick={load}>Reload</TrackButton></ActionTrack></div>
    {commands.length > 0 && <ul className="divide-y rounded-lg border bg-background">{commands.slice(page * 25, (page + 1) * 25).map(intent => <li key={intent.offerId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><span className="min-w-0 break-all"><span className="font-medium capitalize">{intent.response}</span> <span className="font-mono text-xs text-muted-foreground">{intent.offerId}</span></span><ActionTrack><TrackButton tone="primary" disabled={busy || !enabled} onClick={() => void recover(intent)}>Recover</TrackButton></ActionTrack></li>)}</ul>}
    {commands.length > 25 && <ActionTrack label="Response pages"><TrackButton disabled={busy || page === 0} onClick={() => setPage(value => value - 1)}>Previous</TrackButton><span className="px-2 text-xs tabular-nums">Page {page + 1}</span><TrackButton disabled={busy || (page + 1) * 25 >= commands.length} onClick={() => setPage(value => value + 1)}>Next</TrackButton></ActionTrack>}
    {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>
}

/** Seconds left on an offer lease, ticking once a second. */
export function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const left = now === null ? null : Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000))
  if (left === null || !Number.isFinite(left)) return <span className="tabular-nums">{new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
  return <span className={`tabular-nums ${left <= 15 ? 'text-red-600 dark:text-red-400' : ''}`} role="timer" aria-label={`${left} seconds left`}>{left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Expired'}</span>
}

export function DriverTripActions({ tripId, status, actorId, acceptedOfferId }: { tripId: string; status: string; actorId: string; acceptedOfferId: string }) {
  return <TripOperatorActions tripId={tripId} status={status} actorId={actorId} acceptedOfferId={acceptedOfferId} actionsEnabled driverMode />
}
