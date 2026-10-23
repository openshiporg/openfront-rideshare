'use client'

import { RequestCancellation } from '../components/RequestCancellation'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, CalendarClock } from 'lucide-react'
import { type PublicFleetBrand } from '../components/FleetBrand'
import { RiderShell } from '../components/RiderShell'
import { RiderButton, RiderButtonLink, RiderTrack } from '../components/RiderPills'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { TRIP_STAGES, statusLabel, statusTone, tripStageIndex } from '@/features/platform/lib/statusTone'
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
  const live = (item: RequestSummary) => ['requested', 'matching'].includes(item.status) || (item.trip ? tripStageIndex(item.trip.status) >= 0 && item.trip.status !== 'completed' : false)
  return <RiderShell>
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em] [font-stretch:125%] sm:text-5xl">My rides</h1>
        <RiderButtonLink href="/book" tone="signal">Book a ride</RiderButtonLink>
      </div>
      {receipt && <Link href="/book" className="flex items-center justify-between gap-3 rounded-2xl bg-signal/10 p-4 text-sm ring-1 ring-inset ring-signal/30"><span className="flex min-w-0 items-center gap-2"><StatusDot tone="amber" pulse /><span className="truncate">Current request <span className="font-mono font-semibold">{receipt.requestNumber}</span></span></span><ArrowUpRight className="size-4 shrink-0 text-signal" aria-hidden="true" /></Link>}
      <div aria-live="polite">
        {loading ? <ul className="space-y-3" aria-label="Loading rides">{[0, 1, 2].map(index => <li key={index} className="h-32 animate-pulse rounded-[1.5rem] bg-kerb motion-reduce:animate-none" />)}</ul>
          : error ? <div role="alert" className="space-y-4 rounded-[1.5rem] border border-border bg-kerb p-5"><p className="text-sm text-amber-300">Sign in to see your rides.</p><RiderTrack><RiderButtonLink href="/account/signin" tone="signal">Sign in</RiderButtonLink><RiderButton onClick={() => setRetry(value => value + 1)}>Try again</RiderButton></RiderTrack></div>
          : !items.length ? <p role="status" className="rounded-[1.5rem] border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">No rides yet</p>
          : <ul className="space-y-3">{items.map(item => { const state = item.trip?.status || item.status; const stage = tripStageIndex(item.trip?.status); return <li key={item.requestId} className="min-w-0 space-y-4 rounded-[1.5rem] border border-border bg-kerb p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <StatusTitle as="h2" tone={statusTone(state)} pulse={live(item)} status={statusLabel(state)} className="font-mono text-sm font-semibold">{item.trip?.confirmationCode || item.requestNumber}</StatusTitle>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarClock className="size-3.5" aria-hidden="true" />{new Date(item.requestedFor || item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
            <ol className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-x-3 text-sm" aria-label="Route"><li className="contents"><span className="mt-1.5 size-2.5 rounded-full border-2 border-foreground" aria-hidden="true" /><span className="[overflow-wrap:anywhere]">{item.pickupLabel || 'Pickup'}</span></li><li className="contents"><span className="mt-1.5 size-2.5 rounded-[2px] bg-signal" aria-hidden="true" /><span className="[overflow-wrap:anywhere]">{item.dropoffLabel || 'Destination'}</span></li></ol>
            {stage >= 0 && <ol className="grid grid-cols-5 gap-1" aria-hidden="true">{TRIP_STAGES.map((value, index) => <li key={value} className={`h-1 rounded-full ${index <= stage ? 'bg-signal' : 'bg-lane'}`} />)}</ol>}
            {item.handoffState === 'unavailable' ? <p className="text-sm text-amber-300">Assignment details unavailable</p> : item.handoffState === 'reassignment_pending' && <p className="text-sm text-amber-300">Driver cancelled. Finding another driver.</p>}
            <div className="flex flex-wrap items-center gap-2">
              {item.trip && item.handoffState !== 'unavailable' && <RiderButtonLink href={riderStatusHref(item.trip.confirmationCode, item.requestId)}>Trip details<ArrowUpRight className="size-4" aria-hidden="true" /></RiderButtonLink>}
              <RequestCancellation requestId={item.requestId} status={item.status} onAcknowledged={() => setRetry(value => value + 1)} />
            </div>
            <p className="flex flex-wrap gap-x-2 text-[0.6875rem] text-muted-foreground">{item.fleetBrand?.name && <span>{item.fleetBrand.name}</span>}<span className="font-mono">{item.requestNumber}</span></p>
          </li> })}</ul>}
      </div>
      {!error && (cursor || nextCursor) && <nav aria-label="Ride history pages"><RiderTrack><RiderButton disabled={loading} onClick={() => { setCursor(null); setRetry(value => value + 1) }}>Latest</RiderButton>{nextCursor && <RiderButton disabled={loading} onClick={() => setCursor(nextCursor)}>Older rides</RiderButton>}</RiderTrack></nav>}
    </div>
  </RiderShell>
}
