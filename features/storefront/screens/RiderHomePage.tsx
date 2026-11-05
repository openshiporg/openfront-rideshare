'use client'

import { RequestCancellation } from '../components/RequestCancellation'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowDownUp, ArrowRight, ArrowUpRight, ChevronRight, Clock3, Crosshair, History, LoaderCircle, MapPin, Navigation, Search, Users, X } from 'lucide-react'
import { VehicleArt } from '../components/VehicleArt'
import { PickupTimePicker } from '../components/PickupTimePicker'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { TRIP_STAGES, statusLabel, statusTone, tripStageIndex } from '@/features/platform/lib/statusTone'
import { RiderShell } from '../components/RiderShell'
import { fetchRoute, placePoint, type LngLat, type RoutePath } from '../components/RideMap'
import { PlaceField, PlaceKindIcon, type PlaceSuggestion, type QuickRow } from '../components/PlaceField'
import type { SheetSnap } from '../components/MapSheet'
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
import { parsePendingRequest, parseRiderReceipt, receiptFromFragment, pendingRequestStorageKey, persistPendingRequest, receiptStorageKey, riderStatusHref, archiveReceipt } from '../domain/riderReceiptStorage'

/* The rider sheet's one design system.
   Type: 16/medium field values and ride names; 16/semibold prices; 13/regular secondary lines; 17/semibold the CTA;
   (28/semibold the status title). Radii: 12 rows, inputs and buttons; 16 the trip field and popovers (12 + 4 padding);
   24 the sheet; full for icon buttons and chips over the map. */
const secondary = 'text-[13px] leading-[18px] text-muted-foreground'
const fieldValue = 'block h-12 w-full min-w-0 flex-1 bg-transparent text-[16px] font-medium leading-6 text-ink outline-none placeholder:text-muted-foreground'
const clearButton = 'press grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white hover:text-ink'
const suggestionRow = 'press flex min-h-14 w-full items-center gap-3 rounded-[12px] px-2 text-left hover:bg-field'
const suggestionIcon = 'grid size-8 shrink-0 place-items-center rounded-full bg-field text-ink'
function PickupDot() {
  return <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center"><span className="size-3 rounded-full border-[3px] border-ink bg-white" /></span>
}

type BoundQuote = QuoteBinding<Quote>
type Estimate = { serviceId: string; totalMinor: number; currencyCode: string; cancellationFeeMinor: number; noShowFeeMinor: number }
type Estimates = { key: string; distanceMeters: number; durationSeconds: number; options: Map<string, Estimate> }
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
  const [receiptEmail, setReceiptEmail] = useState('')
  const [wheelchairAccessible, setWheelchairAccessible] = useState(false)
  const quoteRequestGeneration = useRef(0)
  const requestInFlightRef = useRef(false)
  const uncertainRequestRef = useRef<BoundQuote | null>(null)
  const [quoteBinding, setQuoteBinding] = useState<BoundQuote | null>(null)
  useLayoutEffect(() => { quoteBindingRef.current = quoteBinding }, [quoteBinding])
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
  // The live map: the phone sheet's detent, the fleet's city, the rider's chosen points and the route between them.
  const [snap, setSnap] = useState<SheetSnap>('half')
  const [cityPoint, setCityPoint] = useState<LngLat | null>(null)
  const [pickupPoint, setPickupPoint] = useState<LngLat | null>(null)
  const [dropoffPoint, setDropoffPoint] = useState<LngLat | null>(null)
  const [routePath, setRoutePath] = useState<RoutePath | null>(null)
  // What each ride costs for this route (the same fare rules a quote uses), shown in the list.
  const [estimates, setEstimates] = useState<Estimates | null>(null)
  // Move-the-map mode: which place the centre pin sets, and what's under it now.
  const [pinMode, setPinMode] = useState<null | 'pickup' | 'dropoff'>(null)
  const [pinSpot, setPinSpot] = useState<{ point: LngLat; label: string; loading: boolean } | null>(null)
  const [timeOpen, setTimeOpen] = useState(false)
  const [locatingPickup, setLocatingPickup] = useState(false)
  // The rider's own position (once they allow it) and its address; the pickup starts there.
  const [currentPlace, setCurrentPlace] = useState<{ point: LngLat; label: string } | null>(null)
  const [locateState, setLocateState] = useState<'asking' | 'ok' | 'denied' | 'unavailable'>('asking')
  const [pickupEditing, setPickupEditing] = useState(false)
  const [locateRetried, setLocateRetried] = useState(false)
  const pickupPointRef = useRef<LngLat | null>(null)
  const receiptRef = useRef(false)
  useEffect(() => { pickupPointRef.current = pickupPoint; receiptRef.current = Boolean(receipt) }, [pickupPoint, receipt])
  const quoteBindingRef = useRef<BoundQuote | null>(null)
  const labelsRef = useRef({ pickup: '', dropoff: '' })
  useEffect(() => { labelsRef.current = { pickup: pickupLabel, dropoff: dropoffLabel } }, [pickupLabel, dropoffLabel])
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
  // An empty pickup is the fleet's own service area, pinned at the city's centre.
  const mapPickupPoint = pickupPoint ?? (pickupLabel.trim() ? null : cityPoint)
  useEffect(() => {
    if (!mapPickupPoint || !dropoffPoint) { setRoutePath(null); return }
    const controller = new AbortController()
    void fetchRoute(mapPickupPoint, dropoffPoint, controller.signal).then(path => { if (!controller.signal.aborted) setRoutePath(path) })
    return () => controller.abort()
  }, [mapPickupPoint?.[0], mapPickupPoint?.[1], dropoffPoint?.[0], dropoffPoint?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const estimateKey = mapPickupPoint && dropoffPoint ? `${mapPickupPoint.join(',')};${dropoffPoint.join(',')}` : ''
  useEffect(() => {
    if (!estimateKey || !mapPickupPoint || !dropoffPoint) { setEstimates(null); return }
    const controller = new AbortController()
    graphql<{ marketplaceRideshareEstimates: { distanceMeters: number; durationSeconds: number; options: Estimate[] } }>(`query Estimates($from: JSON!, $to: JSON!) { marketplaceRideshareEstimates(pickupPoint: $from, dropoffPoint: $to) { distanceMeters durationSeconds options { serviceId totalMinor currencyCode cancellationFeeMinor noShowFeeMinor } } }`, { from: mapPickupPoint, to: dropoffPoint }, controller.signal)
      .then(data => {
        const result = data.marketplaceRideshareEstimates
        if (controller.signal.aborted || !result || !Array.isArray(result.options)) return
        setEstimates({ key: estimateKey, distanceMeters: result.distanceMeters, durationSeconds: result.durationSeconds, options: new Map(result.options.map(option => [option.serviceId, option])) })
      })
      .catch(() => { if (!controller.signal.aborted) setEstimates(null) })
    return () => controller.abort()
  }, [estimateKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const liveEstimates = estimates?.key === estimateKey ? estimates : null
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
        // Default to an everyday ride: bookable, soonest to book, not accessible-only, then the lowest fare.
        const everyday = [...found].filter(service => service.readiness?.bookingEnabled).sort((a, b) => Number(a.wheelchairAccessible) - Number(b.wheelchairAccessible) || a.advanceBookingMinutes - b.advanceBookingMinutes || (a.startingFareMinor ?? Infinity) - (b.startingFareMinor ?? Infinity))[0] || found[0]
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
      // An emailed guest receipt link carries the receipt in the URL fragment (never sent to a server).
      const emailed = receiptFromFragment(window.location.hash)
      if (emailed) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        if (!sessionStorage.getItem(receiptStorageKey)) sessionStorage.setItem(receiptStorageKey, JSON.stringify(emailed))
      }
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

  async function getQuote(): Promise<BoundQuote | null> {
    if (requestLoading || requestInFlightRef.current || uncertainRequestRef.current || receipt) return null
    if (!selectedService?.readiness?.bookingEnabled) { setError(selectedService?.readiness?.reason || 'Booking is unavailable.'); return null }
    if ((pickupLabel.trim() || defaultPickup).length < 2 || dropoffLabel.trim().length < 2) { setError('Enter a pickup and a destination.'); return null }
    if (selectedService.advanceBookingMinutes && !scheduledFor) { setTimeOpen(true); return null }
    const inputs = currentQuoteInputs()
    quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
    const generation = quoteRequestGeneration.current
    setQuoteBinding(null)
    setQuoteExpired(false)
    setQuoteLoading(true)
    setError('')
    try {
      const scheduled = inputs.scheduledFor ? new Date(inputs.scheduledFor).toISOString() : null
      // Places typed but not picked from the list are looked up once, near the fleet's city.
      const [from, to] = await Promise.all([
        pickupPoint ?? (pickupLabel.trim() ? placePoint(pickupLabel.trim(), cityPoint).catch(() => null) : cityPoint),
        dropoffPoint ?? placePoint(inputs.dropoffLabel.trim(), cityPoint).catch(() => null),
      ])
      if (!isCurrentQuoteRequest(generation, quoteRequestGeneration.current)) return null
      if (from && pickupLabel.trim() && !pickupPoint) setPickupPoint(from)
      if (to && !dropoffPoint) setDropoffPoint(to)
      const data = await graphql<{ marketplaceRideshareQuote: Quote }>(`mutation Quote($serviceId: ID!, $pickup: String!, $dropoff: String!, $pickupPoint: JSON, $dropoffPoint: JSON, $scheduled: DateTime, $passengers: Int, $wheelchair: Boolean) { marketplaceRideshareQuote(serviceId: $serviceId, pickupLabel: $pickup, dropoffLabel: $dropoff, pickupPoint: $pickupPoint, dropoffPoint: $dropoffPoint, scheduledFor: $scheduled, passengerCount: $passengers, wheelchairAccessible: $wheelchair) { quoteId quoteProof expiresAt pickupLabel dropoffLabel scheduledFor estimatedDistanceMeters estimatedDurationSeconds cancellationFeeMinor noShowFeeMinor estimateDisclosure fare { currencyCode totalMinor } } }`, {
        serviceId: inputs.serviceId, pickup: inputs.pickupLabel, dropoff: inputs.dropoffLabel,
        pickupPoint: from && to ? from : null, dropoffPoint: from && to ? to : null,
        scheduled, passengers: Number(inputs.passengerCount), wheelchair: inputs.wheelchairAccessible,
      })
      if (!isCurrentQuoteRequest(generation, quoteRequestGeneration.current)) return null
      const acceptedQuote = data.marketplaceRideshareQuote
      if (!isQuoteResponse(acceptedQuote) || !isQuoteUnexpired(acceptedQuote.expiresAt)) {
        setQuoteExpired(true)
        setError('Price unavailable. Try again.')
        return null
      }
      const binding = { quote: acceptedQuote, inputs, generation }
      quoteBindingRef.current = binding
      setQuoteBinding(binding)
      return binding
    } catch (reason) {
      if (!isCurrentQuoteRequest(generation, quoteRequestGeneration.current)) return null
      setError(reason instanceof Error ? reason.message : 'Price unavailable.')
      return null
    } finally {
      if (isCurrentQuoteRequest(generation, quoteRequestGeneration.current)) setQuoteLoading(false)
    }
  }

  async function requestRide(binding: BoundQuote) {
    if (requestLoading || requestInFlightRef.current || receipt || (uncertainRequestRef.current && uncertainRequestRef.current !== binding)) return
    const currentInputs = currentQuoteInputs()
    const retryingUncertainRequest = uncertainRequestRef.current === binding
      && binding === quoteBindingRef.current
      && isCurrentQuoteRequest(binding.generation, quoteRequestGeneration.current)
      && quoteInputsMatch(binding.inputs, currentInputs)
    if (binding !== quoteBindingRef.current || (!retryingUncertainRequest && getUsableQuoteBinding(binding, currentInputs, quoteRequestGeneration.current) !== binding)) {
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
      const data = await graphql<{ requestRide: Receipt }>(`mutation Request($quoteId: ID!, $proof: String!, $passengers: Int!, $needs: JSON!, $email: String) { requestRide(quoteId: $quoteId, quoteProof: $proof, passengerCount: $passengers, accessibilityNeeds: $needs, receiptEmail: $email) { requestId requestNumber status requestProof replayed } }`, {
        quoteId: binding.quote.quoteId,
        proof: binding.quote.quoteProof,
        passengers: Number(binding.inputs.passengerCount),
        needs: { wheelchairAccessible: binding.inputs.wheelchairAccessible },
        email: receiptEmail.trim() || null,
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
        setSnap('half')
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
    // Keep the addresses so the rider can rebook the same trip in one tap; the time and quote start over.
    setReceipt(null); setRequestView(null); setQuoteBinding(null); setScheduledFor(''); setStatusAsOf(''); setStatusError(''); setError(''); setSnap('half')
    quoteRequestGeneration.current = advanceQuoteRequestGeneration(quoteRequestGeneration.current)
  }

  const locked = () => requestLoading || requestInFlightRef.current || Boolean(uncertainRequestRef.current)
  const update = (setter: (value: string) => void, value: string) => {
    if (locked()) return
    invalidateQuote()
    setter(value)
  }
  const change = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update(setter, event.target.value)
  // Typing frees a field from its pin; choosing a suggestion pins it.
  const typePickup = (value: string) => { if (locked()) return; update(setPickupLabel, value); setPickupPoint(null) }
  const typeDropoff = (value: string) => { if (locked()) return; update(setDropoffLabel, value); setDropoffPoint(null) }
  const pickPickup = (place: PlaceSuggestion) => { setPickupEditing(false); if (locked()) return; update(setPickupLabel, place.label); setPickupPoint(place.point); setSnap('half') }
  const pickDropoff = (place: PlaceSuggestion) => { if (locked()) return; update(setDropoffLabel, place.label); setDropoffPoint(place.point); setSnap('half') }
  /** A saved or popular place, by name: pinned once its point is found near the fleet's city. */
  const choosePlace = (field: 'pickup' | 'dropoff', label: string) => {
    if (locked()) return
    if (field === 'pickup') { update(setPickupLabel, label); setPickupPoint(null) } else { update(setDropoffLabel, label); setDropoffPoint(null) }
    setSnap('half')
    void placePoint(label, cityPoint).then(point => { if (point && labelsRef.current[field] === label) (field === 'pickup' ? setPickupPoint : setDropoffPoint)(point) }).catch(() => {})
  }
  const chooseDropoff = (label: string) => choosePlace('dropoff', label)
  /** The named place at a point (or a plain "Pinned location" when nothing is named there). */
  const placeAt = async (point: LngLat) => {
    const response = await fetch(`/api/places?at=${point.join(',')}`).catch(() => null)
    const place = response?.ok ? (await response.json().catch(() => null))?.places?.[0] as PlaceSuggestion | undefined : undefined
    return place?.label || 'Pinned location'
  }
  /** A pin dragged on the map, or set with the centre pin: that spot, named. */
  const movePlace = async (field: 'pickup' | 'dropoff', point: LngLat, known?: string) => {
    if (locked() || receipt) return
    // The pin and route move at once; the street name follows when the lookup answers.
    const placeholder = known || 'Pinned location'
    if (field === 'pickup') { update(setPickupLabel, placeholder); setPickupPoint(point) } else { update(setDropoffLabel, placeholder); setDropoffPoint(point) }
    if (known) return
    const label = await placeAt(point)
    if (locked() || labelsRef.current[field] !== placeholder) return
    if (field === 'pickup') update(setPickupLabel, label); else update(setDropoffLabel, label)
  }
  /** The rider's position: remembered as "Current location", named once the address lookup answers.
   * It becomes the pickup when the rider asked for it (`force`), or on load while no pickup was chosen. */
  const locatePickup = async (point: LngLat, force = true) => {
    setCurrentPlace({ point, label: '' }); setLocateState('ok')
    const free = () => !locked() && !receiptRef.current
    if (free() && (force || !labelsRef.current.pickup.trim())) { update(setPickupLabel, 'Current location'); setPickupPoint(point) }
    const label = await placeAt(point)
    const address = label === 'Pinned location' ? '' : label
    setCurrentPlace(current => current?.point === point ? { point, label: address } : current)
    if (address && free() && pickupPointRef.current === point && labelsRef.current.pickup === 'Current location') update(setPickupLabel, address)
  }
  const askLocation = (force: boolean) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) { setLocateState('unavailable'); return }
    setLocatingPickup(true)
    navigator.geolocation.getCurrentPosition(position => {
      setLocatingPickup(false)
      void locatePickup([Math.round(position.coords.longitude * 1e5) / 1e5, Math.round(position.coords.latitude * 1e5) / 1e5], force)
    }, failure => {
      // Quietly keep the fleet's area as the pickup; the row offers "Use my location" to try again.
      setLocatingPickup(false)
      setLocateState(failure.code === failure.PERMISSION_DENIED ? 'denied' : 'unavailable')
    }, { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 })
  }
  // On open: ask for the rider's position (the browser's permission prompt) so the pickup is where they are.
  useEffect(() => { askLocation(false) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const useCurrentLocation = () => {
    if (currentPlace && locateState === 'ok') { void locatePickup(currentPlace.point, true); return }
    setLocateRetried(true); askLocation(true)
  }
  // Centre-pin mode: the spot under the pin, named once the map stops.
  const pinLookup = useRef(0)
  const startPin = (field: 'pickup' | 'dropoff') => {
    if (locked() || receipt) return
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setPinSpot(null); setPinMode(field); setSnap('peek')
  }
  const pinCentre = (point: LngLat) => {
    const lookup = ++pinLookup.current
    setPinSpot({ point, label: '', loading: true })
    void placeAt(point).then(label => { if (pinLookup.current === lookup) setPinSpot({ point, label, loading: false }) })
  }
  const confirmPin = () => {
    if (!pinMode || !pinSpot) return
    void movePlace(pinMode, pinSpot.point, pinSpot.loading ? undefined : pinSpot.label)
    setPinMode(null); setPinSpot(null); setSnap('half')
  }
  const swapPlaces = () => {
    if (locked() || receipt) return
    const nextPickup = dropoffLabel; const nextPickupPoint = dropoffPoint
    const nextDropoff = pickupLabel.trim() || defaultPickup; const nextDropoffPoint = pickupPoint ?? (pickupLabel.trim() ? null : cityPoint)
    invalidateQuote()
    setPickupLabel(nextPickup); setPickupPoint(nextPickupPoint); setDropoffLabel(nextDropoff); setDropoffPoint(nextDropoffPoint)
    if (!nextDropoffPoint && nextDropoff) void placePoint(nextDropoff, cityPoint).then(point => { if (point && labelsRef.current.dropoff === nextDropoff) setDropoffPoint(point) }).catch(() => {})
  }
  const maxPassengers = selectedService?.passengerCapacity || 50
  const passengers = Number(passengerCount) || 1
  const terminal = Boolean(requestView && requestView.handoffState !== 'reassignment_pending' && (['cancelled', 'expired'].includes(requestView.status) || ['completed', 'no_show'].includes(requestView.trip?.status || '')))
  const formLocked = Boolean(receipt) || Boolean(uncertainRequest) || requestLoading || servicesLoading
  const quote = visibleQuoteBinding?.quote
  const quoteFare = quote ? formatMoney(quote.fare.totalMinor, quote.fare.currencyCode) : ''
  const ctaDisabled = quoteLoading || requestLoading || (!uncertainRequest && (servicesLoading || services.length === 0 || !serviceId || !selectedService?.readiness?.bookingEnabled)) || Boolean(receipt) || requestInFlightRef.current || (Boolean(uncertainRequest) && !visibleQuoteBinding)
  const liveState = requestView?.trip?.status || requestView?.status
  const estimate = selectedService ? liveEstimates?.options.get(selectedService.id) : undefined
  const estimateFare = estimate ? formatMoney(estimate.totalMinor, estimate.currencyCode) : ''
  const needsTime = Boolean(selectedService?.advanceBookingMinutes) && !scheduledFor
  const routeKnown = Boolean(dropoffPoint && mapPickupPoint)
  const tripMinutes = liveEstimates ? formatDuration(liveEstimates.durationSeconds) : routePath ? formatDuration(routePath.durationSeconds) : ''
  const pickupWhen = scheduledFor ? whenLabel(new Date(scheduledFor)) : ''

  // Places to offer: recent first, then the fleet's popular places, then its other service areas.
  const effectivePickup = (pickupLabel.trim() || defaultPickup).toLowerCase()
  const areaLabels = new Set(services.flatMap(service => service.publicRegionLabels))
  const known: { label: string; kind: 'recent' | 'popular' | 'area' }[] = []
  for (const [label, kind] of [...recentPlaces.map(label => [label.trim(), 'recent'] as const), ...popularPlaces.map(label => [label, 'popular'] as const), ...[...areaLabels].map(label => [label, 'area'] as const)]) {
    if (!label || known.some(item => item.label.toLowerCase() === label.toLowerCase())) continue
    known.push({ label, kind })
  }
  const knownDetail = (kind: 'recent' | 'popular' | 'area') => kind === 'recent' ? 'Recent' : kind === 'popular' ? `Popular${selectedService?.fleet.publicCity ? ` in ${selectedService.fleet.publicCity}` : ''}` : selectedService?.fleet.publicCity || 'Service area'
  const suggestions = known.filter(item => ![effectivePickup, dropoffLabel.trim().toLowerCase()].includes(item.label.toLowerCase())).slice(0, 3)
  const placeRows = (field: 'pickup' | 'dropoff'): QuickRow[] => known.slice(0, 8).map(item => ({ key: `${field}:${item.label}`, title: item.label.split(',')[0], detail: knownDetail(item.kind), match: item.label, icon: item.kind === 'recent' ? <History className="size-4" /> : <PlaceKindIcon label={item.label} className="size-4" />, onSelect: () => choosePlace(field, item.label) }))
  const pickupQuick: QuickRow[] = [
    { key: 'here', title: locatingPickup ? 'Finding you…' : 'Current location', detail: currentPlace?.label || (locateState === 'denied' ? 'Location is off for this site' : 'Use where you are now'), icon: locatingPickup ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Navigation className="size-4 fill-current text-signal" />, onSelect: useCurrentLocation },
    { key: 'pin', title: 'Set on map', detail: 'Move the map under the pin', icon: <Crosshair className="size-4 text-signal" />, onSelect: () => startPin('pickup') },
    ...placeRows('pickup'),
  ].map(row => ({ ...row, onSelect: () => { setPickupEditing(false); row.onSelect() } }))
  // The pickup row: "Current location" with its address, a chosen place, or the fleet's own area.
  const pickupIsCurrent = Boolean(currentPlace && pickupPoint && pickupPoint[0] === currentPlace.point[0] && pickupPoint[1] === currentPlace.point[1])
  const pickupTitle = pickupIsCurrent ? 'Current location' : pickupLabel.trim() || defaultPickup || 'Choose pickup'
  const pickupDetail = pickupIsCurrent ? (currentPlace?.label || 'Finding the address…')
    : pickupLabel.trim() ? (pickupPoint ? 'Pickup · drag the pin to adjust' : 'Pickup')
    : locatingPickup ? 'Finding your location…'
    : locateState === 'denied' ? (locateRetried ? 'Location is blocked in your browser settings' : 'Pickup · service area')
    : selectedService?.fleet.publicCity ? `Pickup · ${selectedService.fleet.publicCity}` : 'Pickup · service area'
  const offerLocate = !pickupIsCurrent && !locatingPickup && (locateState === 'denied' || locateState === 'unavailable')
  const dropoffQuick: QuickRow[] = [...placeRows('dropoff'), { key: 'pin', title: 'Set destination on map', detail: 'Move the map under the pin', icon: <Crosshair className="size-4 text-signal" />, onSelect: () => startPin('dropoff') }]
  const busyLabel = requestLoading ? 'Requesting…' : quoteLoading ? 'Getting your price…' : ''
  const requestLabel = busyLabel || (uncertainRequest ? 'Recover request'
    : visibleQuoteBinding && quoteFare ? `Confirm ${selectedService?.title || 'ride'} · ${quoteFare}`
    : !dropoffLabel.trim() ? 'Choose a destination'
    : needsTime ? 'Choose pickup time'
    : `Request ${selectedService?.title || 'ride'}${estimateFare ? ` · ${estimateFare}` : ''}`)

  /** The one button: finds the destination, asks for a time, prices and requests in one tap. */
  async function primaryAction() {
    if (uncertainRequest) { if (visibleQuoteBinding) void requestRide(visibleQuoteBinding); return }
    if (!dropoffLabel.trim()) { document.getElementById('dropoff')?.focus(); return }
    if (!dropoffPoint) { chooseDropoff(dropoffLabel.trim()); return }
    if (visibleQuoteBinding) { void requestRide(visibleQuoteBinding); return }
    if (needsTime) { setTimeOpen(true); return }
    const shown = estimate?.totalMinor
    const binding = await getQuote()
    // The price on the button is the price requested; if the fleet's quote differs, the rider confirms it.
    if (binding && shown !== undefined && binding.quote.fare.totalMinor === shown) await requestRide(binding)
    else if (binding) setError('')
  }

  const fieldFocus = () => { if (window.innerWidth < 1024) setSnap('full') }
  const movable = !formLocked && !pinMode
  return <RiderShell fleet={selectedService?.fleet} map={{
    pickup: { label: pickupLabel || defaultPickup, point: mapPickupPoint, approximate: !pickupPoint, note: dropoffPoint ? (pickupWhen || (selectedService && !selectedService.advanceBookingMinutes ? 'Now' : null)) : null, onMove: movable ? point => void movePlace('pickup', point) : undefined },
    dropoff: { label: dropoffLabel, point: dropoffPoint, note: tripMinutes ? [tripMinutes, quoteFare || estimateFare].filter(Boolean).join(' · ') : null, onMove: movable ? point => void movePlace('dropoff', point) : undefined },
    route: routePath?.coordinates || null,
    snap, onSnap: setSnap, onLocate: point => { if (!locked() && !receipt) void locatePickup(point, true) }, onCityCentre: setCityPoint,
    sheetLabel: receipt ? 'Your ride' : pinMode ? (pinMode === 'pickup' ? 'Set pickup' : 'Set destination') : 'Plan a ride',
    pinMode: pinMode ? { kind: pinMode, onCentre: pinCentre } : null,
    searching: Boolean(receipt && requestView && !requestView.trip && !terminal),
    halfRatio: routeKnown && !receipt ? 0.64 : 0.56,
  }}>
    <div style={{ '--fleet-hue': normalizeStoreLogoColor(selectedService?.fleet.logoColor) } as CSSProperties} className="w-full">
      <h1 className="sr-only">{receipt ? 'Your ride' : 'Where to?'}</h1>
      {receipt ? receiptPanel() : pinMode ? pinPanel() : <form className="relative" onSubmit={event => { event.preventDefault(); void primaryAction() }}>
        <fieldset disabled={formLocked} className="min-w-0 disabled:opacity-70">
          <legend className="sr-only">Plan a ride</legend>
          {/* One trip field: pickup (dot) over destination (pin), joined by a hairline, swap on the right. */}
          <div className="relative rounded-[16px] bg-field p-1">
            <span aria-hidden="true" className="pointer-events-none absolute left-[1.6875rem] top-[2.375rem] h-[calc(100%-4.75rem)] w-px bg-ink/20" />
            <div className="flex min-h-14 items-center gap-3 rounded-[12px] pl-3 pr-1 focus-within:bg-white focus-within:ring-1 focus-within:ring-tide/50">
              {pickupEditing ? <PlaceField id="pickup" label="Pickup" placeholder="Search pickup" value={pickupIsCurrent ? '' : pickupLabel} onChange={typePickup} onPick={pickPickup} near={currentPlace?.point || cityPoint} onFocus={fieldFocus} onBlur={() => setPickupEditing(false)} autoFocus disabled={formLocked} quick={pickupQuick} className="min-w-0 flex-1"
                  leading={<PickupDot />}
                  inputClassName={fieldValue}>
                  {pickupLabel && !pickupIsCurrent && <button type="button" aria-label="Clear pickup" onMouseDown={event => event.preventDefault()} onClick={() => typePickup('')} className={clearButton}><X className="size-4" aria-hidden="true" /></button>}
                </PlaceField>
              : <>
                <PickupDot />
                <button type="button" id="pickup-row" aria-label={`Pickup: ${pickupTitle}${pickupIsCurrent && currentPlace?.label ? `, ${currentPlace.label}` : ''}. Change pickup`} onClick={() => { if (!formLocked) setPickupEditing(true) }} className="block min-w-0 flex-1 py-2 text-left focus-visible:outline-none">
                  <span className="block truncate text-[16px] font-medium leading-6 text-ink">{pickupTitle}</span>
                  <span className={`block truncate ${secondary}`}>{pickupDetail}</span>
                </button>
                {offerLocate && <button type="button" onClick={useCurrentLocation} className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-medium text-ink ring-1 ring-ink/10 hover:bg-foam"><Navigation className="size-3.5 fill-current text-signal" aria-hidden="true" />Use my location</button>}
                {locatingPickup && <LoaderCircle className="mr-3 size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Finding your location" />}
              </>}
            </div>
            <div aria-hidden="true" className="ml-12 mr-12 h-px bg-ink/10" />
            <div className="flex min-h-14 items-center rounded-[12px] pl-3 pr-1 focus-within:bg-white focus-within:ring-1 focus-within:ring-tide/50">
              <PlaceField id="dropoff" label="Where to?" placeholder="Where to?" value={dropoffLabel} onChange={typeDropoff} onPick={pickDropoff} near={pickupPoint || cityPoint} onFocus={fieldFocus} required disabled={formLocked} quick={dropoffQuick} className="min-w-0 flex-1"
                leading={<span aria-hidden="true" className="grid size-6 shrink-0 place-items-center"><MapPin className="size-5 fill-signal text-signal [&>circle]:fill-white [&>circle]:stroke-white" /></span>}
                inputClassName={`${fieldValue} placeholder:text-ink/60`}>
                {dropoffLabel && <button type="button" aria-label="Clear destination" onClick={() => typeDropoff('')} className={clearButton}><X className="size-4" aria-hidden="true" /></button>}
                {!dropoffPoint && <button type="button" aria-label="Find destination" disabled={!dropoffLabel.trim() || formLocked} onClick={() => chooseDropoff(dropoffLabel.trim())} className="press grid size-10 shrink-0 place-items-center rounded-full bg-signal text-white hover:bg-signal-deep disabled:opacity-50"><ArrowRight className="size-5" aria-hidden="true" /></button>}
              </PlaceField>
            </div>
            {!pickupEditing && dropoffLabel.trim() && dropoffPoint && <button type="button" aria-label="Swap pickup and destination" onClick={swapPlaces} className="press absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-[0_2px_8px_-4px_rgba(11,43,46,0.4)] ring-1 ring-ink/10 hover:bg-foam active:scale-[0.97]"><ArrowDownUp className="size-4" aria-hidden="true" /></button>}
          </div>

          {!routeKnown && <ul aria-label="Suggestions" className="mt-2">
            {suggestions.map(({ label, kind }) => <li key={label}><button type="button" onClick={() => chooseDropoff(label)} className={suggestionRow}>
              <span aria-hidden="true" className={suggestionIcon}>{kind === 'recent' ? <History className="size-4" /> : <PlaceKindIcon label={label} className="size-4" />}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-medium leading-6 text-ink">{label}</span><span className={`block truncate ${secondary}`}>{knownDetail(kind)}</span></span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button></li>)}
            <li><button type="button" onClick={() => startPin('dropoff')} className={suggestionRow}>
              <span aria-hidden="true" className={`${suggestionIcon} text-signal`}><Crosshair className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-medium leading-6 text-ink">Set destination on map</span><span className={`block truncate ${secondary}`}>Move the map under the pin</span></span>
            </button></li>
          </ul>}

          <section aria-labelledby="services-title" className="mt-4">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 id="services-title" className={secondary}>{routeKnown ? `Choose a ride${tripMinutes ? ` · ${tripMinutes}` : ''}${liveEstimates ? ` · ${formatDistance(liveEstimates.distanceMeters)}` : ''}` : 'Ride options'}</h2>
              {nextServiceCursor && <button type="button" disabled={servicesLoading} onClick={() => void moreServices()} className="text-[13px] font-medium text-ink underline underline-offset-4 hover:text-signal">View all</button>}
            </div>
            <ServiceList services={services} serviceId={serviceId} disabled={formLocked} onChange={event => { change(setServiceId)(event); if (routeKnown && snap === 'peek') setSnap('half') }} loading={servicesLoading} name="service" estimates={liveEstimates?.options || null} pricing={routeKnown && !liveEstimates} scheduledFor={scheduledFor} durationSeconds={liveEstimates?.durationSeconds ?? null} />
          </section>
        </fieldset>

        <div className="mt-2 space-y-1 px-1 empty:hidden" aria-live="polite">
          {quoteExpired && !uncertainRequest && <p role="status" className="text-[13px] text-amber-700">Price expired. Request again for a new price.</p>}
          {uncertainRequest && <p role="status" className="flex items-start gap-2 text-[13px] text-amber-700"><StatusDot tone="amber" pulse className="mt-1.5" />Request unconfirmed. Recover it before booking again.</p>}
          {servicesLoading && <p className={secondary} role="status">Loading rides…</p>}
          {!servicesLoading && !services.length && <p className="text-[13px] text-amber-700" role="status">No rides available right now</p>}
          {selectedService?.readiness && !selectedService.readiness.bookingEnabled && <p role="status" className="text-[13px] text-amber-700">{selectedService.readiness.reason}</p>}
          {statusError && <p role="status" className="text-[13px] text-amber-700">{statusError}</p>}
        </div>

        {/* Time and request: one group, same 12px family, pinned to the sheet's visible bottom. */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-2 space-y-2 bg-white px-4 pb-2 pt-3 shadow-[0_-1px_0_rgba(13,46,49,0.08)] group-data-[snap=peek]/sheet:hidden lg:-mx-4">
          <PickupTimePicker value={scheduledFor} onChange={value => { if (locked()) return; update(setScheduledFor, value) }} open={timeOpen} onOpenChange={setTimeOpen} needed={needsTime && Boolean(dropoffLabel.trim())}
            advanceBookingMinutes={selectedService?.advanceBookingMinutes || 0} disabled={formLocked}
            passengers={passengers} maxPassengers={maxPassengers} onPassengers={value => update(setPassengerCount, String(value))}
            wheelchair={wheelchairAccessible} onWheelchair={value => { if (locked()) return; invalidateQuote(); setWheelchairAccessible(value) }}>
            <label className="block">
              <span className="block text-[13px] font-medium text-ink">Email a receipt <span className="font-normal text-muted-foreground">· optional</span></span>
              <input name="receiptEmail" type="email" autoComplete="email" inputMode="email" maxLength={254} placeholder="you@example.com" value={receiptEmail} onChange={event => setReceiptEmail(event.target.value)} className="mt-1.5 block h-11 w-full min-w-0 rounded-[12px] bg-field px-3 text-[16px] text-ink outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-tide/50" />
            </label>
            {selectedService && <ServiceDetail service={selectedService} />}
          </PickupTimePicker>
          {quote && visibleQuoteBinding && <p aria-live="polite" aria-label="Price" className={`flex flex-wrap items-center gap-x-1.5 px-1 ${secondary}`}><span className="font-medium text-ink">{estimate && estimate.totalMinor !== quote.fare.totalMinor ? `Price updated to ${quoteFare}` : `Price ${quoteFare}`}</span><span>·</span><span className="tabular-nums"><QuoteCountdown expiresAt={quote.expiresAt} /></span>{quote.scheduledFor && <><span>·</span><span>Pickup {whenLabel(new Date(quote.scheduledFor))}</span></>}</p>}
          {error && <p role="alert" className="px-1 text-[13px] text-[#c2412d]">{error}</p>}
          <button type="submit" disabled={ctaDisabled} className="press flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-signal px-4 text-[17px] font-semibold text-white hover:bg-signal-deep disabled:opacity-45">{busyLabel && <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}<span className="truncate">{requestLabel}</span></button>
          {(quote || estimate) && <p title={quote ? quote.estimateDisclosure : 'Estimated from the driving route. The fleet confirms the final fare.'} className={`truncate px-1 text-center ${secondary}`}>Estimate · Cancel {formatMoney((quote || estimate)!.cancellationFeeMinor, quote?.fare.currencyCode || estimate!.currencyCode)} · No-show {formatMoney((quote || estimate)!.noShowFeeMinor, quote?.fare.currencyCode || estimate!.currencyCode)}</p>}
          {uncertainRequest && <button type="button" className="press flex h-12 w-full items-center justify-center rounded-[12px] bg-white text-[16px] font-medium text-ink ring-1 ring-ink/15 disabled:opacity-45" disabled={requestLoading} onClick={() => void resolveOriginalIntent()}>Check request outcome</button>}
        </div>
      </form>}
    </div>
  </RiderShell>

  function pinPanel() {
    const field = pinMode === 'pickup' ? 'pickup' : 'destination'
    return <section aria-live="polite" aria-labelledby="pin-title" className="space-y-3">
      <div className="flex min-h-14 items-center gap-3 rounded-[16px] bg-field py-1 pl-3 pr-1">
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center text-signal"><Crosshair className="size-5" /></span>
        <div className="min-w-0 flex-1 py-1">
          <p className="truncate text-[16px] font-medium leading-6 text-ink">{!pinSpot || pinSpot.loading ? 'Finding the address…' : pinSpot.label}</p>
          <h2 id="pin-title" className={`truncate ${secondary}`}>Move the map to set your {field}</h2>
        </div>
        <button type="button" aria-label="Cancel" onClick={() => { setPinMode(null); setPinSpot(null); setSnap('half') }} className={clearButton}><X className="size-4" aria-hidden="true" /></button>
      </div>
      <button type="button" disabled={!pinSpot} onClick={confirmPin} className="press flex h-12 w-full items-center justify-center rounded-[12px] bg-signal text-[17px] font-semibold text-white hover:bg-signal-deep disabled:opacity-45">Confirm {field}</button>
    </section>
  }

  function receiptPanel() {
    if (!receipt) return null
    const cancelled = requestView?.status === 'cancelled' && !requestView.trip
    const title = requestView ? (requestView.trip ? statusLabel(liveState) : cancelled ? 'Ride cancelled' : terminal ? statusLabel(liveState) : 'Finding your driver') : statusError ? 'Status unavailable' : 'Checking…'
    return <section aria-live="polite" aria-labelledby="receipt-title" className="space-y-4 pt-1">
      <div className="space-y-1">
        <p className={secondary}>{requestView?.trip ? 'Your ride is on the way' : 'Your request'}</p>
        <StatusTitle as="h2" id="receipt-title" tone={requestView ? statusTone(liveState) : 'zinc'} pulse={Boolean(requestView) && !terminal} className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{title}</StatusTitle>
        <p className={secondary}><span className="font-medium tabular-nums text-ink">{receipt.requestNumber}</span>{statusAsOf && <> · Updated {statusAsOf}</>}</p>
      </div>
      {requestView?.trip ? <div className="space-y-4 border-t border-border pt-5">
        <TripProgress status={requestView.trip.status} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">Trip</p><p className="font-mono text-lg font-semibold">{requestView.trip.confirmationCode}</p>{requestView.trip.scheduledFor && <p className="text-xs text-muted-foreground">Pickup {new Date(requestView.trip.scheduledFor).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>}</div>
          <RiderButtonLink href={riderStatusHref(requestView.trip.confirmationCode, receipt.requestId)} tone="signal" className="min-h-12 px-6">Track ride<ArrowUpRight className="size-4" aria-hidden="true" /></RiderButtonLink>
        </div>
        {requestView.handoffState === 'reassignment_pending' && <p className="text-sm text-amber-700">Driver cancelled. Finding another driver.</p>}
      </div> : requestView && !terminal && <div className="flex min-h-14 items-center gap-3 rounded-[16px] bg-field px-3"><span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-white"><Search className="size-4 text-signal" aria-hidden="true" /><span className="absolute inset-0 animate-ping rounded-full bg-tide/20 motion-reduce:animate-none" /></span><p className="text-[16px] font-medium text-ink">Matching you with a driver</p></div>}
      {cancelled && <p className={secondary}>No fee charged. No driver had been assigned.</p>}
      {requestView?.handoffState === 'unavailable' && <p className="text-sm text-amber-700">Assignment details unavailable. The operator needs to reconcile this request.</p>}
      {statusError && <p role="status" className="text-sm text-amber-700">{statusError}</p>}
      {error && <p role="alert" className="text-sm text-[#c2412d]">{error}</p>}
      {requestView && !cancelled && <RequestCancellation requestId={receipt.requestId} requestProof={receipt.requestProof} status={requestView.status} onAcknowledged={() => { setRequestView(view => view ? { ...view, status: 'cancelled' } : view); setStatusAsOf(new Date().toLocaleTimeString()); setStatusError('') }} />}
      <RiderTrack className="w-full">
        {terminal && <RiderButton tone="signal" className="press min-h-12 flex-1 rounded-[12px] text-[17px]" onClick={beginAnotherRide}>{cancelled ? 'Book another ride' : 'New ride'}</RiderButton>}
        <RiderButtonLink href="/account/rides" tone={terminal ? 'quiet' : 'raised'} className="press min-h-12 flex-1 rounded-[12px] text-[16px] font-medium">My rides</RiderButtonLink>
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

/** "Today, 10:45", "Tomorrow, 9:00", "Fri 7, 18:30". */
function whenLabel(date: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(date); day.setHours(0, 0, 0, 0)
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000)
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : date.toLocaleDateString([], { weekday: 'short', day: 'numeric' })}, ${time}`
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

function vehicleFor(service: Service, index: number): { kind: 'sedan' | 'suv' | 'van'; tone: 'light' | 'dark' } {
  if (service.wheelchairAccessible) return { kind: 'van', tone: 'light' }
  if (service.passengerCapacity > 4) return { kind: 'suv', tone: 'dark' }
  return { kind: 'sedan', tone: index % 2 ? 'dark' : 'light' }
}

function ServiceList({ services, serviceId, disabled, onChange, loading, name, estimates, pricing, scheduledFor, durationSeconds }: { services: Service[]; serviceId: string; disabled: boolean; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; loading: boolean; name: string; estimates: Map<string, Estimate> | null; pricing: boolean; scheduledFor: string; durationSeconds: number | null }) {
  if (loading && !services.length) return <div className="mt-2 space-y-1" aria-hidden="true">{[0, 1].map(index => <div key={index} className="h-[4.5rem] animate-pulse rounded-[12px] bg-field motion-reduce:animate-none" />)}</div>
  // One fleet runs every ride here, and its name already sits in the header.
  const multiFleet = new Set(services.map(service => service.fleet.name)).size > 1
  return <div className="mt-2 space-y-1" role="radiogroup" aria-label="Ride">
    {services.map((service, index) => {
      const ready = service.readiness?.bookingEnabled === true
      const vehicle = vehicleFor(service, index)
      // Every row is the same height: one-line name, one secondary line, a fixed 72×40 vehicle box on one baseline.
      return <label key={service.id} title={service.title} className="press group flex h-[4.5rem] cursor-pointer items-center gap-2.5 rounded-[12px] px-2 ring-1 ring-transparent transition-[background-color,box-shadow,transform] hover:bg-field has-[:checked]:bg-foam has-[:checked]:ring-tide/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tide has-[:disabled]:cursor-default">
        <input type="radio" name={name} value={service.id} checked={serviceId === service.id} disabled={disabled} onChange={onChange} className="sr-only" />
        <span aria-hidden="true" className="flex h-10 w-[4.5rem] shrink-0 items-end justify-center">
          {service.photoUrl
            ? <img src={service.photoUrl} alt="" loading="lazy" className="h-10 w-[4.5rem] object-contain object-bottom mix-blend-multiply" />
            : <VehicleArt kind={vehicle.kind} tone={vehicle.tone} className="h-10 w-[4.5rem]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2"><span className="truncate text-[16px] font-medium leading-6 text-ink">{service.title}</span>{!ready && <StatusDot tone="amber" />}</span>
          <span className={`flex min-w-0 items-center gap-x-1 ${secondary}`}><Users className="size-3.5 shrink-0 fill-current" aria-hidden="true" /><span className="tabular-nums">{service.passengerCapacity}</span>{multiFleet && <span className="truncate">· {service.fleet.name}</span>}</span>
        </span>
        {(() => {
          const price = estimates?.get(service.id)
          // The trip's own price once the route is known.
          if (price) {
            const arrive = durationSeconds !== null && (!service.advanceBookingMinutes || scheduledFor) ? new Date((scheduledFor ? new Date(scheduledFor).getTime() : Date.now()) + durationSeconds * 1000) : null
            return <span className="shrink-0 text-right"><span className="block text-[16px] font-semibold leading-6 tabular-nums text-ink">{formatMoney(price.totalMinor, price.currencyCode)}</span><span className={`block whitespace-nowrap ${secondary}`}>{arrive ? `Drop-off ${arrive.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : service.advanceBookingMinutes ? `${shortLead(service.advanceBookingMinutes)} ahead` : 'Now'}</span></span>
          }
          if (pricing) return <span aria-label="Pricing" className="h-5 w-14 shrink-0 animate-pulse rounded-[6px] bg-field motion-reduce:animate-none" />
          // No price until there's a trip to price: just how far ahead it books.
          return service.advanceBookingMinutes > 0 && <span className={`shrink-0 whitespace-nowrap text-right ${secondary}`}>{shortLead(service.advanceBookingMinutes)} ahead</span>
        })()}
      </label>
    })}
  </div>
}

function ServiceDetail({ service }: { service: Service }) {
  return <div className="space-y-2 border-t border-border pt-3">
    {service.description && <p className={secondary}>{service.description}</p>}
    {service.publicRegionLabels.length > 0 && <p className={`flex items-start gap-1.5 ${secondary}`}><MapPin className="mt-0.5 size-3.5 shrink-0 text-tide" aria-hidden="true" /><span>Serves {service.publicRegionLabels.join(', ')}</span></p>}
    {service.advanceBookingMinutes > 0 && <p className={secondary}>Book at least {formatLeadTime(service.advanceBookingMinutes)} ahead</p>}
    <ServiceAreaPages serviceId={service.id} />
  </div>
}

function TripProgress({ status }: { status: string }) {
  const current = tripStageIndex(status)
  if (current < 0) return null
  return <ol className="grid grid-cols-5 gap-1" aria-label={`Trip: ${statusLabel(status)}`}>{TRIP_STAGES.map((stage, index) => <li key={stage} aria-current={index === current ? 'step' : undefined} className={`h-1.5 rounded-full ${index <= current ? 'bg-signal' : 'bg-lane'}`}><span className="sr-only">{statusLabel(stage)}</span></li>)}</ol>
}
