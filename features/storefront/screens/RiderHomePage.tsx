'use client'

import { RequestCancellation } from '../components/RequestCancellation'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, MapPin, ShieldCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney } from '@/features/lib/currency'
import { isQuoteResponse } from '../domain/quoteResponse'
import { FleetBrand } from '../components/FleetBrand'
import { normalizeStoreLogoColor } from '@/features/platform/settings/branding/store-logo'
import { ServiceAreaPages } from '../components/ServiceAreaPages'
import {
  advanceQuoteRequestGeneration,
  getUsableQuoteBinding,
  isCurrentQuoteRequest,
  isQuoteUnexpired,
  quoteInputsMatch,
  type QuoteBinding,
  type QuoteInputSnapshot,
} from '../domain/quoteBinding'

type Service = {
  id: string
  nextCursor?: string | null
  areasTruncated?: boolean
  title: string
  description: string | null
  category: string
  passengerCapacity: number
  wheelchairAccessible: boolean
  advanceBookingMinutes: number
  publicRegionLabels: string[]
  readiness?: { bookingEnabled: boolean; mode: string; reason: string }
  startingFareMinor: number | null
  currencyCode: string
  fleet: { name: string; publicCity: string | null; logoIcon?: string; logoColor?: string }
}
type Quote = {
  quoteId: string
  quoteProof: string
  expiresAt: string
  pickupLabel: string
  dropoffLabel: string
  scheduledFor: string | null
  estimatedDistanceMeters: number
  estimatedDurationSeconds: number
  cancellationFeeMinor: number
  noShowFeeMinor: number
  estimateDisclosure: string
  fare: { currencyCode: string; totalMinor: number }
}
import { parsePendingRequest, parseRiderReceipt, pendingRequestStorageKey, persistPendingRequest, receiptStorageKey, riderStatusHref, archiveReceipt } from '../domain/riderReceiptStorage'

type BoundQuote = QuoteBinding<Quote>
type Receipt = { requestId: string; requestNumber: string; requestProof: string; status: string }
type RequestView = { requestNumber: string; status: string; handoffState: string; trip: null | { confirmationCode: string; status: string; scheduledFor: string | null } }

async function graphql<T>(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/graphql', { signal, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }) })
  const payload = await response.json()
  if (!response.ok || payload.errors?.length) throw new Error('The request could not be confirmed. Please try again.')
  return payload.data as T
}

export default function RiderHomePage({ initialServiceId = '' }: { initialServiceId?: string }) {
  const [services, setServices] = useState<Service[]>([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [nextServiceCursor, setNextServiceCursor] = useState<string | null>(null)
  const [serviceId, setServiceId] = useState(initialServiceId)
  const [pickupLabel, setPickupLabel] = useState('')
  const [dropoffLabel, setDropoffLabel] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [passengerCount, setPassengerCount] = useState('1')
  const [wheelchairAccessible, setWheelchairAccessible] = useState(false)
  const quoteRequestGeneration = useRef(0)
  const requestInFlightRef = useRef(false)
  const uncertainRequestRef = useRef<BoundQuote | null>(null)
  const [quoteBinding, setQuoteBinding] = useState<BoundQuote | null>(null)
  const [uncertainRequest, setUncertainRequest] = useState<BoundQuote | null>(null)
  const [quoteExpired, setQuoteExpired] = useState(false)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [requestView, setRequestView] = useState<RequestView | null>(null)
  const [error, setError] = useState('')
  const [statusError, setStatusError] = useState('')
  const [statusAsOf, setStatusAsOf] = useState('')

  const selectedService = useMemo(() => services.find(service => service.id === serviceId), [services, serviceId])
  const currentQuoteInputs = (): QuoteInputSnapshot => ({ serviceId, pickupLabel, dropoffLabel, scheduledFor, passengerCount, wheelchairAccessible })
  const quoteInputs = currentQuoteInputs()
  const uncertainQuoteIsCurrent = Boolean(uncertainRequest
    && uncertainRequest === quoteBinding
    && isCurrentQuoteRequest(uncertainRequest.generation, quoteRequestGeneration.current)
    && quoteInputsMatch(uncertainRequest.inputs, quoteInputs))
  const visibleQuoteBinding = uncertainQuoteIsCurrent
    ? uncertainRequest
    : getUsableQuoteBinding(quoteBinding, quoteInputs, quoteRequestGeneration.current)
  const receiptRequestId = receipt?.requestId
  const receiptRequestProof = receipt?.requestProof

  useEffect(() => {
    let active = true
    graphql<{ marketplaceRideshareServices: Service[] }>(`query RiderServices { marketplaceRideshareServices(limit: 12) { id nextCursor areasTruncated title description category passengerCapacity wheelchairAccessible advanceBookingMinutes publicRegionLabels readiness { bookingEnabled mode reason } startingFareMinor currencyCode fleet { name publicCity logoIcon logoColor } } }`)
      .then(data => {
        if (!active) return
        const found = data.marketplaceRideshareServices || []
        setServices(found)
        setNextServiceCursor(found.at(-1)?.nextCursor || null)
        setServiceId(current => current || found[0]?.id || '')
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Service discovery is unavailable.') })
      .finally(() => { if (active) setServicesLoading(false) })
    if (initialServiceId) {
      graphql<{ marketplaceRideshareService: Service | null }>(`query SelectedService($id: ID!) { marketplaceRideshareService(id: $id) { id title description category passengerCapacity wheelchairAccessible advanceBookingMinutes publicRegionLabels areasTruncated startingFareMinor currencyCode readiness { bookingEnabled mode reason } fleet { name publicCity logoIcon logoColor } } }`, { id: initialServiceId }).then(data => {
        if (!active) return
        if (data.marketplaceRideshareService) setServices(current => [...current.filter(item => item.id !== initialServiceId), data.marketplaceRideshareService!])
        else setError('The selected service is unavailable. Choose another listed service.')
      }).catch(() => { if (active) setError('The selected service could not be loaded. Your saved request remains available.') })
    }
    try {
      const saved = parseRiderReceipt(sessionStorage.getItem(receiptStorageKey))
      if (saved) setReceipt(saved)
      else {
        const savedRequest = parsePendingRequest<Quote>(sessionStorage.getItem(pendingRequestStorageKey))
        if (savedRequest) {
          quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
          const pending = { ...savedRequest, generation: quoteRequestGeneration.current }
          setServiceId(pending.inputs.serviceId); setPickupLabel(pending.inputs.pickupLabel); setDropoffLabel(pending.inputs.dropoffLabel)
          setScheduledFor(pending.inputs.scheduledFor); setPassengerCount(pending.inputs.passengerCount); setWheelchairAccessible(pending.inputs.wheelchairAccessible)
          uncertainRequestRef.current = pending
          setUncertainRequest(pending); setQuoteBinding(pending)
        }
      }
    } catch {
      setError('Saved request recovery is unavailable. Do not send another request while its outcome is unknown; use the owning account or your saved receipt.')
      requestInFlightRef.current = true
    }
    return () => {
      active = false
      quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
    }
  }, [])

  useEffect(() => {
    if (!quoteBinding) return
    const boundQuote = quoteBinding
    const expire = () => {
      if (!isCurrentQuoteRequest(boundQuote.generation, quoteRequestGeneration.current)) return
      if (!isQuoteUnexpired(boundQuote.quote.expiresAt)) {
        setQuoteExpired(true)
        if (uncertainRequestRef.current === boundQuote) return
        quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
        setQuoteBinding(current => current?.generation === boundQuote.generation ? null : current)
      }
    }
    const timer = window.setInterval(expire, 1000)
    expire()
    return () => window.clearInterval(timer)
  }, [quoteBinding])

  useEffect(() => {
    if (!receiptRequestId || !receiptRequestProof) return
    let active = true
    let inFlight = false
    let controller: AbortController | null = null
    setRequestView(null); setStatusAsOf(''); setStatusError('')
    const refresh = async () => {
      if (inFlight || !active) return
      inFlight = true
      const requestController = new AbortController()
      controller = requestController
      const deadline = window.setTimeout(() => requestController.abort(), 8000)
      try {
        const data = await graphql<{ publicRideshareRequest: RequestView | null }>(`query RequestStatus($requestId: ID!, $proof: String!) { publicRideshareRequest(requestId: $requestId, requestProof: $proof) { requestNumber status handoffState trip { confirmationCode status scheduledFor } } }`, { requestId: receiptRequestId, proof: receiptRequestProof }, requestController.signal)
        if (!active || requestController.signal.aborted || controller !== requestController) return
        setRequestView(data.publicRideshareRequest)
        setStatusAsOf(data.publicRideshareRequest ? new Date().toLocaleTimeString() : '')
        setStatusError(data.publicRideshareRequest ? '' : 'Private status is unavailable. Sign in to the owning account or use your original receipt.')
      } catch {
        if (active && controller === requestController) { setRequestView(null); setStatusAsOf(''); setStatusError('Status could not be refreshed. Your original receipt is retained.') }
      } finally { window.clearTimeout(deadline); if (controller === requestController) { controller = null; inFlight = false } }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 10_000)
    const onFocus = () => { setRequestView(null); setStatusAsOf(''); void refresh() }
    window.addEventListener('focus', onFocus); window.addEventListener('online', onFocus)
    return () => { active = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus) }
  }, [receiptRequestId, receiptRequestProof])

  function invalidateQuote() {
    if (requestLoading || requestInFlightRef.current || uncertainRequestRef.current) return
    quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
    setQuoteBinding(null)
    setQuoteExpired(false)
    setQuoteLoading(false)
    setRequestView(null)
    setError('')
  }

  async function getQuote() {
    if (requestLoading || requestInFlightRef.current || uncertainRequestRef.current || receipt) return
    if (!selectedService?.readiness?.bookingEnabled) { setError(selectedService?.readiness?.reason || 'Booking is unavailable.'); return }
    if (pickupLabel.trim().length < 2 || dropoffLabel.trim().length < 2) { setError('Enter a pickup area and destination area.'); return }
    const inputs = currentQuoteInputs()
    quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
    const generation = quoteRequestGeneration.current
    setQuoteBinding(null)
    setQuoteExpired(false)
    setQuoteLoading(true)
    setError('')
    try {
      const scheduled = inputs.scheduledFor ? new Date(inputs.scheduledFor).toISOString() : null
      const data = await graphql<{ marketplaceRideshareQuote: Quote }>(`mutation Quote($serviceId: ID!, $pickup: String!, $dropoff: String!, $scheduled: DateTime, $passengers: Int, $wheelchair: Boolean) { marketplaceRideshareQuote(serviceId: $serviceId, pickupLabel: $pickup, dropoffLabel: $dropoff, scheduledFor: $scheduled, passengerCount: $passengers, wheelchairAccessible: $wheelchair) { quoteId quoteProof expiresAt pickupLabel dropoffLabel scheduledFor estimatedDistanceMeters estimatedDurationSeconds cancellationFeeMinor noShowFeeMinor estimateDisclosure fare { currencyCode totalMinor } } }`, {
        serviceId: inputs.serviceId, pickup: inputs.pickupLabel, dropoff: inputs.dropoffLabel,
        scheduled, passengers: Number(inputs.passengerCount), wheelchair: inputs.wheelchairAccessible,
      })
      if (!isCurrentQuoteRequest(generation, quoteRequestGeneration.current)) return
      const acceptedQuote = data.marketplaceRideshareQuote
      if (!isQuoteResponse(acceptedQuote) || !isQuoteUnexpired(acceptedQuote.expiresAt)) {
        setQuoteExpired(true)
        setError('The quote is unavailable or expired. Review the route and request another quote.')
        return
      }
      setQuoteBinding({ quote: acceptedQuote, inputs, generation })
    } catch (reason) {
      if (!isCurrentQuoteRequest(generation, quoteRequestGeneration.current)) return
      setError(reason instanceof Error ? reason.message : 'Quote is unavailable.')
    } finally {
      if (isCurrentQuoteRequest(generation, quoteRequestGeneration.current)) setQuoteLoading(false)
    }
  }

  async function requestRide(binding: BoundQuote) {
    if (requestLoading || requestInFlightRef.current || receipt || (uncertainRequestRef.current && uncertainRequestRef.current !== binding)) return
    const currentInputs = currentQuoteInputs()
    const retryingUncertainRequest = uncertainRequestRef.current === binding
      && binding === quoteBinding
      && isCurrentQuoteRequest(binding.generation, quoteRequestGeneration.current)
      && quoteInputsMatch(binding.inputs, currentInputs)
    if (binding !== quoteBinding || (!retryingUncertainRequest && getUsableQuoteBinding(binding, currentInputs, quoteRequestGeneration.current) !== binding)) {
      invalidateQuote()
      setQuoteExpired(true)
      setError('This source quote no longer matches the current inputs or has expired. Review the inputs and request a fresh quote.')
      return
    }
    try {
      persistPendingRequest(sessionStorage, binding)
    } catch {
      setError('This browser cannot save the exact request intent for reload. No request was sent. Enable session storage before retrying.')
      return
    }
    requestInFlightRef.current = true
    uncertainRequestRef.current = binding
    setUncertainRequest(binding)
    setRequestLoading(true)
    setError('')
    try {
      const data = await graphql<{ requestRide: Receipt }>(`mutation Request($quoteId: ID!, $proof: String!, $passengers: Int!, $needs: JSON!) { requestRide(quoteId: $quoteId, quoteProof: $proof, passengerCount: $passengers, accessibilityNeeds: $needs) { requestId requestNumber status requestProof replayed } }`, {
        quoteId: binding.quote.quoteId,
        proof: binding.quote.quoteProof,
        passengers: Number(binding.inputs.passengerCount),
        needs: { wheelchairAccessible: binding.inputs.wheelchairAccessible },
      })
      const confirmed = parseRiderReceipt(JSON.stringify(data.requestRide))
      if (!confirmed) throw new Error('The source did not return a complete request receipt.')
      uncertainRequestRef.current = null
      setUncertainRequest(null)
      setReceipt(confirmed)
      setRequestView(null)
      quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
      setQuoteBinding(null)
      try {
        const serialized = JSON.stringify(confirmed)
        archiveReceipt(sessionStorage, confirmed)
        sessionStorage.setItem(receiptStorageKey, serialized)
        if (sessionStorage.getItem(receiptStorageKey) !== serialized) throw new Error('Receipt was not saved.')
        sessionStorage.removeItem(pendingRequestStorageKey)
      } catch {
        setError('The source returned a request receipt, but this browser could not save it for reload. Keep this tab open.')
      }
    } catch (reason) {
      setUncertainRequest(binding)
      setError('Request outcome is unconfirmed. Keep this tab or recover the same request; do not send another booking.')
    } finally {
      requestInFlightRef.current = false
      setRequestLoading(false)
    }
  }

  async function moreServices() {
    if (!nextServiceCursor || servicesLoading) return
    setServicesLoading(true)
    try {
      const data = await graphql<{ marketplaceRideshareServices: Service[] }>(`query MoreServices($after: String!) { marketplaceRideshareServices(limit: 12, after: $after) { id nextCursor areasTruncated title description category passengerCapacity wheelchairAccessible advanceBookingMinutes publicRegionLabels startingFareMinor currencyCode readiness { bookingEnabled mode reason } fleet { name publicCity logoIcon logoColor } } }`, { after: nextServiceCursor })
      const rows = data.marketplaceRideshareServices
      if (!Array.isArray(rows) || rows.length > 12) throw new Error()
      setServices(current => [...new Map([...current, ...rows].map(row => [row.id, row])).values()])
      setNextServiceCursor(rows.at(-1)?.nextCursor || null)
    } catch { setError('More services could not be loaded. Try again shortly.') }
    finally { setServicesLoading(false) }
  }

  async function resolveOriginalIntent() {
    const binding = uncertainRequestRef.current
    if (!binding || requestInFlightRef.current) return
    requestInFlightRef.current = true; setRequestLoading(true); setError('')
    try {
      const data = await graphql<{ resolveRideRequestIntent: { quoteId: string; kind: string; receipt: Receipt | null } }>(`mutation ResolveRide($quoteId: ID!, $proof: String!, $passengers: Int!, $needs: JSON!) { resolveRideRequestIntent(quoteId: $quoteId, quoteProof: $proof, passengerCount: $passengers, accessibilityNeeds: $needs) { quoteId kind receipt { requestId requestNumber status requestProof replayed } } }`, { quoteId: binding.quote.quoteId, proof: binding.quote.quoteProof, passengers: Number(binding.inputs.passengerCount), needs: { wheelchairAccessible: binding.inputs.wheelchairAccessible } })
      const result = data.resolveRideRequestIntent
      if (!result || result.quoteId !== binding.quote.quoteId) throw new Error('Unconfirmed')
      if (result.kind === 'request') {
        const confirmed = parseRiderReceipt(JSON.stringify(result.receipt))
        if (!confirmed) throw new Error('Unconfirmed')
        const serialized = JSON.stringify(confirmed)
        sessionStorage.setItem(receiptStorageKey, serialized)
        if (sessionStorage.getItem(receiptStorageKey) !== serialized) throw new Error('Unconfirmed')
        archiveReceipt(sessionStorage, confirmed)
        setReceipt(confirmed)
      } else if (result.kind === 'closed_unused' && result.receipt === null) {
        const key = `openfront-rideshare-resolved-quote-v1:${binding.quote.quoteId}`
        const record = JSON.stringify({ result, binding })
        sessionStorage.setItem(key, record)
        if (sessionStorage.getItem(key) !== record) throw new Error('Unconfirmed')
      } else throw new Error('Unconfirmed')
      sessionStorage.removeItem(pendingRequestStorageKey)
      uncertainRequestRef.current = null; setUncertainRequest(null); setQuoteBinding(null)
      quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
    } catch { setError('Original intent is still unresolved. Keep its saved proof and reconcile the same request again.') }
    finally { requestInFlightRef.current = false; setRequestLoading(false) }
  }

  function beginAnotherRide() {
    if (!receipt || !requestView || requestView.handoffState === 'reassignment_pending' || requestInFlightRef.current || uncertainRequestRef.current) return
    const terminal = ['cancelled', 'expired'].includes(requestView.status) || ['completed', 'no_show'].includes(requestView.trip?.status || '')
    if (!terminal) return
    try { archiveReceipt(sessionStorage, receipt); sessionStorage.removeItem(receiptStorageKey) }
    catch { setError('The original receipt could not be retained. Keep this tab open.'); return }
    setReceipt(null); setRequestView(null); setQuoteBinding(null); setPickupLabel(''); setDropoffLabel(''); setScheduledFor(''); setStatusAsOf(''); setStatusError(''); setError('')
    quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
  }

  const change = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (requestLoading || requestInFlightRef.current || uncertainRequestRef.current) return
    invalidateQuote()
    setter(event.target.value)
  }
  const status = requestView?.status || 'status unavailable'

  return <main style={{ '--fleet-hue': normalizeStoreLogoColor(selectedService?.fleet.logoColor) } as CSSProperties} className="min-h-screen bg-zinc-950 text-zinc-50 [&_p]:break-words">
    <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-6">
      <FleetBrand fleet={selectedService?.fleet} />
      <div className="flex items-center gap-5 text-sm"><Link href="/account/rides" className="text-zinc-300 hover:text-white">My rides</Link><Link href="/dashboard" className="text-zinc-400 hover:text-white">Driver &amp; operator</Link></div>
    </nav>
    <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-20 pt-8 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:pt-16">
      <div>
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-300"><ShieldCheck className="size-3.5 text-[hsl(var(--fleet-hue)_85%_75%)]" /> Book with a local fleet</div>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.05em] sm:text-7xl">A ride, directly from its local operator.</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">Choose a listed service, review its quoted fare, and request a ride from the operator. Preview fares do not verify route coverage or driver availability.</p>
        <div className="mt-10 grid gap-5 border-t border-zinc-800 pt-6 sm:grid-cols-2">
          <div><MapPin className="mb-3 size-5 text-[hsl(var(--fleet-hue)_85%_75%)]"/><h2 className="font-medium">Service areas</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Published service regions. Use area names; keep exact addresses private.</p></div>
          <div><Users className="mb-3 size-5 text-[hsl(var(--fleet-hue)_85%_75%)]"/><h2 className="font-medium">Evidence is not approval</h2><p className="mt-1 text-sm leading-6 text-zinc-400">Recorded policy outcomes do not establish legal eligibility, licensing, insurance, or background-check approval.</p></div>
        </div>
        {!servicesLoading && services.length > 0 && <p className="mt-8 text-xs text-zinc-500">Currently listed: {services.map(service => service.title).join(' · ')}</p>}
      </div>

      <Card className="self-start border-zinc-800 bg-zinc-900 text-zinc-50 shadow-2xl">
        <CardHeader><CardTitle className="text-xl">Plan a ride</CardTitle><p className="text-sm leading-6 text-zinc-400">Use area names. Preview fares are unverified and no payment is collected.</p></CardHeader>
        <CardContent>
          {nextServiceCursor && <Button type="button" variant="outline" className="mb-4" disabled={servicesLoading} onClick={() => void moreServices()}>More services</Button>}
          <form className="space-y-5" onSubmit={event => {
            event.preventDefault()
            if (uncertainRequest) {
              if (visibleQuoteBinding) void requestRide(visibleQuoteBinding)
              return
            }
            if (visibleQuoteBinding) void requestRide(visibleQuoteBinding)
            else void getQuote()
          }}>
            <fieldset disabled={Boolean(receipt) || Boolean(uncertainRequest) || requestLoading || servicesLoading} className="space-y-5 disabled:opacity-70">
              <div className="space-y-2"><Label htmlFor="service" className="text-zinc-300">Service</Label><select id="service" name="service" required className="h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--fleet-hue)_85%_75%)]" value={serviceId} onChange={change(setServiceId)}><option value="" disabled>Select a service</option>{services.map(service=><option value={service.id} key={service.id}>{service.title} · {service.fleet.name}</option>)}</select></div>
              {selectedService && <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm"><p className="font-medium">{selectedService.fleet.name}{selectedService.fleet.publicCity ? ` · ${selectedService.fleet.publicCity}` : ''}</p><p className="mt-1 text-zinc-400">{selectedService.publicRegionLabels.join(' · ') || 'Region not published'} · up to {selectedService.passengerCapacity} passengers</p><p className="mt-1 text-xs text-zinc-500">Published service listing only; this does not confirm current supply or route coverage.</p><ServiceAreaPages serviceId={selectedService.id} /></div>}
              <div className="space-y-2"><Label htmlFor="pickup" className="text-zinc-300">Pickup area</Label><div className="relative"><MapPin className="absolute left-3 top-3 size-4 text-zinc-500"/><Input id="pickup" name="pickup" autoComplete="off" className="border-zinc-700 bg-zinc-950 pl-9" placeholder="e.g. Downtown station" value={pickupLabel} onChange={change(setPickupLabel)} required minLength={2} maxLength={120}/></div></div>
              <div className="space-y-2"><Label htmlFor="dropoff" className="text-zinc-300">Destination area</Label><div className="relative"><MapPin className="absolute left-3 top-3 size-4 text-[hsl(var(--fleet-hue)_85%_75%)]"/><Input id="dropoff" name="dropoff" autoComplete="off" className="border-zinc-700 bg-zinc-950 pl-9" placeholder="e.g. Riverside district" value={dropoffLabel} onChange={change(setDropoffLabel)} required minLength={2} maxLength={120}/></div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="passengers" className="text-zinc-300">Passengers</Label><Input id="passengers" name="passengers" type="number" min={1} max={selectedService?.passengerCapacity || 50} value={passengerCount} onChange={change(setPassengerCount)} required className="border-zinc-700 bg-zinc-950"/></div>
                <div className="space-y-2"><Label htmlFor="schedule" className="text-zinc-300">Schedule (optional)</Label><Input id="schedule" name="schedule" type="datetime-local" value={scheduledFor} onChange={change(setScheduledFor)} className="border-zinc-700 bg-zinc-950"/></div>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={wheelchairAccessible} onChange={event => { if (requestLoading || requestInFlightRef.current || uncertainRequestRef.current) return; invalidateQuote(); setWheelchairAccessible(event.target.checked) }} className="size-4 accent-[hsl(var(--fleet-hue)_85%_75%)]"/> I need a wheelchair-accessible service</label>
            </fieldset>

            {visibleQuoteBinding && <div className="rounded-xl border border-lime-300/20 bg-lime-300/5 p-4" aria-live="polite"><div className="flex min-w-0 flex-wrap items-end justify-between gap-4"><div className="min-w-0 max-w-full"><p className="text-xs uppercase tracking-widest text-zinc-400">Source quote · expires {new Date(visibleQuoteBinding.quote.expiresAt).toLocaleTimeString()}</p><p className="mt-1 text-sm text-zinc-300">{visibleQuoteBinding.quote.pickupLabel} → {visibleQuoteBinding.quote.dropoffLabel}</p><p className="mt-1 text-xs text-zinc-400">{selectedService?.title || 'Selected service'} · {visibleQuoteBinding.inputs.passengerCount} passenger(s){visibleQuoteBinding.inputs.wheelchairAccessible ? ' · wheelchair-accessible service requested' : ''}</p>{visibleQuoteBinding.quote.scheduledFor && <p className="mt-1 text-xs text-zinc-400">Scheduled {new Date(visibleQuoteBinding.quote.scheduledFor).toLocaleString()}</p>}</div><p className="shrink-0 text-2xl font-semibold">{formatMoney(visibleQuoteBinding.quote.fare.totalMinor, visibleQuoteBinding.quote.fare.currencyCode)}</p></div><p className="mt-3 text-xs leading-5 text-zinc-300">{visibleQuoteBinding.quote.estimateDisclosure}</p><p className="mt-2 text-xs text-zinc-400">Quoted cancellation fee: {formatMoney(visibleQuoteBinding.quote.cancellationFeeMinor, visibleQuoteBinding.quote.fare.currencyCode)} · no-show fee: {formatMoney(visibleQuoteBinding.quote.noShowFeeMinor, visibleQuoteBinding.quote.fare.currencyCode)}. No payment is collected in this demo.</p></div>}
            {quoteExpired && !uncertainRequest && <p role="status" className="text-sm text-amber-300">This quote expired. Review your inputs and request a fresh quote.</p>}
            {uncertainRequest && <p role="status" className="text-sm text-amber-300">The source request outcome is unconfirmed. Inputs and new quotes are locked. Only an explicit retry with the same quote can ask the source to return its receipt; if the original did not reach the source before expiry, it may reject again.</p>}
            <Button disabled={quoteLoading || requestLoading || (!uncertainRequest && (servicesLoading || services.length === 0 || !serviceId || !selectedService?.readiness?.bookingEnabled)) || Boolean(receipt) || requestInFlightRef.current || (Boolean(uncertainRequest) && !visibleQuoteBinding)} type="submit" className="h-12 w-full bg-[hsl(var(--fleet-hue)_85%_80%)] text-zinc-950 hover:bg-[hsl(var(--fleet-hue)_85%_85%)]">{quoteLoading || requestLoading ? 'Working…' : uncertainRequest ? 'Recover original request' : visibleQuoteBinding ? 'Request ride' : 'Get quote'}<ArrowRight className="ml-2 size-4"/></Button>
          </form>
          {uncertainRequest && <Button type="button" variant="outline" className="mt-3 w-full" disabled={requestLoading} onClick={() => void resolveOriginalIntent()}>Resolve original request</Button>}
          {receipt && requestView && <RequestCancellation requestId={receipt.requestId} requestProof={receipt.requestProof} status={requestView.status} onAcknowledged={() => { setRequestView(null); setStatusAsOf(''); setStatusError('Cancellation acknowledged. Refresh status or wait for the next check.') }} />}
          {receipt && requestView && requestView.handoffState !== 'reassignment_pending' && (['cancelled','expired'].includes(requestView.status) || ['completed','no_show'].includes(requestView.trip?.status || '')) && <Button type="button" variant="outline" className="mt-3 w-full" onClick={beginAnotherRide}>Request another ride</Button>}
          {servicesLoading && <p className="mt-4 text-sm text-zinc-400" role="status">Loading published services…</p>}
          {!servicesLoading && !services.length && <p className="mt-4 text-sm text-amber-300" role="status">No services are currently available. Try again later or contact the operator.</p>}
          {statusError && <p role="status" className="mt-4 text-sm text-amber-300">{statusError}</p>}
          {selectedService?.readiness && <p role="status" className="mt-4 text-sm text-zinc-300">{selectedService.readiness.reason}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
          {receipt && <div className="mt-5 rounded-xl border border-lime-300/30 bg-lime-300/10 p-5" aria-live="polite"><p className="text-sm font-medium text-lime-100">Request receipt · {receipt.requestNumber}</p><p className="mt-2 text-sm text-zinc-200">Status{statusAsOf ? ` at ${statusAsOf}` : ''}: <strong>{status.replaceAll('_', ' ')}</strong></p>{requestView?.handoffState === 'unavailable' && <p className="mt-3 text-sm text-amber-300">The owned request remains recorded, but its current quote/assignment binding is unavailable. Source reconciliation is required; no new request was sent.</p>}{requestView?.trip && <div className="mt-3 border-t border-lime-300/20 pt-3"><p className="text-sm">Trip {requestView.trip.confirmationCode} · {requestView.trip.status.replaceAll('_', ' ')}</p><Link href={riderStatusHref(requestView.trip.confirmationCode, receipt.requestId)} className="mt-2 inline-block text-sm text-[hsl(var(--fleet-hue)_85%_80%)] underline">Open private trip status and history</Link>{requestView.handoffState === 'reassignment_pending' && <p className="mt-2 text-xs text-amber-300">The previous assignment was cancelled; the source is matching again. This is not a new accepted ride.</p>}{requestView.trip.scheduledFor && <p className="mt-1 text-xs text-zinc-400">Scheduled {new Date(requestView.trip.scheduledFor).toLocaleString()}</p>}</div>}<p className="mt-3 text-xs leading-5 text-zinc-400">This browser checks source status every 10 seconds. The private receipt and original retry intent stay in this tab’s session storage across reloads, not in links or operator responses. Guest access expires 24 hours after the original request, never after a read or retry; account-linked requests require their owning sign-in. No external notification or payment is implied.</p><Link href="/account/rides" className="mt-3 inline-block text-sm text-[hsl(var(--fleet-hue)_85%_80%)] underline underline-offset-4">Open account ride history</Link></div>}
        </CardContent>
      </Card>
    </section>
  </main>
}
