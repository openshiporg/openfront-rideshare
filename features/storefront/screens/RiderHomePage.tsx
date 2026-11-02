'use client'

import { RequestCancellation } from '../components/RequestCancellation'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowRight, ArrowUpRight, ChevronRight, MapPin, Plane, Search, Ship, Users, X } from 'lucide-react'
import { VehicleArt } from '../components/VehicleArt'
import { PickupTimePicker } from '../components/PickupTimePicker'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { TRIP_STAGES, statusLabel, statusTone, tripStageIndex } from '@/features/platform/lib/statusTone'
import { RiderShell } from '../components/RiderShell'
import { RiderButton, RiderButtonLink, RiderTrack } from '../components/RiderPills'
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
  photoUrl?: string | null
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
  const [recentPlaces, setRecentPlaces] = useState<string[]>([])
  // A signed-in rider's own recent drop-offs and pickups are the most useful suggestions.
  useEffect(() => {
    const controller = new AbortController()
    graphql<{ myRideshareRequests: { items: { pickupLabel: string | null; dropoffLabel: string | null }[] } }>(`query Recent { myRideshareRequests { items { pickupLabel dropoffLabel } } }`, {}, controller.signal)
      .then(data => setRecentPlaces(data.myRideshareRequests.items.flatMap(item => [item.dropoffLabel, item.pickupLabel]).filter((label): label is string => Boolean(label?.trim()))))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const selectedService = useMemo(() => services.find(service => service.id === serviceId), [services, serviceId])
  // Signed out (or new riders): the fleet's popular places, which the server only lists once several riders used them.
  const [popularPlaces, setPopularPlaces] = useState<string[]>([])
  useEffect(() => {
    if (!serviceId) return
    const controller = new AbortController()
    graphql<{ marketplaceRidesharePopularPlaces: string[] }>(`query PopularPlaces($id: ID!) { marketplaceRidesharePopularPlaces(serviceId: $id) }`, { id: serviceId }, controller.signal)
      .then(data => setPopularPlaces(Array.isArray(data.marketplaceRidesharePopularPlaces) ? data.marketplaceRidesharePopularPlaces.filter(label => typeof label === 'string').slice(0, 3) : []))
      .catch(() => setPopularPlaces([]))
    return () => controller.abort()
  }, [serviceId])
  // An empty pickup means the fleet's first public service area (shown as the field's hint).
  const defaultPickup = selectedService?.publicRegionLabels?.[0] || ''
  const currentQuoteInputs = (): QuoteInputSnapshot => ({ serviceId, pickupLabel: pickupLabel.trim() || defaultPickup, dropoffLabel, scheduledFor, passengerCount, wheelchairAccessible })
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
    graphql<{ marketplaceRideshareServices: Service[] }>(`query RiderServices { marketplaceRideshareServices(limit: 12) { id nextCursor areasTruncated title description photoUrl category passengerCapacity wheelchairAccessible advanceBookingMinutes publicRegionLabels readiness { bookingEnabled mode reason } startingFareMinor currencyCode fleet { name publicCity logoIcon logoColor } } }`)
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
      graphql<{ marketplaceRideshareService: Service | null }>(`query SelectedService($id: ID!) { marketplaceRideshareService(id: $id) { id title description photoUrl category passengerCapacity wheelchairAccessible advanceBookingMinutes publicRegionLabels areasTruncated startingFareMinor currencyCode readiness { bookingEnabled mode reason } fleet { name publicCity logoIcon logoColor } } }`, { id: initialServiceId }).then(data => {
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
    if ((pickupLabel.trim() || defaultPickup).length < 2 || dropoffLabel.trim().length < 2) { setError('Enter a pickup and a destination.'); return }
    if (selectedService.advanceBookingMinutes && !scheduledFor) { setError('Choose a pickup time.'); return }
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
      const data = await graphql<{ marketplaceRideshareServices: Service[] }>(`query MoreServices($after: String!) { marketplaceRideshareServices(limit: 12, after: $after) { id nextCursor areasTruncated title description photoUrl category passengerCapacity wheelchairAccessible advanceBookingMinutes publicRegionLabels startingFareMinor currencyCode readiness { bookingEnabled mode reason } fleet { name publicCity logoIcon logoColor } } }`, { after: nextServiceCursor })
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
  const terminal = Boolean(requestView && requestView.handoffState !== 'reassignment_pending' && (['cancelled', 'expired'].includes(requestView.status) || ['completed', 'no_show'].includes(requestView.trip?.status || '')))
  const formLocked = Boolean(receipt) || Boolean(uncertainRequest) || requestLoading || servicesLoading
  const quote = visibleQuoteBinding?.quote
  const quoteFare = quote ? formatMoney(quote.fare.totalMinor, quote.fare.currencyCode) : ''
  const ctaDisabled = quoteLoading || requestLoading || (!uncertainRequest && (servicesLoading || services.length === 0 || !serviceId || !selectedService?.readiness?.bookingEnabled)) || Boolean(receipt) || requestInFlightRef.current || (Boolean(uncertainRequest) && !visibleQuoteBinding)
  const liveState = requestView?.trip?.status || requestView?.status

  // Destinations, not the pickup again: recent places first, then the fleet's other service areas.
  const effectivePickup = (pickupLabel.trim() || defaultPickup).toLowerCase()
  const areaLabels = new Set(services.flatMap(service => service.publicRegionLabels))
  const suggestions: { label: string; recent: boolean; popular?: boolean }[] = []
  const seen = new Set([effectivePickup, dropoffLabel.trim().toLowerCase()])
  for (const [label, recent, popular] of [...recentPlaces.map(label => [label.trim(), true, false] as const), ...popularPlaces.map(label => [label, false, true] as const), ...[...areaLabels].map(label => [label, false, false] as const)]) {
    if (suggestions.length >= 3 || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase()); suggestions.push({ label, recent, popular })
  }
  // Pickup hint: the fleet's own first service area, so the empty field names a real place.
  const pickupHint = defaultPickup || 'Pickup area'
  const requestLabel = quoteLoading || requestLoading ? 'Working…' : uncertainRequest ? 'Recover request' : visibleQuoteBinding && quoteFare ? `Confirm ${selectedService?.title || 'ride'} · ${quoteFare}` : selectedService && selectedService.startingFareMinor !== null ? `Request ${selectedService.title}` : 'See price'

  return <RiderShell fleet={selectedService?.fleet} map={{ variant: 'home', areas: selectedService?.publicRegionLabels, pickupLabel: pickupLabel || null }}>
    <div style={{ '--fleet-hue': normalizeStoreLogoColor(selectedService?.fleet.logoColor) } as CSSProperties} className="w-full lg:max-w-[28.75rem]">
      <h1 className="sr-only">{receipt ? 'Your ride' : 'Where to?'}</h1>
      {receipt ? receiptPanel() : <form className="relative lg:rounded-2xl lg:bg-white lg:p-4 lg:shadow-[0_18px_50px_-22px_rgba(11,43,46,0.45)] lg:ring-1 lg:ring-ink/5" onSubmit={event => {
        event.preventDefault()
        if (uncertainRequest) {
          if (visibleQuoteBinding) void requestRide(visibleQuoteBinding)
          return
        }
        if (visibleQuoteBinding) void requestRide(visibleQuoteBinding)
        else void getQuote()
      }}>
        <fieldset disabled={formLocked} className="min-w-0 disabled:opacity-70">
          <legend className="sr-only">Plan a ride</legend>
          <label className="flex items-center gap-3 rounded-xl bg-[#f2f5f5] px-4 py-2 max-lg:hidden">
            <MapPin className="size-5 shrink-0 text-ink" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">Pickup</span>
              <input id="pickup" name="pickup" autoComplete="off" placeholder={pickupHint} value={pickupLabel} onChange={change(setPickupLabel)} minLength={2} maxLength={120} className="block w-full min-w-0 bg-transparent text-[0.9375rem] font-medium text-ink outline-none placeholder:text-muted-foreground/80" />
            </span>
            {pickupLabel && <button type="button" aria-label="Clear pickup" onClick={() => update(setPickupLabel, '')} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white hover:text-ink"><X className="size-4" aria-hidden="true" /></button>}
          </label>

          <div className="relative mt-0 flex items-center gap-2.5 rounded-full bg-[#eef3f3] py-1.5 pl-4 pr-1.5 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-tide lg:mt-3 lg:rounded-xl lg:bg-foam lg:py-1.5 lg:pl-4 lg:ring-tide/60">
            <MapPin className="size-5 shrink-0 fill-signal lg:size-6 text-signal [&>circle]:fill-white [&>circle]:stroke-white" aria-hidden="true" />
            <label htmlFor="dropoff" className="sr-only">Where to?</label>
            <input id="dropoff" name="dropoff" autoComplete="off" placeholder="Where to?" value={dropoffLabel} onChange={change(setDropoffLabel)} required minLength={2} maxLength={120} className={`h-10 min-w-0 flex-1 bg-transparent font-semibold tracking-[-0.02em] text-ink outline-none placeholder:text-ink lg:h-11 ${dropoffLabel ? "text-lg lg:text-xl" : "text-[1.4375rem] lg:text-[2.125rem]"}`} />
            <button type="button" aria-label="See price" disabled={ctaDisabled || Boolean(visibleQuoteBinding)} onClick={() => void getQuote()} className="grid size-10 shrink-0 place-items-center rounded-full bg-signal text-white lg:size-11 transition-colors hover:bg-signal-deep disabled:opacity-60"><ArrowRight className="size-5 lg:size-6" aria-hidden="true" /></button>
          </div>

          <label className="mt-1.5 flex items-center gap-3 border-b border-border px-2 py-2.5 lg:hidden">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef3f3]"><span className="size-3 rounded-full bg-ink" /></span>
            <span className="min-w-0 flex-1">
              <input id="pickup-phone" name="pickup-phone" aria-label="Pickup" autoComplete="off" placeholder={pickupHint} value={pickupLabel} onChange={change(setPickupLabel)} maxLength={120} className="block w-full min-w-0 bg-transparent text-base font-medium text-ink outline-none placeholder:text-ink" />
              <span className="block text-[0.8125rem] text-muted-foreground">Pickup{selectedService?.fleet.publicCity ? ` · ${selectedService.fleet.publicCity}` : ''}</span>
            </span>
          </label>

          {suggestions.length > 0 && <div className="mt-1 lg:mt-1 lg:rounded-xl lg:bg-white lg:shadow-[0_6px_20px_-12px_rgba(11,43,46,0.35)] lg:ring-1 lg:ring-ink/5">
            <p className="px-1 pb-0.5 pt-3 text-xs font-medium text-muted-foreground lg:sr-only">Suggestions</p>
            <ul aria-label="Suggestions" className="divide-y divide-border">
              {suggestions.map(({ label, recent, popular }) => <li key={label}><button type="button" onClick={() => update(setDropoffLabel, label)} className="flex w-full items-center gap-3 px-1.5 py-2.5 text-left transition-colors hover:bg-foam lg:rounded-xl lg:px-4">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef3f3] text-ink lg:size-7 lg:bg-transparent"><PlaceIcon label={label} className="size-4 lg:size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-base font-medium leading-snug text-ink lg:text-[0.9375rem] lg:font-semibold">{label}</span><span className="block text-[0.8125rem] text-muted-foreground">{recent ? 'Recent' : popular ? `Popular${selectedService?.fleet.publicCity ? ` in ${selectedService.fleet.publicCity}` : ''}` : selectedService?.fleet.publicCity || 'Service area'}</span></span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground lg:hidden" aria-hidden="true" />
              </button></li>)}
            </ul>
          </div>}

          <section aria-labelledby="services-title" className="mt-3 lg:mt-5">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 id="services-title" className="text-xs font-medium text-muted-foreground lg:text-lg lg:font-semibold lg:text-ink">Ride options</h2>
              {nextServiceCursor && <button type="button" disabled={servicesLoading} onClick={() => void moreServices()} className="text-sm font-medium text-ink underline underline-offset-4 hover:text-signal">View all</button>}
            </div>
            <ServiceList services={services} serviceId={serviceId} disabled={formLocked} onChange={change(setServiceId)} loading={servicesLoading} name="service" />
          </section>

          <PickupTimePicker value={scheduledFor} onChange={value => { if (locked()) return; update(setScheduledFor, value) }}
            advanceBookingMinutes={selectedService?.advanceBookingMinutes || 0} disabled={formLocked}
            passengers={passengers} maxPassengers={maxPassengers} onPassengers={value => update(setPassengerCount, String(value))}
            wheelchair={wheelchairAccessible} onWheelchair={value => { if (locked()) return; invalidateQuote(); setWheelchairAccessible(value) }}>
            {selectedService && <ServiceDetail service={selectedService} />}
          </PickupTimePicker>
        </fieldset>

        {quote && visibleQuoteBinding && <section aria-live="polite" aria-label="Price" className="relative mt-3 overflow-hidden rounded-xl bg-foam p-4 text-ink ring-1 ring-tide/40">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">{selectedService?.title || 'Ride'}</p>
              <p className="mt-0.5 text-[2rem] font-semibold leading-tight tracking-tight tabular-nums text-signal">{formatMoney(quote.fare.totalMinor, quote.fare.currencyCode)}</p>
            </div>
            <p className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold tabular-nums text-signal ring-1 ring-tide/30"><QuoteCountdown expiresAt={quote.expiresAt} /></p>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-tide/20 pt-3 text-xs">
            <div><dt className="text-muted-foreground">Time</dt><dd className="font-semibold tabular-nums">{formatDuration(quote.estimatedDurationSeconds)}</dd></div>
            <div><dt className="text-muted-foreground">Distance</dt><dd className="font-semibold tabular-nums">{formatDistance(quote.estimatedDistanceMeters)}</dd></div>
            <div><dt className="text-muted-foreground">Riders</dt><dd className="font-semibold tabular-nums">{visibleQuoteBinding.inputs.passengerCount}{visibleQuoteBinding.inputs.wheelchairAccessible ? ' · ♿' : ''}</dd></div>
          </dl>
          {quote.scheduledFor && <p className="mt-2 text-xs font-medium">Pickup {new Date(quote.scheduledFor).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}
          <p className="mt-2 text-xs text-muted-foreground">Cancellation {formatMoney(quote.cancellationFeeMinor, quote.fare.currencyCode)} · No-show {formatMoney(quote.noShowFeeMinor, quote.fare.currencyCode)}</p>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{quote.estimateDisclosure}</p>
        </section>}

        <div className="mt-3 space-y-2 empty:hidden" aria-live="polite">
          {quoteExpired && !uncertainRequest && <p role="status" className="text-sm text-amber-700">Price expired. Get a new price.</p>}
          {uncertainRequest && <p role="status" className="flex items-start gap-2 text-sm text-amber-700"><StatusDot tone="amber" pulse className="mt-1.5" />Request unconfirmed. Recover it before booking again.</p>}
          {servicesLoading && <p className="text-sm text-muted-foreground" role="status">Loading rides…</p>}
          {!servicesLoading && !services.length && <p className="text-sm text-amber-700" role="status">No rides available right now</p>}
          {selectedService?.readiness && !selectedService.readiness.bookingEnabled && <p role="status" className="text-sm text-amber-700">{selectedService.readiness.reason}</p>}
          {statusError && <p role="status" className="text-sm text-amber-700">{statusError}</p>}
          {error && <p role="alert" className="text-sm text-[#c2412d]">{error}</p>}
        </div>

        <div className="sticky bottom-0 z-10 -mx-1 mt-4 space-y-2 rounded-t-2xl bg-white px-1 pb-3 pt-2 shadow-[0_-10px_16px_-12px_rgba(11,43,46,0.25)]">
          <RiderButton type="submit" tone="signal" size="lg" disabled={ctaDisabled} className="min-h-12 w-full rounded-full text-base lg:min-h-[3.3rem]">{requestLabel}</RiderButton>
          {uncertainRequest && <RiderButton tone="raised" className="w-full" disabled={requestLoading} onClick={() => void resolveOriginalIntent()}>Check request outcome</RiderButton>}
        </div>
      </form>}
    </div>
  </RiderShell>

  function receiptPanel() {
    if (!receipt) return null
    const title = requestView ? (requestView.trip ? statusLabel(liveState) : terminal ? statusLabel(liveState) : 'Finding your driver') : statusError ? 'Status unavailable' : 'Checking…'
    return <section aria-live="polite" aria-labelledby="receipt-title" className="space-y-5 lg:rounded-2xl lg:bg-white lg:p-6 lg:shadow-[0_18px_50px_-22px_rgba(11,43,46,0.45)] lg:ring-1 lg:ring-ink/5">
      <div className="space-y-1.5">
        <p className="text-[0.9375rem] text-ink">{requestView?.trip ? 'Your ride is on the way' : 'Your request'}</p>
        <StatusTitle as="h2" id="receipt-title" tone={requestView ? statusTone(liveState) : 'zinc'} pulse={Boolean(requestView) && !terminal} className="text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.03em] text-ink lg:text-[2.75rem]">{title}</StatusTitle>
        <p className="text-[0.9375rem] text-ink"><span className="font-mono font-medium">{receipt.requestNumber}</span>{statusAsOf && <span className="text-muted-foreground"> · Updated {statusAsOf}</span>}</p>
      </div>
      {requestView?.trip ? <div className="space-y-4 border-t border-border pt-5">
        <TripProgress status={requestView.trip.status} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Trip</p><p className="font-mono text-lg font-semibold">{requestView.trip.confirmationCode}</p>{requestView.trip.scheduledFor && <p className="text-xs text-muted-foreground">Pickup {new Date(requestView.trip.scheduledFor).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}</div>
          <RiderButtonLink href={riderStatusHref(requestView.trip.confirmationCode, receipt.requestId)} tone="signal" className="min-h-12 px-6">Track ride<ArrowUpRight className="size-4" aria-hidden="true" /></RiderButtonLink>
        </div>
        {requestView.handoffState === 'reassignment_pending' && <p className="text-sm text-amber-700">Driver cancelled. Finding another driver.</p>}
      </div> : requestView && !terminal && <div className="flex items-center gap-3 rounded-xl bg-foam p-4"><span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-white"><Search className="size-4 text-signal" aria-hidden="true" /><span className="absolute inset-0 animate-ping rounded-full bg-tide/20 motion-reduce:animate-none" /></span><p className="text-sm font-medium">Matching you with a driver</p></div>}
      {requestView?.handoffState === 'unavailable' && <p className="text-sm text-amber-700">Assignment details unavailable. The operator needs to reconcile this request.</p>}
      {statusError && <p role="status" className="text-sm text-amber-700">{statusError}</p>}
      {error && <p role="alert" className="text-sm text-[#c2412d]">{error}</p>}
      {requestView && <RequestCancellation requestId={receipt.requestId} requestProof={receipt.requestProof} status={requestView.status} onAcknowledged={() => { setRequestView(null); setStatusAsOf(''); setStatusError('Cancellation received. Updating status…') }} />}
      <RiderTrack className="w-full">
        {terminal && <RiderButton tone="signal" className="min-h-12 flex-1" onClick={beginAnotherRide}>New ride</RiderButton>}
        <RiderButtonLink href="/account/rides" tone={terminal ? 'quiet' : 'raised'} className="min-h-12 flex-1">My rides</RiderButtonLink>
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

function shortLead(minutes: number) {
  return minutes < 60 || minutes % 60 ? `${minutes} min` : `${minutes / 60} hr`
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
}

/** Suggestion icon by place type, from the place's own name. */
function PlaceIcon({ label, className }: { label: string; className?: string }) {
  if (/\b(airport|airfield|terminal \d)/i.test(label)) return <Plane className={className} />
  if (/\b(ferry|pier|wharf|harbou?r terminal|dock|marina)\b/i.test(label)) return <Ship className={className} />
  return <MapPin className={className} />
}

function vehicleFor(service: Service, index: number): { kind: 'sedan' | 'suv' | 'van'; tone: 'light' | 'dark' } {
  if (service.wheelchairAccessible) return { kind: 'van', tone: 'light' }
  if (service.passengerCapacity > 4) return { kind: 'suv', tone: 'dark' }
  return { kind: 'sedan', tone: index % 2 ? 'dark' : 'light' }
}

function ServiceList({ services, serviceId, disabled, onChange, loading, name }: { services: Service[]; serviceId: string; disabled: boolean; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; loading: boolean; name: string }) {
  if (loading && !services.length) return <div className="mt-3 space-y-2" aria-hidden="true">{[0, 1].map(index => <div key={index} className="h-[5.5rem] animate-pulse rounded-xl bg-lane motion-reduce:animate-none" />)}</div>
  // One fleet runs every ride here, and its name already sits in the header.
  const multiFleet = new Set(services.map(service => service.fleet.name)).size > 1
  return <div className="mt-1.5 divide-y divide-border lg:mt-3 lg:divide-y-0 lg:space-y-1.5" role="radiogroup" aria-label="Ride">
    {services.map((service, index) => {
      const ready = service.readiness?.bookingEnabled === true
      const vehicle = vehicleFor(service, index)
      return <label key={service.id} className="group flex min-h-[4.25rem] cursor-pointer items-center gap-3 rounded-2xl px-2 py-2.5 transition-[box-shadow,background-color] has-[:checked]:bg-foam has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tide has-[:disabled]:cursor-default sm:gap-4 lg:min-h-[5.6rem] lg:rounded-xl lg:bg-white lg:px-3 lg:shadow-[0_4px_16px_-12px_rgba(11,43,46,0.4)] lg:ring-1 lg:ring-ink/5 lg:has-[:checked]:ring-2 lg:has-[:checked]:ring-tide">
        <input type="radio" name={name} value={service.id} checked={serviceId === service.id} disabled={disabled} onChange={onChange} className="sr-only" />
        {service.photoUrl
          ? <img src={service.photoUrl} alt="" loading="lazy" className="h-10 w-[4.75rem] shrink-0 object-contain mix-blend-multiply sm:h-12 sm:w-[6.5rem] lg:h-14 lg:w-[7rem]" />
          : <VehicleArt kind={vehicle.kind} tone={vehicle.tone} className="h-10 w-[4.75rem] shrink-0 sm:h-12 sm:w-[6.5rem] lg:h-14 lg:w-[7rem]" />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2"><span className="line-clamp-2 text-base font-semibold leading-tight text-ink [overflow-wrap:anywhere]">{service.title}</span>{!ready && <StatusDot tone="amber" />}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted-foreground"><span className="inline-flex items-center gap-1"><Users className="size-3.5 fill-current" aria-hidden="true" />{service.passengerCapacity}<span className="max-sm:hidden"> seats</span></span>{service.category && <><span aria-hidden="true" className="max-sm:hidden">·</span><span className="capitalize max-sm:hidden">{service.category.replaceAll('_', ' ')}</span></>}{multiFleet && <span className="truncate">· {service.fleet.name}</span>}</span>
        </span>
        {service.startingFareMinor !== null && <span className="shrink-0 text-right"><span className="block whitespace-nowrap text-xs text-muted-foreground lg:text-[0.8125rem] lg:text-ink">{service.advanceBookingMinutes ? `Book ${shortLead(service.advanceBookingMinutes)} ahead` : 'from'}</span><span className="mt-0.5 block text-[1.0625rem] font-semibold tabular-nums text-ink lg:mt-1">{formatMoney(service.startingFareMinor, service.currencyCode)}</span></span>}
      </label>
    })}
  </div>
}

function ServiceDetail({ service }: { service: Service }) {
  return <div className="space-y-2.5 border-t border-border pt-3 text-sm">
    {service.description && <p className="text-muted-foreground">{service.description}</p>}
    {service.publicRegionLabels.length > 0 && <ul aria-label="Service areas" className="flex flex-wrap gap-1.5">{service.publicRegionLabels.map(label => <li key={label} className="inline-flex items-center gap-1 rounded-full bg-foam px-2.5 py-1 text-xs text-ink"><MapPin className="size-3 text-tide" aria-hidden="true" />{label}</li>)}</ul>}
    {service.advanceBookingMinutes > 0 && <p className="text-xs text-muted-foreground">Book at least {formatLeadTime(service.advanceBookingMinutes)} ahead</p>}
    <ServiceAreaPages serviceId={service.id} />
  </div>
}

function TripProgress({ status }: { status: string }) {
  const current = tripStageIndex(status)
  if (current < 0) return null
  return <ol className="grid grid-cols-5 gap-1" aria-label={`Trip: ${statusLabel(status)}`}>{TRIP_STAGES.map((stage, index) => <li key={stage} aria-current={index === current ? 'step' : undefined} className={`h-1.5 rounded-full ${index <= current ? 'bg-signal' : 'bg-lane'}`}><span className="sr-only">{statusLabel(stage)}</span></li>)}</ol>
}
