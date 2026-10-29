'use client'

import { RequestCancellation } from '../components/RequestCancellation'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Accessibility, ArrowRight, ArrowUpRight, CalendarClock, CarFront, MapPin, Minus, Plus, Search, Users } from 'lucide-react'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { TRIP_STAGES, statusLabel, statusTone, tripStageIndex } from '@/features/platform/lib/statusTone'
import { RiderShell } from '../components/RiderShell'
import { RiderButton, RiderButtonLink, RiderPill, RiderTrack } from '../components/RiderPills'
import { formatMoney } from '@/features/lib/currency'
import { isQuoteResponse } from '../domain/quoteResponse'
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
  if (!response.ok || payload.errors?.length) throw new Error('Something went wrong. Try again.')
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
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const selectedService = useMemo(() => services.find(service => service.id === serviceId), [services, serviceId])
  // A book-ahead service can't take a Now ride, so its pickup time opens straight away.
  useEffect(() => { if (selectedService?.advanceBookingMinutes) setScheduleOpen(true) }, [selectedService?.id, selectedService?.advanceBookingMinutes])
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
        // Default to an everyday ride: bookable now, not an accessible-only or book-ahead service.
        const everyday = found.find(service => service.readiness?.bookingEnabled && !service.wheelchairAccessible && !service.advanceBookingMinutes) || found.find(service => service.readiness?.bookingEnabled) || found[0]
        setServiceId(current => current || everyday?.id || '')
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Rides are unavailable right now.') })
      .finally(() => { if (active) setServicesLoading(false) })
    if (initialServiceId) {
      graphql<{ marketplaceRideshareService: Service | null }>(`query SelectedService($id: ID!) { marketplaceRideshareService(id: $id) { id title description category passengerCapacity wheelchairAccessible advanceBookingMinutes publicRegionLabels areasTruncated startingFareMinor currencyCode readiness { bookingEnabled mode reason } fleet { name publicCity logoIcon logoColor } } }`, { id: initialServiceId }).then(data => {
        if (!active) return
        if (data.marketplaceRideshareService) setServices(current => [...current.filter(item => item.id !== initialServiceId), data.marketplaceRideshareService!])
        else setError('That ride is unavailable. Choose another.')
      }).catch(() => { if (active) setError('That ride could not be loaded.') })
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
      setError('Your last request could not be restored from this browser. Check My rides before booking again.')
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
        setStatusError(data.publicRideshareRequest ? '' : 'Status unavailable. Sign in to see this ride.')
      } catch {
        if (active && controller === requestController) { setRequestView(null); setStatusAsOf(''); setStatusError('Status could not be refreshed.') }
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
    if (pickupLabel.trim().length < 2 || dropoffLabel.trim().length < 2) { setError('Enter a pickup and a destination.'); return }
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
        setError('Price unavailable. Try again.')
        return
      }
      setQuoteBinding({ quote: acceptedQuote, inputs, generation })
    } catch (reason) {
      if (!isCurrentQuoteRequest(generation, quoteRequestGeneration.current)) return
      setError(reason instanceof Error ? reason.message : 'Price unavailable.')
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
      setError('Your trip changed or the price expired. Get a new price.')
      return
    }
    try {
      persistPendingRequest(sessionStorage, binding)
    } catch {
      setError('This browser could not save the request. Nothing was sent.')
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
      if (!confirmed) throw new Error('Incomplete receipt.')
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
        setError('Ride requested. Keep this tab open; it could not be saved for reload.')
      }
    } catch (reason) {
      setUncertainRequest(binding)
      setError('Request unconfirmed. Recover it before booking again.')
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
    } catch { setError('More rides could not be loaded.') }
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
    } catch { setError('Still unconfirmed. Try again shortly.') }
    finally { requestInFlightRef.current = false; setRequestLoading(false) }
  }

  function beginAnotherRide() {
    if (!receipt || !requestView || requestView.handoffState === 'reassignment_pending' || requestInFlightRef.current || uncertainRequestRef.current) return
    const terminal = ['cancelled', 'expired'].includes(requestView.status) || ['completed', 'no_show'].includes(requestView.trip?.status || '')
    if (!terminal) return
    try { archiveReceipt(sessionStorage, receipt); sessionStorage.removeItem(receiptStorageKey) }
    catch { setError('This ride could not be archived. Keep this tab open.'); return }
    setReceipt(null); setRequestView(null); setQuoteBinding(null); setPickupLabel(''); setDropoffLabel(''); setScheduledFor(''); setStatusAsOf(''); setStatusError(''); setError('')
    quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
  }

  const locked = () => requestLoading || requestInFlightRef.current || Boolean(uncertainRequestRef.current)
  const update = (setter: (value: string) => void, value: string) => {
    if (locked()) return
    invalidateQuote()
    setter(value)
  }
  const change = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update(setter, event.target.value)
  const maxPassengers = selectedService?.passengerCapacity || 50
  const passengers = Number(passengerCount) || 1
  const scheduling = scheduleOpen || Boolean(scheduledFor)
  const terminal = Boolean(requestView && requestView.handoffState !== 'reassignment_pending' && (['cancelled', 'expired'].includes(requestView.status) || ['completed', 'no_show'].includes(requestView.trip?.status || '')))
  const formLocked = Boolean(receipt) || Boolean(uncertainRequest) || requestLoading || servicesLoading
  const quote = visibleQuoteBinding?.quote
  const ctaDisabled = quoteLoading || requestLoading || (!uncertainRequest && (servicesLoading || services.length === 0 || !serviceId || !selectedService?.readiness?.bookingEnabled)) || Boolean(receipt) || requestInFlightRef.current || (Boolean(uncertainRequest) && !visibleQuoteBinding)
  const liveState = requestView?.trip?.status || requestView?.status

  return <RiderShell fleet={selectedService?.fleet}>
    <div style={{ '--fleet-hue': normalizeStoreLogoColor(selectedService?.fleet.logoColor) } as CSSProperties} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-14">
      <div className="min-w-0 lg:pt-6">
        <h1 className="font-display text-[2.6rem] font-extrabold leading-[0.95] tracking-[-0.03em] [font-stretch:125%] sm:text-6xl lg:text-7xl">{receipt ? 'Your ride' : 'Where to?'}</h1>
        {selectedService && <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"><span className="font-medium text-foreground">{selectedService.fleet.name}</span>{selectedService.fleet.publicCity && <span>{selectedService.fleet.publicCity}</span>}</p>}

        <section aria-labelledby="services-title" className="mt-8 hidden lg:block">
          <h2 id="services-title" className="text-sm font-semibold text-muted-foreground">Rides</h2>
          <ServiceList services={services} serviceId={serviceId} disabled={formLocked} onChange={change(setServiceId)} loading={servicesLoading} more={nextServiceCursor ? () => void moreServices() : undefined} name="service-wide" />
          {selectedService && <ServiceDetail service={selectedService} />}
        </section>
      </div>

      <div className="min-w-0">
        {receipt ? receiptPanel() : <form className="relative rounded-[6px] border border-border bg-kerb p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-5" onSubmit={event => {
          event.preventDefault()
          if (uncertainRequest) {
            if (visibleQuoteBinding) void requestRide(visibleQuoteBinding)
            return
          }
          if (visibleQuoteBinding) void requestRide(visibleQuoteBinding)
          else void getQuote()
        }}>
          <fieldset disabled={formLocked} className="min-w-0 space-y-5 disabled:opacity-70">
            <legend className="sr-only">Plan a ride</legend>
            <div className="relative rounded-[6px] bg-asphalt ring-1 ring-inset ring-white/10">
              <span aria-hidden="true" className="absolute left-[1.3rem] top-[1.6rem] bottom-[1.6rem] w-px bg-[linear-gradient(to_bottom,#9aa0aa_50%,transparent_0)] bg-[length:1px_6px]" />
              <label className="flex items-center gap-3 px-4 py-1">
                <span aria-hidden="true" className="relative z-10 size-3 shrink-0 rounded-[4px] border-[3px] border-foreground bg-asphalt" />
                <span className="sr-only">Pickup</span>
                <input id="pickup" name="pickup" autoComplete="off" placeholder="Pickup area" value={pickupLabel} onChange={change(setPickupLabel)} required minLength={2} maxLength={120} className="h-12 min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/80" />
              </label>
              <div aria-hidden="true" className="ml-11 border-t border-white/10" />
              <label className="flex items-center gap-3 px-4 py-1">
                <span aria-hidden="true" className="relative z-10 size-3 shrink-0 rounded-[3px] bg-signal" />
                <span className="sr-only">Destination</span>
                <input id="dropoff" name="dropoff" autoComplete="off" placeholder="Destination area" value={dropoffLabel} onChange={change(setDropoffLabel)} required minLength={2} maxLength={120} className="h-12 min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground/80" />
              </label>
            </div>

            <div className="lg:hidden">
              <p id="service-label" className="mb-2 text-sm font-semibold text-muted-foreground">Ride</p>
              <ServiceList services={services} serviceId={serviceId} disabled={formLocked} onChange={change(setServiceId)} loading={servicesLoading} more={nextServiceCursor ? () => void moreServices() : undefined} name="service" />
              {selectedService && <ServiceDetail service={selectedService} />}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium" id="when-label">When</span>
                <RiderTrack label="When">
                  <RiderPill active={!scheduling} onClick={() => { if (locked()) return; setScheduleOpen(false); update(setScheduledFor, '') }}>Now</RiderPill>
                  <RiderPill active={scheduling} onClick={() => { if (locked()) return; setScheduleOpen(true) }}><CalendarClock className="size-4" aria-hidden="true" />Schedule</RiderPill>
                </RiderTrack>
              </div>
              {scheduling && <label className="block"><span className="sr-only">Pickup time</span><input id="schedule" name="schedule" type="datetime-local" value={scheduledFor} onChange={change(setScheduledFor)} className="h-12 w-full rounded-[6px] bg-asphalt px-4 text-base outline-none ring-1 ring-inset ring-white/10 focus-visible:ring-2 focus-visible:ring-signal" /></label>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label htmlFor="passengers" className="text-sm font-medium">Passengers</label>
                <RiderTrack label="Passengers">
                  <RiderButton size="sm" aria-label="Fewer passengers" disabled={passengers <= 1} onClick={() => update(setPassengerCount, String(Math.max(1, passengers - 1)))} className="size-9 px-0"><Minus className="size-4" aria-hidden="true" /></RiderButton>
                  <input id="passengers" name="passengers" type="number" inputMode="numeric" min={1} max={maxPassengers} value={passengerCount} onChange={change(setPassengerCount)} required className="w-10 bg-transparent text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                  <RiderButton size="sm" aria-label="More passengers" disabled={passengers >= maxPassengers} onClick={() => update(setPassengerCount, String(Math.min(maxPassengers, passengers + 1)))} className="size-9 px-0"><Plus className="size-4" aria-hidden="true" /></RiderButton>
                </RiderTrack>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                <span className="inline-flex items-center gap-2"><Accessibility className="size-4 text-muted-foreground" aria-hidden="true" />Wheelchair accessible</span>
                <input type="checkbox" role="switch" checked={wheelchairAccessible} onChange={event => { if (locked()) return; invalidateQuote(); setWheelchairAccessible(event.target.checked) }} className="peer sr-only" />
                <span aria-hidden="true" className="relative h-7 w-12 shrink-0 rounded-[3px] bg-asphalt ring-1 ring-inset ring-white/15 transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-[2px] after:bg-muted-foreground after:transition-transform peer-checked:bg-signal peer-checked:after:translate-x-5 peer-checked:after:bg-zinc-950 peer-focus-visible:ring-2 peer-focus-visible:ring-signal" />
              </label>
            </div>
          </fieldset>

          {quote && visibleQuoteBinding && <section aria-live="polite" aria-label="Price" className="relative mt-5 overflow-hidden rounded-[6px] bg-signal p-4 text-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-800">{selectedService?.title || 'Ride'}</p>
                <p className="mt-1 font-display text-4xl font-extrabold tracking-tight tabular-nums [font-stretch:115%]">{formatMoney(quote.fare.totalMinor, quote.fare.currencyCode)}</p>
              </div>
              <p className="shrink-0 rounded-[4px] bg-zinc-950/10 px-2.5 py-1 text-xs font-semibold tabular-nums"><QuoteCountdown expiresAt={quote.expiresAt} /></p>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-950/15 pt-3 text-xs">
              <div><dt className="text-zinc-800">Time</dt><dd className="font-semibold tabular-nums">{formatDuration(quote.estimatedDurationSeconds)}</dd></div>
              <div><dt className="text-zinc-800">Distance</dt><dd className="font-semibold tabular-nums">{formatDistance(quote.estimatedDistanceMeters)}</dd></div>
              <div><dt className="text-zinc-800">Riders</dt><dd className="font-semibold tabular-nums">{visibleQuoteBinding.inputs.passengerCount}{visibleQuoteBinding.inputs.wheelchairAccessible ? ' · ♿' : ''}</dd></div>
            </dl>
            {quote.scheduledFor && <p className="mt-2 text-xs font-medium">Pickup {new Date(quote.scheduledFor).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}
            <p className="mt-2 text-xs text-zinc-800">Cancellation {formatMoney(quote.cancellationFeeMinor, quote.fare.currencyCode)} · No-show {formatMoney(quote.noShowFeeMinor, quote.fare.currencyCode)}</p>
            <p className="mt-1 text-[0.6875rem] leading-4 text-zinc-800">{quote.estimateDisclosure}</p>
          </section>}

          <div className="mt-4 space-y-2" aria-live="polite">
            {quoteExpired && !uncertainRequest && <p role="status" className="text-sm text-amber-300">Price expired. Get a new price.</p>}
            {uncertainRequest && <p role="status" className="flex items-start gap-2 text-sm text-amber-300"><StatusDot tone="amber" pulse className="mt-1.5" />Request unconfirmed. Recover it before booking again.</p>}
            {servicesLoading && <p className="text-sm text-muted-foreground" role="status">Loading rides…</p>}
            {!servicesLoading && !services.length && <p className="text-sm text-amber-300" role="status">No rides available right now</p>}
            {selectedService?.readiness && !selectedService.readiness.bookingEnabled && <p role="status" className="text-sm text-amber-300">{selectedService.readiness.reason}</p>}
            {statusError && <p role="status" className="text-sm text-amber-300">{statusError}</p>}
            {error && <p role="alert" className="text-sm text-[#ff8a7f]">{error}</p>}
          </div>

          <div className="sticky bottom-3 z-10 mt-4 space-y-2">
            <RiderButton type="submit" tone="signal" size="lg" disabled={ctaDisabled} className="w-full">{quoteLoading || requestLoading ? 'Working…' : uncertainRequest ? 'Recover request' : visibleQuoteBinding ? 'Request ride' : 'See price'}<ArrowRight className="size-5" aria-hidden="true" /></RiderButton>
            {uncertainRequest && <RiderButton tone="raised" className="w-full" disabled={requestLoading} onClick={() => void resolveOriginalIntent()}>Check request outcome</RiderButton>}
          </div>
        </form>}
      </div>
    </div>
  </RiderShell>

  function receiptPanel() {
    if (!receipt) return null
    return <section aria-live="polite" aria-labelledby="receipt-title" className="space-y-5 rounded-[6px] border border-border bg-kerb p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
      <div className="space-y-1">
        <StatusTitle as="h2" id="receipt-title" tone={requestView ? statusTone(liveState) : 'zinc'} pulse={Boolean(requestView) && !terminal} status={requestView ? statusLabel(liveState) : statusError ? 'Status unavailable' : 'Checking…'} className="font-mono text-base font-semibold">{receipt.requestNumber}</StatusTitle>
        {statusAsOf && <p className="text-xs text-muted-foreground">Updated {statusAsOf}</p>}
      </div>
      {requestView?.trip ? <div className="space-y-3 rounded-[6px] bg-asphalt p-4 ring-1 ring-inset ring-white/10">
        <TripProgress status={requestView.trip.status} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Trip</p><p className="font-mono text-lg font-semibold">{requestView.trip.confirmationCode}</p>{requestView.trip.scheduledFor && <p className="text-xs text-muted-foreground">Pickup {new Date(requestView.trip.scheduledFor).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}</div>
          <RiderButtonLink href={riderStatusHref(requestView.trip.confirmationCode, receipt.requestId)} tone="signal">Track ride<ArrowUpRight className="size-4" aria-hidden="true" /></RiderButtonLink>
        </div>
        {requestView.handoffState === 'reassignment_pending' && <p className="text-sm text-amber-300">Driver cancelled. Finding another driver.</p>}
      </div> : requestView && !terminal && <div className="flex items-center gap-3 rounded-[6px] bg-asphalt p-4 ring-1 ring-inset ring-white/10"><span className="relative grid size-10 shrink-0 place-items-center rounded-[4px] bg-signal/15"><Search className="size-4 text-signal" aria-hidden="true" /><span className="absolute inset-0 animate-ping rounded-[4px] bg-signal/20 motion-reduce:animate-none" /></span><p className="text-sm font-medium">Finding your driver</p></div>}
      {requestView?.handoffState === 'unavailable' && <p className="text-sm text-amber-300">Assignment details unavailable. The operator needs to reconcile this request.</p>}
      {statusError && <p role="status" className="text-sm text-amber-300">{statusError}</p>}
      {error && <p role="alert" className="text-sm text-[#ff8a7f]">{error}</p>}
      {requestView && <RequestCancellation requestId={receipt.requestId} requestProof={receipt.requestProof} status={requestView.status} onAcknowledged={() => { setRequestView(null); setStatusAsOf(''); setStatusError('Cancellation received. Updating status…') }} />}
      <RiderTrack className="w-full">
        {terminal && <RiderButton tone="signal" className="flex-1" onClick={beginAnotherRide}>New ride</RiderButton>}
        <RiderButtonLink href="/account/rides" tone={terminal ? 'quiet' : 'raised'} className="flex-1">My rides</RiderButtonLink>
      </RiderTrack>
    </section>
  }
}

function QuoteCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  if (now === null) return <>Held</>
  const left = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 1000))
  return <span role="timer" aria-label={`Price held for ${left} seconds`}>{left ? `Held ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Expired'}</span>
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function formatLeadTime(minutes: number) {
  if (minutes < 60 || minutes % 60) return `${minutes} minutes`
  const hours = minutes / 60
  return hours === 1 ? '1 hour' : `${hours} hours`
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
}

function ServiceList({ services, serviceId, disabled, onChange, loading, more, name }: { services: Service[]; serviceId: string; disabled: boolean; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; loading: boolean; more?: () => void; name: string }) {
  if (loading && !services.length) return <div className="mt-3 space-y-2" aria-hidden="true">{[0, 1].map(index => <div key={index} className="h-[4.25rem] animate-pulse rounded-[6px] bg-lane motion-reduce:animate-none" />)}</div>
  // One fleet runs every ride here, and its name already sits under the heading.
  const multiFleet = new Set(services.map(service => service.fleet.name)).size > 1
  return <div className="mt-3 space-y-2" role="radiogroup" aria-label="Ride">
    {services.map(service => {
      const ready = service.readiness?.bookingEnabled === true
      return <label key={service.id} className="group flex cursor-pointer items-center gap-3 rounded-[6px] bg-asphalt p-3 ring-1 ring-inset ring-white/10 transition-[box-shadow,background-color] has-[:checked]:bg-lane has-[:checked]:ring-2 has-[:checked]:ring-signal has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal has-[:disabled]:cursor-default">
        <input type="radio" name={name} value={service.id} checked={serviceId === service.id} disabled={disabled} onChange={onChange} className="sr-only" />
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[6px] bg-kerb ring-1 ring-inset ring-white/10 group-has-[:checked]:bg-signal group-has-[:checked]:text-zinc-950">{service.wheelchairAccessible ? <Accessibility className="size-5" /> : <CarFront className="size-5" />}</span>
        <span className="min-w-0 flex-1">
          <StatusTitle as="span" tone={ready ? 'green' : 'amber'} className="text-sm font-semibold">{service.title}</StatusTitle>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{multiFleet && <span className="truncate">{service.fleet.name}</span>}<span className="inline-flex items-center gap-1"><Users className="size-3" aria-hidden="true" />{service.passengerCapacity}</span>{service.category && <span className="capitalize">{service.category.replaceAll('_', ' ')}</span>}</span>
        </span>
        {service.startingFareMinor !== null && <span className="shrink-0 text-right text-xs text-muted-foreground">from<span className="block text-sm font-semibold tabular-nums text-foreground">{formatMoney(service.startingFareMinor, service.currencyCode)}</span></span>}
      </label>
    })}
    {more && <RiderButton tone="quiet" size="sm" disabled={loading} onClick={more} className="w-full">{loading ? 'Loading…' : 'More rides'}</RiderButton>}
  </div>
}

function ServiceDetail({ service }: { service: Service }) {
  return <div className="mt-3 space-y-2.5 rounded-[6px] border border-border p-3.5 text-sm">
    {service.description && <p className="text-muted-foreground">{service.description}</p>}
    {service.publicRegionLabels.length > 0 && <ul aria-label="Service areas" className="flex flex-wrap gap-1.5">{service.publicRegionLabels.map(label => <li key={label} className="inline-flex items-center gap-1 rounded-[4px] bg-lane px-2.5 py-1 text-xs"><MapPin className="size-3 text-signal" aria-hidden="true" />{label}</li>)}</ul>}
    {service.advanceBookingMinutes > 0 && <p className="text-xs text-muted-foreground">Book at least {formatLeadTime(service.advanceBookingMinutes)} ahead</p>}
    <ServiceAreaPages serviceId={service.id} />
  </div>
}

function TripProgress({ status }: { status: string }) {
  const current = tripStageIndex(status)
  if (current < 0) return null
  return <ol className="grid grid-cols-5 gap-1" aria-label={`Trip: ${statusLabel(status)}`}>{TRIP_STAGES.map((stage, index) => <li key={stage} aria-current={index === current ? 'step' : undefined} className={`h-1.5 rounded-[4px] ${index <= current ? 'bg-signal' : 'bg-lane'}`}><span className="sr-only">{statusLabel(stage)}</span></li>)}</ol>
}
