'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, DollarSign, Navigation, RefreshCw, Share2 } from 'lucide-react'
import { formatMoney } from '@/features/lib/currency'
import { VehicleArt } from '../components/VehicleArt'
import { type PublicFleetBrand } from '../components/FleetBrand'
import { RiderShell } from '../components/RiderShell'
import { RiderButton, RiderButtonLink, RiderTrack } from '../components/RiderPills'
import { TRIP_STAGES, statusLabel, tripStageIndex } from '@/features/platform/lib/statusTone'
import { RiderTripHistory } from '../components/RiderTripHistory'
import { TripRiderActions } from '../components/TripRiderActions'
import { TripCardPayment } from '../components/TripCardPayment'
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
  bookingSnapshot: { quote?: { currencyCode: string | null; totalMinor: number | null }; service?: { name?: string | null; category?: string | null }; vehicle?: { label?: string | null; make?: string | null; model?: string | null; color?: string | null; plateMasked?: string | null } } | null
  finalFareSnapshot: { currencyCode: string | null; totalMinor: number | null } | null
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
            query: `query Trip($code: String!, $requestId: ID, $proof: String) { publicRideshareTrip(confirmationCode: $code, requestId: $requestId, requestProof: $proof) { id requestId fleetBrand confirmationCode status scheduledFor pickupLabel dropoffLabel bookingSnapshot finalFareSnapshot historyTruncated events { eventType toStatus occurredAt } } }`,
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
  const vehicle = trip?.bookingSnapshot?.vehicle
  const vehicleName = [vehicle?.color, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || vehicle?.label || trip?.bookingSnapshot?.service?.name || ''
  const fare = trip?.finalFareSnapshot?.totalMinor != null ? trip.finalFareSnapshot : trip?.bookingSnapshot?.quote
  const fareLabel = fare?.totalMinor != null && fare.currencyCode ? formatMoney(fare.totalMinor, fare.currencyCode) : null
  const headline = trip ? headlineFor(trip.status) : ''
  const [shared, setShared] = useState(false)
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: trip?.confirmationCode, url: window.location.href })
      else { await navigator.clipboard.writeText(window.location.href); setShared(true); window.setTimeout(() => setShared(false), 2500) }
    } catch { /* the rider closed the share sheet */ }
  }
  const panel = 'lg:rounded-2xl lg:bg-white lg:p-6 lg:shadow-[0_18px_50px_-22px_rgba(11,43,46,0.45)] lg:ring-1 lg:ring-ink/5'
  return <RiderShell fleet={trip?.fleetBrand} map={{ variant: trip ? 'route' : 'home', pickupLabel: trip?.pickupLabel, dropoffLabel: trip?.dropoffLabel, corner: trip?.dropoffLabel ? <div className="flex max-w-[16rem] items-center gap-4 rounded-xl bg-white px-5 py-4 shadow-[0_10px_30px_-16px_rgba(11,43,46,0.5)]"><Navigation className="size-6 shrink-0 fill-signal text-signal" aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-[0.8125rem] font-medium text-ink">To {trip.dropoffLabel}</span><span className="block text-[0.8125rem] text-muted-foreground">{statusLabel(trip.status)}</span></span></div> : undefined }}>
    <div className="w-full space-y-4 lg:max-w-[27rem]" aria-live="polite">
      {loading ? <div className={`space-y-4 ${panel}`} role="status" aria-label="Loading trip"><div className="h-12 w-2/3 animate-pulse rounded-xl bg-lane motion-reduce:animate-none" /><div className="h-40 animate-pulse rounded-xl bg-lane motion-reduce:animate-none" /></div>
        : error ? <div role="alert" className={`space-y-4 ${panel}`}><p className="text-sm text-[#c2412d]">Trip status could not be loaded.</p><RiderTrack><RiderButton onClick={() => setRetry(value => value + 1)}>Try again</RiderButton></RiderTrack></div>
        : unavailable || !trip ? <div role="status" className={`space-y-4 ${panel}`}><h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-ink">Trip not available</h1><p className="text-sm text-muted-foreground">Sign in, or open this trip from the browser you booked it in.</p><RiderTrack><RiderButtonLink href="/account/signin" tone="signal">Sign in</RiderButtonLink><RiderButtonLink href="/book" tone="quiet">Book a ride</RiderButtonLink></RiderTrack></div>
        : <>
          <section aria-label="Trip" className={`space-y-5 ${panel}`}>
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-[0.9375rem] text-ink"><span aria-hidden="true" className="relative inline-flex size-2 rounded-full bg-tide">{stage >= 0 && stage < 4 && <span className="absolute inset-0 animate-ping rounded-full bg-tide opacity-60 motion-reduce:animate-none" />}</span>{eyebrowFor(trip.status)}</p>
              <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ink lg:text-[2.875rem]">{headline}</h1>
              <p className="flex flex-wrap items-center gap-x-2 text-[0.9375rem] text-ink">{vehicleName && <span>{vehicleName}</span>}{vehicleName && vehicle?.plateMasked && <span aria-hidden="true">•</span>}{vehicle?.plateMasked && <span className="font-medium">{vehicle.plateMasked}</span>}{!vehicleName && <span className="font-mono font-medium">{trip.confirmationCode}</span>}</p>
              {trip.scheduledFor && <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarClock className="size-4" aria-hidden="true" />Pickup {new Date(trip.scheduledFor).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}
            </div>
            <div className="flex items-center gap-4 border-y border-border py-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Trip</p>
                <p className="font-mono text-lg font-semibold text-ink">{trip.confirmationCode}</p>
                <p className="text-sm text-muted-foreground">{trip.bookingSnapshot?.service?.name || statusLabel(trip.status)}</p>
              </div>
              <span aria-hidden="true" className="h-16 w-px bg-border" />
              <div className="flex shrink-0 flex-col items-center gap-1"><VehicleArt className="h-14 w-28" />{vehicle?.plateMasked && <span className="text-sm font-semibold text-ink">{vehicle.plateMasked}</span>}</div>
            </div>
            {fareLabel && <div className="flex items-start gap-4"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-signal text-white"><DollarSign className="size-4" aria-hidden="true" /></span><div><p className="text-sm text-ink">{trip.finalFareSnapshot ? 'Final fare' : 'Quoted fare'}</p><p className="text-[1.875rem] font-semibold leading-tight tracking-tight tabular-nums text-ink">{fareLabel}</p></div></div>}
            {stage >= 0 && <ol className="grid grid-cols-5 gap-1.5" aria-label="Progress">{TRIP_STAGES.map((value, index) => <li key={value} aria-current={index === stage ? 'step' : undefined} className="space-y-1.5"><span className={`block h-1.5 rounded-full ${index <= stage ? 'bg-signal' : 'bg-lane'}`} /><span className={`block truncate text-[0.625rem] sm:text-xs ${index === stage ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{stepLabel(statusLabel(value))}</span></li>)}</ol>}
            <ol className="grid grid-cols-[0.875rem_minmax(0,1fr)] gap-x-3 gap-y-0 text-[0.9375rem] font-medium text-ink" aria-label="Route">
              <li className="contents"><span className="relative flex justify-center pt-1.5" aria-hidden="true"><span className="size-3 rounded-full bg-signal ring-2 ring-white" /><span className="absolute bottom-0 left-1/2 top-6 w-0.5 -translate-x-1/2 bg-tide/40" /></span><span className="pb-4 [overflow-wrap:anywhere]"><span className="block text-xs font-normal text-muted-foreground">Pickup</span>{trip.pickupLabel || 'Not recorded'}</span></li>
              <li className="contents"><span className="flex justify-center pt-1" aria-hidden="true"><svg viewBox="0 0 26 34" className="h-4 w-3 fill-signal"><path d="M13 0C5.8 0 0 5.6 0 12.6 0 22 13 34 13 34S26 22 26 12.6C26 5.6 20.2 0 13 0Z" /></svg></span><span className="[overflow-wrap:anywhere]"><span className="block text-xs font-normal text-muted-foreground">Drop-off</span>{trip.dropoffLabel || 'Not recorded'}</span></li>
            </ol>
            <div className="grid grid-cols-2 gap-3">
              <RiderButton tone="raised" onClick={() => void share()} className="min-h-12"><Share2 className="size-4" aria-hidden="true" />{shared ? 'Link copied' : 'Share trip'}</RiderButton>
              <RiderButton tone="signal" onClick={() => setRetry(value => value + 1)} className="min-h-12"><RefreshCw className="size-4" aria-hidden="true" />Refresh</RiderButton>
            </div>
            {trip.events.length > 0 && <ol className="space-y-3 border-t border-border pt-5" aria-label="Latest updates">{[...trip.events].reverse().map((event, index) => { return <li key={`${event.eventType}:${event.occurredAt}:${index}`} className="flex items-center gap-3 text-sm"><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${index === 0 ? 'bg-signal ring-4 ring-foam' : 'bg-tide/50'}`} /><span className="font-medium">{riderEventLabel(event.eventType, event.toStatus)}</span><span className="ml-auto text-xs tabular-nums text-muted-foreground">{new Date(event.occurredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></li> })}</ol>}
            {trip.historyTruncated && <p className="text-xs text-muted-foreground">Showing the latest 100 updates</p>}
          </section>
          <TripCardPayment tripId={trip.id} status={trip.status} />
          <TripRiderActions tripId={trip.id} status={trip.status} />
          <div className={panel}><RiderTripHistory requestId={trip.requestId} tripId={trip.id} /></div>
        </>}
    </div>
  </RiderShell>
}

const RIDER_EVENT_LABELS: Record<string, string> = {
  'finance.refund_reserved': 'Refund issued',
  'trip.review_submitted': 'Review sent',
}

/** Rider-facing timeline label: status changes use the shared status names, other events never show internal keys. */
function riderEventLabel(eventType: string, toStatus: string | null) {
  if (toStatus) return statusLabel(toStatus)
  return RIDER_EVENT_LABELS[eventType] ?? 'Trip updated'
}

function eyebrowFor(status: string) {
  if (['driver_assigned', 'driver_en_route'].includes(status)) return 'Your ride is on the way'
  if (status === 'driver_arrived') return 'Your driver is here'
  if (status === 'in_progress') return 'Enjoy your ride'
  return statusLabel(status)
}

function headlineFor(status: string) {
  if (status === 'driver_assigned') return 'Driver assigned'
  if (status === 'driver_en_route') return 'On the way'
  if (status === 'driver_arrived') return 'Arrived'
  if (status === 'in_progress') return 'On trip'
  if (status === 'completed') return 'You’ve arrived'
  return statusLabel(status)
}

function stepLabel(label: string) {
  const short = label.replace(/^Driver /i, '')
  return short.charAt(0).toUpperCase() + short.slice(1).toLowerCase()
}
