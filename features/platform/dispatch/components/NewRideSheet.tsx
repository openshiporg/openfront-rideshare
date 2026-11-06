'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ActionTrack, TrackButton } from '@/features/platform/components/PillTabs'
import { platformGraphql } from '@/features/platform/components/SetupSheet'
import { searchPlaces } from '@/features/storefront/lib/places'
import type { LngLat, Place } from '@/features/storefront/lib/api'

type Service = { id: string; name: string; fleetName: string; passengerCapacity: number; wheelchairAccessible: boolean }
const input = 'h-10 w-full min-w-0 rounded-[6px] border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
const newKey = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').padEnd(32, '0').slice(0, 48)
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100)

function PlaceField({ label, value, onChange }: { label: string; value: Place | null; onChange: (place: Place | null) => void }) {
  const [text, setText] = useState(value?.label || '')
  const [options, setOptions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { if (!value) return; setText(value.label) }, [value])
  return <label className="relative block space-y-1.5"><span className="text-sm font-medium">{label}</span>
    <input className={input} value={text} autoComplete="off" placeholder="Search an address or place" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={event => {
      const next = event.target.value
      setText(next); onChange(null)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { searchPlaces(next, null).then(places => { setOptions(places); setOpen(true) }).catch(() => setOptions([])) }, 250)
    }} />
    {open && options.length > 0 && !value && <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-[6px] border bg-popover text-sm shadow-md">
      {options.map(place => <li key={`${place.label}:${place.point.join(',')}`}><button type="button" className="block w-full px-3 py-2 text-left hover:bg-muted" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(place); setText(place.label); setOpen(false) }}>
        <span className="block font-medium">{place.name}</span>{place.detail && <span className="block text-xs text-muted-foreground">{place.detail}</span>}
      </button></li>)}
    </ul>}
  </label>
}

/** Dispatcher phone booking: book a ride for a caller; it goes into the same dispatch queue as online requests. */
export function NewRideSheet({ services }: { services: Service[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [serviceId, setServiceId] = useState(services[0]?.id || '')
  const [pickup, setPickup] = useState<Place | null>(null)
  const [dropoff, setDropoff] = useState<Place | null>(null)
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [at, setAt] = useState('')
  const [estimate, setEstimate] = useState<{ total: string; minutes: number; miles: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ requestId: string; requestNumber: string; fare?: { totalMinor: number; currencyCode: string } } | null>(null)
  const key = useRef(newKey())
  const formRef = useRef<HTMLFormElement>(null)
  const service = services.find(item => item.id === serviceId)

  useEffect(() => {
    setEstimate(null)
    if (!pickup || !dropoff || !serviceId) return
    let live = true
    platformGraphql<any>(`query($pickupPoint: JSON!, $dropoffPoint: JSON!) { marketplaceRideshareEstimates(pickupPoint: $pickupPoint, dropoffPoint: $dropoffPoint) { distanceMeters durationSeconds options { serviceId totalMinor currencyCode } } }`, { pickupPoint: pickup.point as LngLat, dropoffPoint: dropoff.point as LngLat })
      .then(data => {
        const result = data?.marketplaceRideshareEstimates
        const option = result?.options?.find((item: any) => item.serviceId === serviceId)
        if (live && option) setEstimate({ total: money(option.totalMinor, option.currencyCode), minutes: Math.round(result.durationSeconds / 60), miles: (result.distanceMeters / 1609.34).toFixed(1) })
      }).catch(() => {})
    return () => { live = false }
  }, [pickup, dropoff, serviceId])

  function reset() {
    key.current = newKey(); setPickup(null); setDropoff(null); setWhen('now'); setAt(''); setEstimate(null); setError(''); setDone(null); formRef.current?.reset()
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    if (!serviceId) return setError('Choose a service.')
    if (!pickup || !dropoff) return setError('Pick the pickup and destination from the suggestions.')
    const scheduledFor = when === 'later' ? (at ? new Date(at) : null) : null
    if (when === 'later' && (!scheduledFor || Number.isNaN(scheduledFor.getTime()))) return setError('Choose the pickup time.')
    setBusy(true); setError('')
    try {
      const data = await platformGraphql<any>(`mutation($idempotencyKey: String!, $serviceId: ID!, $pickupLabel: String!, $dropoffLabel: String!, $pickupPoint: JSON, $dropoffPoint: JSON, $scheduledFor: DateTime, $passengerCount: Int, $wheelchairAccessible: Boolean, $riderName: String!, $riderPhone: String!, $receiptEmail: String, $notes: String) {
        createOperatorRide(idempotencyKey: $idempotencyKey, serviceId: $serviceId, pickupLabel: $pickupLabel, dropoffLabel: $dropoffLabel, pickupPoint: $pickupPoint, dropoffPoint: $dropoffPoint, scheduledFor: $scheduledFor, passengerCount: $passengerCount, wheelchairAccessible: $wheelchairAccessible, riderName: $riderName, riderPhone: $riderPhone, receiptEmail: $receiptEmail, notes: $notes)
      }`, {
        idempotencyKey: key.current, serviceId, pickupLabel: pickup.label.slice(0, 240), dropoffLabel: dropoff.label.slice(0, 240), pickupPoint: pickup.point, dropoffPoint: dropoff.point,
        scheduledFor: scheduledFor?.toISOString() || null, passengerCount: Number(form.get('passengerCount') || 1), wheelchairAccessible: form.get('wheelchair') === 'on',
        riderName: String(form.get('riderName') || ''), riderPhone: String(form.get('riderPhone') || ''), receiptEmail: String(form.get('receiptEmail') || '').trim() || null, notes: String(form.get('notes') || '').trim() || null,
      })
      setDone(data.createOperatorRide)
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The ride was not booked.')
    } finally { setBusy(false) }
  }

  if (!services.length) return null
  return <>
    <ActionTrack><TrackButton tone="primary" onClick={() => { reset(); setOpen(true) }}>New ride</TrackButton></ActionTrack>
    <Sheet open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5"><SheetTitle>{done ? 'Ride booked' : 'New ride'}</SheetTitle>{!done && <p className="text-sm text-muted-foreground">Book a ride for a caller. It joins the dispatch queue like an online request.</p>}</SheetHeader>
        {done ? <div className="space-y-4 p-5 text-sm">
          <p className="text-lg font-semibold">{done.requestNumber}</p>
          {done.fare && <p>Quoted fare {money(done.fare.totalMinor, done.fare.currencyCode)}. The driver collects payment at the end of the ride.</p>}
          <div className="flex flex-wrap gap-2">
            <ActionTrack><TrackButton tone="primary" onClick={() => { setOpen(false); router.push(`/dashboard/platform/dispatch?q=${encodeURIComponent(done.requestNumber)}`) }}>Find in queue</TrackButton></ActionTrack>
            <ActionTrack><TrackButton tone="default" onClick={reset}>Book another</TrackButton></ActionTrack>
          </div>
        </div> : <form ref={formRef} onSubmit={submit} className="flex flex-1 flex-col" data-unsaved={open ? 'true' : undefined}>
          <fieldset disabled={busy} className="flex-1 space-y-4 p-5">
            <label className="block space-y-1.5"><span className="text-sm font-medium">Service</span>
              <select className={input} value={serviceId} onChange={event => setServiceId(event.target.value)}>{services.map(item => <option key={item.id} value={item.id}>{item.name}{services.some(other => other.fleetName !== item.fleetName) ? ` · ${item.fleetName}` : ''}</option>)}</select></label>
            <PlaceField label="Pickup" value={pickup} onChange={setPickup} />
            <PlaceField label="Destination" value={dropoff} onChange={setDropoff} />
            {estimate && <p className="rounded-[6px] bg-muted/50 px-3 py-2 text-sm">About <strong>{estimate.total}</strong> · {estimate.miles} mi · {estimate.minutes} min</p>}
            <div className="space-y-1.5"><span className="text-sm font-medium">When</span>
              <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={when === 'now'} onChange={() => setWhen('now')} />As soon as possible</label><label className="flex items-center gap-2"><input type="radio" checked={when === 'later'} onChange={() => setWhen('later')} />Schedule</label></div>
              {when === 'later' && <input type="datetime-local" className={input} value={at} onChange={event => setAt(event.target.value)} aria-label="Pickup time" />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5"><span className="text-sm font-medium">Passengers</span><input name="passengerCount" type="number" min={1} max={service?.passengerCapacity || 8} defaultValue={1} className={input} /></label>
              {service?.wheelchairAccessible && <label className="flex items-end gap-2 pb-2.5 text-sm"><input name="wheelchair" type="checkbox" className="size-4 accent-foreground" />Wheelchair</label>}
            </div>
            <label className="block space-y-1.5"><span className="text-sm font-medium">Caller name</span><input name="riderName" required maxLength={120} className={input} /></label>
            <label className="block space-y-1.5"><span className="text-sm font-medium">Callback phone</span><input name="riderPhone" type="tel" required maxLength={24} className={input} /></label>
            <label className="block space-y-1.5"><span className="text-sm font-medium">Email for receipt<span className="font-normal text-muted-foreground"> · optional</span></span><input name="receiptEmail" type="email" maxLength={254} className={input} /></label>
            <label className="block space-y-1.5"><span className="text-sm font-medium">Notes for the driver<span className="font-normal text-muted-foreground"> · optional</span></span><textarea name="notes" rows={2} maxLength={600} className="w-full rounded-[6px] border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </fieldset>
          <div className="border-t p-5"><ActionTrack><TrackButton type="submit" tone="primary" disabled={busy}>{busy ? 'Booking…' : 'Book ride'}</TrackButton></ActionTrack></div>
        </form>}
      </SheetContent>
    </Sheet>
  </>
}
