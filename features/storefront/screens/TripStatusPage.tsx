'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, RefreshCw } from 'lucide-react'
import { type PublicFleetBrand } from '../components/FleetBrand'
import { RiderShell } from '../components/RiderShell'
import { RiderButton, RiderButtonLink, RiderTrack } from '../components/RiderPills'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { TRIP_STAGES, statusLabel, statusTone, tripStageIndex } from '@/features/platform/lib/statusTone'
import { RiderTripHistory } from '../components/RiderTripHistory'
import { TripRiderActions } from '../components/TripRiderActions'
import { storedReceipt } from '../domain/riderReceiptStorage'

type TripView = {
  id: string
  requestId: string
  fleetBrand: PublicFleetBrand | null
  confirmationCode: string
  status: string
  scheduledFor: string | null
  pickupLabel: string | null
  dropoffLabel: string | null
  historyTruncated: boolean
  events: Array<{ eventType: string; toStatus: string | null; occurredAt: string }>
}
type TripResponse = { data?: { publicRideshareTrip: TripView | null }; errors?: Array<{ message?: string }> }

export default function TripStatusPage({ confirmationCode, requestId }: { confirmationCode: string; requestId?: string }) {
  const [trip, setTrip] = useState<TripView | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setLoading(true)
    setUnavailable(false)
    setError(false)
    setTrip(null)

    async function loadTrip() {
      try {
        // Storage is optional for an owning account. An unreadable guest receipt
        // supplies no proof; the source still checks the signed-in owner itself.
        let receipt = null
        try { receipt = storedReceipt(sessionStorage, requestId) } catch { /* no guest authority */ }
        const matchingReceipt = receipt && (!requestId || receipt.requestId === requestId) ? receipt : null
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            query: `query Trip($code: String!, $requestId: ID, $proof: String) { publicRideshareTrip(confirmationCode: $code, requestId: $requestId, requestProof: $proof) { id requestId fleetBrand confirmationCode status scheduledFor pickupLabel dropoffLabel historyTruncated events { eventType toStatus occurredAt } } }`,
            variables: { code: confirmationCode, requestId: requestId || matchingReceipt?.requestId || null, proof: matchingReceipt?.requestProof || null },
          }),
        })
        if (!response.ok) throw new Error('Source request failed.')
        const payload = await response.json() as TripResponse
        if (payload.errors?.length) throw new Error('Source query failed.')
        if (!active) return
        const result = payload.data?.publicRideshareTrip || null
        setTrip(result)
        setUnavailable(!result)
      } catch {
        if (active && !controller.signal.aborted) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadTrip()
    return () => { active = false; controller.abort() }
  }, [confirmationCode, requestId, retry])

  const stage = tripStageIndex(trip?.status)
  return <RiderShell fleet={trip?.fleetBrand}>
    <div className="mx-auto max-w-2xl space-y-6" aria-live="polite">
      {loading ? <div className="space-y-4" role="status" aria-label="Loading trip"><div className="h-14 w-2/3 animate-pulse rounded-[6px] bg-kerb motion-reduce:animate-none" /><div className="h-64 animate-pulse rounded-[6px] bg-kerb motion-reduce:animate-none" /></div>
        : error ? <div role="alert" className="space-y-4 rounded-[6px] border border-border bg-kerb p-5"><p className="text-sm text-[#ff8a7f]">Trip status could not be loaded.</p><RiderTrack><RiderButton onClick={() => setRetry(value => value + 1)}>Try again</RiderButton></RiderTrack></div>
        : unavailable || !trip ? <div role="status" className="space-y-4 rounded-[6px] border border-border bg-kerb p-5"><h1 className="font-display text-2xl font-extrabold [font-stretch:120%]">Trip not available</h1><p className="text-sm text-muted-foreground">Sign in, or open this trip from the browser you booked it in.</p><RiderTrack><RiderButtonLink href="/account/signin" tone="signal">Sign in</RiderButtonLink><RiderButtonLink href="/book" tone="quiet">Book a ride</RiderButtonLink></RiderTrack></div>
        : <>
          <div className="space-y-2">
            <StatusTitle as="p" tone={statusTone(trip.status)} pulse={stage >= 0 && stage < 4} className="text-sm font-semibold text-muted-foreground">{statusLabel(trip.status)}</StatusTitle>
            <h1 className="font-mono text-4xl font-semibold tracking-tight sm:text-5xl">{trip.confirmationCode}</h1>
            {trip.scheduledFor && <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarClock className="size-4" aria-hidden="true" />Pickup {new Date(trip.scheduledFor).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}
          </div>
          <section aria-label="Trip" className="space-y-5 rounded-[6px] border border-border bg-kerb p-5">
            {stage >= 0 && <ol className="grid grid-cols-5 gap-1.5" aria-label="Progress">{TRIP_STAGES.map((value, index) => <li key={value} aria-current={index === stage ? 'step' : undefined} className="space-y-1.5"><span className={`block h-1.5 rounded-[4px] ${index <= stage ? 'bg-signal' : 'bg-lane'}`} /><span className={`block truncate text-[0.625rem] sm:text-xs ${index === stage ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{statusLabel(value).replace('Driver ', '')}</span></li>)}</ol>}
            <ol className="grid grid-cols-[0.875rem_minmax(0,1fr)] gap-x-3 gap-y-0 text-base font-medium" aria-label="Route">
              <li className="contents"><span className="relative flex justify-center pt-1.5" aria-hidden="true"><span className="size-3 rounded-[4px] border-[3px] border-foreground" /><span className="absolute left-1/2 top-6 bottom-0 w-px -translate-x-1/2 bg-[linear-gradient(to_bottom,#9aa0aa_50%,transparent_0)] bg-[length:1px_6px]" /></span><span className="pb-5 [overflow-wrap:anywhere]"><span className="block text-xs font-normal text-muted-foreground">Pickup</span>{trip.pickupLabel || 'Not recorded'}</span></li>
              <li className="contents"><span className="flex justify-center pt-1.5" aria-hidden="true"><span className="size-3 rounded-[3px] bg-signal" /></span><span className="[overflow-wrap:anywhere]"><span className="block text-xs font-normal text-muted-foreground">Destination</span>{trip.dropoffLabel || 'Not recorded'}</span></li>
            </ol>
            {trip.events.length > 0 && <ol className="space-y-3 border-t border-border pt-5" aria-label="Latest updates">{[...trip.events].reverse().map((event, index) => { const state = event.toStatus || event.eventType; return <li key={`${event.eventType}:${event.occurredAt}:${index}`} className="flex items-center gap-3 text-sm"><StatusDot tone={statusTone(state)} /><span className="font-medium">{statusLabel(state)}</span><span className="ml-auto text-xs tabular-nums text-muted-foreground">{new Date(event.occurredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></li> })}</ol>}
            {trip.historyTruncated && <p className="text-xs text-muted-foreground">Showing the latest 100 updates</p>}
            <RiderTrack><RiderButton onClick={() => setRetry(value => value + 1)}><RefreshCw className="size-4" aria-hidden="true" />Refresh</RiderButton><RiderButtonLink href="/account/rides" tone="quiet">My rides</RiderButtonLink></RiderTrack>
          </section>
          <TripRiderActions tripId={trip.id} status={trip.status} />
          <RiderTripHistory requestId={trip.requestId} tripId={trip.id} />
        </>}
    </div>
  </RiderShell>
}
