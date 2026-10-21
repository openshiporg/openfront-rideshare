'use client'

import { RequestCancellation } from '../components/RequestCancellation'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FleetBrand, type PublicFleetBrand } from '../components/FleetBrand'
import { Button } from '@/components/ui/button'
import { parseRiderReceipt, receiptStorageKey, riderStatusHref, type RiderReceipt } from '../domain/riderReceiptStorage'

type RequestSummary = { fleetBrand: PublicFleetBrand | null; requestId: string; requestNumber: string; status: string; requestedFor: string | null; pickupLabel: string | null; dropoffLabel: string | null; handoffState: string; createdAt: string; trip: { confirmationCode: string; status: string } | null }

export default function RiderAccountPage() {
  const [items, setItems] = useState<RequestSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [receipt, setReceipt] = useState<RiderReceipt | null>(null)
  useEffect(() => {
    try { setReceipt(parseRiderReceipt(sessionStorage.getItem(receiptStorageKey))) } catch { /* No private data is read from a malformed receipt. */ }
  }, [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLoading(true); setError(false); setItems([]); setNextCursor(null)
    async function load() {
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ query: `query MyRequests($cursor: ID) { myRideshareRequests(cursor: $cursor) { nextCursor items { fleetBrand requestId requestNumber status requestedFor pickupLabel dropoffLabel handoffState createdAt trip { confirmationCode status } } } }`, variables: { cursor } }),
        })
        if (!response.ok) throw new Error('Unavailable')
        const payload = await response.json()
        if (payload.errors?.length || !Array.isArray(payload.data?.myRideshareRequests?.items)) throw new Error('Unavailable')
        if (active) { setItems(payload.data.myRideshareRequests.items); setNextCursor(payload.data.myRideshareRequests.nextCursor) }
      } catch { if (active && !controller.signal.aborted) setError(true) }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false; controller.abort() }
  }, [cursor, retry])
  return <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-50"><div className="mx-auto max-w-3xl">
    <div className="flex flex-wrap items-center justify-between gap-4"><FleetBrand /><Link href="/book" className="text-sm text-zinc-400">Request a ride</Link></div>
    <Link href="/account" className="mt-6 inline-block text-sm underline">Account / sign out</Link><h1 className="mt-14 text-4xl font-semibold">Your requests and rides</h1><p className="mt-2 text-zinc-400">Your requests, assignments and trip history. A request receipt does not confirm a driver or payment.</p>
    {receipt && <Link href="/book" className="mt-5 block rounded-xl border border-zinc-800 p-4 text-sm text-lime-200">Resume this tab’s private receipt · {receipt.requestNumber}</Link>}
    <div className="mt-8 space-y-3" aria-live="polite">
      {loading ? <p role="status">Loading your ride history…</p> : error ? <div role="alert"><p className="text-amber-300">Account history is unavailable. Sign in to your rider account or retry.</p><Link href="/account/signin" className="mt-3 inline-block underline">Sign in</Link><Button type="button" variant="outline" className="ml-3" onClick={() => setRetry(value => value + 1)}>Retry history</Button></div> : !items.length ? <p role="status" className="rounded-xl border border-dashed border-zinc-800 p-8">No requests on this account history page. Guest requests use their private saved receipt and are not claimed by signing in.</p> : items.map(item => <article key={item.requestId} className="min-w-0 break-words rounded-xl border border-zinc-800 bg-zinc-900 p-5"><FleetBrand fleet={item.fleetBrand} /><h2 className="mt-3 font-semibold">{item.requestNumber}</h2><p className="mt-2 text-sm">{item.pickupLabel} → {item.dropoffLabel}</p><p className="mt-2 text-sm text-lime-200">Request: {item.status.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-zinc-400">{new Date(item.requestedFor || item.createdAt).toLocaleString()}</p>{item.handoffState === 'unavailable' ? <p className="mt-3 text-amber-300">Assignment receipt unavailable; source reconciliation is required.</p> : item.trip ? <div className="mt-3"><Link href={riderStatusHref(item.trip.confirmationCode, item.requestId)} className="text-sm underline">{item.trip.confirmationCode} · {item.trip.status.replaceAll('_', ' ')} · status and history</Link>{item.handoffState === 'reassignment_pending' && <p className="mt-2 text-sm text-amber-300">Previous assignment cancelled; matching again.</p>}</div> : <p className="mt-3 text-sm text-zinc-400">No trip has been assigned.</p>}<RequestCancellation requestId={item.requestId} status={item.status} onAcknowledged={() => setRetry(value => value + 1)} /></article>)}
    </div><nav aria-label="Ride history pages" className="mt-6 flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={loading} onClick={() => { setCursor(null); setRetry(value => value + 1) }}>Latest / refresh</Button>{nextCursor && <Button type="button" variant="outline" disabled={loading} onClick={() => setCursor(nextCursor)}>Older requests</Button>}</nav>
  </div></main>
}
