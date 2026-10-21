'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { FleetBrand, type PublicFleetBrand } from '../components/FleetBrand'
import { Button } from '@/components/ui/button'
import { RiderTripHistory } from '../components/RiderTripHistory'
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

  return <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-50"><div className="mx-auto min-w-0 max-w-2xl break-words"><FleetBrand fleet={trip?.fleetBrand} /><div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900 p-6" aria-live="polite">
    {loading ? <p className="text-zinc-400" role="status">Checking the private trip view…</p> : error ? <div role="alert"><p className="text-red-300">The source could not be reached. Your trip details have not been changed.</p><Button type="button" variant="outline" className="mt-4" onClick={() => setRetry(value => value + 1)}>Retry status check</Button></div> : unavailable || !trip ? <div role="status"><h1 className="text-xl font-semibold">Private trip view unavailable</h1><p className="mt-2 text-sm leading-6 text-zinc-400">This private link is unavailable. Use your original saved receipt or sign in to your rider account.</p><Link href="/account/signin" className="mt-4 inline-block text-sm underline">Rider sign-in</Link><Link href="/book" className="mt-4 inline-block text-sm text-lime-200 underline underline-offset-4">Return to ride requests</Link></div> : <>
      <p className="text-xs uppercase tracking-widest text-zinc-500">Source confirmation</p><h1 className="mt-2 text-3xl font-semibold">{trip.confirmationCode}</h1><p className="mt-2 capitalize text-lime-300">{trip.status.replaceAll('_',' ')}</p>{trip.scheduledFor && <p className="mt-2 text-sm text-zinc-400">Scheduled {new Date(trip.scheduledFor).toLocaleString()}</p>}<div className="my-7 border-y border-zinc-800 py-5"><p>{trip.pickupLabel}</p><p className="my-2 text-zinc-600">↓</p><p>{trip.dropoffLabel}</p></div><div className="space-y-4">{trip.events.map((event,index)=><div className="flex gap-3" key={`${event.eventType}:${event.occurredAt}:${index}`}><CheckCircle2 className="size-5 text-lime-300"/><div><p className="text-sm capitalize">{event.toStatus?.replaceAll('_',' ') || event.eventType.replaceAll('_',' ')}</p><p className="text-xs text-zinc-500">{new Date(event.occurredAt).toLocaleString()}</p></div></div>)}</div>{trip.historyTruncated && <p className="mt-4 text-xs text-amber-300">The latest 100 events are shown above. Use the history pages below for older entries.</p>}<Button type="button" variant="outline" className="mt-5" onClick={() => setRetry(value => value + 1)}>Refresh current status</Button><Link href="/account/rides" className="ml-4 text-sm underline">Account history</Link><RiderTripHistory requestId={trip.requestId} tripId={trip.id} /><p className="mt-8 text-xs leading-5 text-zinc-500">This redacted view comes from the driver-owned deployment. Precise location, direct identity data, incident records, and provider evidence are not exposed here.</p>
    </>}
  </div></div></main>
}
