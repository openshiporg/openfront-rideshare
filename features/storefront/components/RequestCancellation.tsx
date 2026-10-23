'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RiderButton, RiderTrack } from './RiderPills'
import { statusLabel } from '@/features/platform/lib/statusTone'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Intent = { v: 1; requestId: string; requestProof: string | null; actorId: string; key: string; phase: 'pending' | 'resolved' }
type Preview = { requestId: string; actorId: string; status: string }
const storageKey = (id: string) => `openfront-rideshare-request-cancel-v1:${id}`
function readIntent(raw: string | null, id: string): Intent | null {
  if (!raw) return null
  if (raw.length > 8192) throw new Error('Original cancellation is unreadable.')
  const value = JSON.parse(raw)
  if (value?.v !== 1 || value.requestId !== id || typeof value.actorId !== 'string' || !value.actorId || value.actorId.length > 200 || typeof value.key !== 'string' || value.key.length < 12 || value.key.length > 200 || !['pending','resolved'].includes(value.phase) || (value.requestProof !== null && (typeof value.requestProof !== 'string' || value.requestProof.length > 4096))) throw new Error('Original cancellation is unreadable.')
  return value
}
function saveIntent(key: string, value: Intent) {
  const serialized = JSON.stringify(value)
  sessionStorage.setItem(key, serialized)
  if (sessionStorage.getItem(key) !== serialized) throw new Error('Original cancellation could not be retained.')
}

/** The original guest proof stays in the same tab-private storage as its
 * receipt. This journal never places it in a URL or a cross-account log. */
export function RequestCancellation({ requestId, requestProof = null, status, onAcknowledged }: { requestId: string; requestProof?: string | null; status: string; onAcknowledged?: () => void }) {
  const router = useRouter()
  const [intent, setIntent] = useState<Intent | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const flight = useRef(false)
  useEffect(() => {
    try { setIntent(readIntent(sessionStorage.getItem(storageKey(requestId)), requestId)); setReady(true) }
    catch { setReady(false); setError('Saved cancellation is unreadable.') }
  }, [requestId])
  async function review() {
    if (flight.current || !ready || intent?.phase === 'pending') return
    flight.current = true; setBusy(true); setOpen(true); setPreview(null); setError('')
    try {
      const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000), body: JSON.stringify({ query: `query RequestCancellationReview($id: ID!, $proof: String) { riderRequestCancellationPreview(requestId: $id, requestProof: $proof) }`, variables: { id: requestId, proof: requestProof } }) })
      const payload = await response.json()
      const result = payload.data?.riderRequestCancellationPreview
      if (!response.ok || payload.errors?.length || result?.requestId !== requestId || typeof result.actorId !== 'string' || !result.actorId || !['requested','matching'].includes(result.status)) throw new Error()
      setPreview(result)
    } catch { setError('This request can no longer be cancelled here. It may already have a driver.') }
    finally { flight.current = false; setBusy(false) }
  }
  async function send(recover: boolean) {
    if (flight.current || !ready) return
    flight.current = true; setBusy(true); setError('')
    try {
      let original = readIntent(sessionStorage.getItem(storageKey(requestId)), requestId)
      if (recover && original?.phase !== 'pending') throw new Error()
      if (!original) {
        if (!preview || recover) throw new Error()
        original = { v: 1, requestId, requestProof, actorId: preview.actorId, key: crypto.randomUUID(), phase: 'pending' }
        saveIntent(storageKey(requestId), original)
      }
      if (original.phase === 'resolved') return
      setIntent(original)
      const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(12_000), body: JSON.stringify({ query: `mutation CancelOriginalRequest($id: ID!, $proof: String, $key: String!, $actor: ID!) { cancelRideRequest(requestId: $id, requestProof: $proof, idempotencyKey: $key, expectedActorId: $actor) { requestId status replayed alreadyCancelled } }`, variables: { id: original.requestId, proof: original.requestProof, key: original.key, actor: original.actorId } }) })
      const payload = await response.json()
      const receipt = payload.data?.cancelRideRequest
      if (!response.ok || payload.errors?.length || receipt?.requestId !== original.requestId || receipt.status !== 'cancelled' || typeof receipt.replayed !== 'boolean' || typeof receipt.alreadyCancelled !== 'boolean') throw new Error()
      const resolved: Intent = { ...original, phase: 'resolved' }
      saveIntent(`${storageKey(requestId)}:ack:${original.key}`, resolved)
      saveIntent(storageKey(requestId), resolved)
      setIntent(resolved); setOpen(false); onAcknowledged?.(); router.refresh()
    } catch { setError('Cancellation unconfirmed. Recover it.') }
    finally { flight.current = false; setBusy(false) }
  }
  const pending = intent?.phase === 'pending'
  const cancellable = ['requested','matching'].includes(status)
  if (!pending && intent?.phase !== 'resolved' && !cancellable && !error) return null
  return <div className="space-y-2" data-command-pending={pending || busy ? 'true' : undefined}>
    {pending ? <RiderTrack><RiderButton tone="danger" disabled={!ready || busy} onClick={() => void send(true)}>Recover cancellation</RiderButton></RiderTrack> : intent?.phase === 'resolved' ? <p role="status" className="text-sm text-muted-foreground">Request cancelled</p> : cancellable && <RiderTrack><RiderButton tone="danger" disabled={!ready || busy} onClick={() => void review()}>Cancel request</RiderButton></RiderTrack>}
    {error && !open && <p role="alert" className="text-sm text-[#ff8a7f]">{error}</p>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}><DialogContent className="rs dark rounded-3xl border-border"><DialogHeader><DialogTitle className="font-display text-xl font-bold [font-stretch:115%]">Cancel this request?</DialogTitle><DialogDescription>{preview ? `Currently ${statusLabel(preview.status).toLowerCase()}` : busy ? 'Checking…' : 'A driver may already be assigned'}</DialogDescription></DialogHeader>
      <RiderTrack className="w-full justify-end"><RiderButton tone="quiet" disabled={busy} onClick={() => setOpen(false)}>{pending ? 'Close' : 'Keep request'}</RiderButton>{pending ? <RiderButton tone="danger" disabled={busy} onClick={() => void send(true)}>Recover cancellation</RiderButton> : <RiderButton tone="danger" disabled={!preview || busy} onClick={() => void send(false)}>Cancel request</RiderButton>}</RiderTrack>
      {error && <p role="alert" className="text-sm text-[#ff8a7f]">{error}</p>}{pending && <p role="status" className="text-sm text-amber-300">Cancellation unconfirmed</p>}
    </DialogContent></Dialog>
  </div>
}
