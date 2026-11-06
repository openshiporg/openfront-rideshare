'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { gql, QUOTE_FIELDS, SERVICE_FIELDS, whoAmI, type Estimates, type Identity, type LngLat, type Place, type Quote, type Service } from '../lib/api'
import { cityPoint, drivingRoute, locate, placeAt, rememberPlace, useRecentPlaces, type RoutePath } from '../lib/places'
import { clock, formatMoney, minutes } from '../lib/format'
import { storeLogoMark, storeWordmark } from '../lib/store-mark'
import { vehicleArt } from '@/features/lib/vehicles'
import { defaultServiceId, initialFlow, riderFlow } from '../domain/riderFlow'
import { archiveReceipt, parsePendingRequest, parseRiderReceipt, pendingRequestStorageKey, persistPendingRequest, receiptFromFragment, receiptStorageKey, storedReceipt, type RiderReceipt } from '../domain/riderReceiptStorage'
import { isQuoteResponse } from '../domain/quoteResponse'
import type { QuoteBinding } from '../domain/quoteBinding'
import { RiderMap } from '../components/RiderMap'
import { PlanRide } from '../components/PlanRide'
import { RidePanel, type RideInfo } from '../components/RidePanel'
import { RiderMenu } from '../components/RiderMenu'
import { WhenPanel, WhenSwitch } from '../components/WhenPanel'
import { cardName, useSavedCard } from '../components/SavedCard'
import { Button, DropoffMark, Icon, MapButton, PickupMark, Sheet, Spinner, VehicleArt, cx } from '../components/ui'

type Binding = QuoteBinding<Quote>

/**
 * The rider app: one screen, one map, one sheet that changes with the ride.
 * Pickup is where you are, the time is Now, and after the destination one tap requests the ride.
 */
export default function RiderApp({ initialRide, initialServiceId }: { initialRide?: { code: string; requestId?: string }; initialServiceId?: string }) {
  const router = useRouter()
  const [flow, dispatch] = useReducer(riderFlow, initialFlow)
  const [services, setServices] = useState<Service[] | null>(null)
  const [servicesError, setServicesError] = useState(false)
  const [identity, setIdentity] = useState<Identity>(null)
  const [user, setUser] = useState<LngLat | null>(null)
  const [locating, setLocating] = useState(false)
  const [estimates, setEstimates] = useState<{ key: string; value: Estimates } | null>(null)
  const [route, setRoute] = useState<RoutePath | null>(null)
  const [sheet, setSheet] = useState(320)
  const [whenOpen, setWhenOpen] = useState(false)
  const [pinPlace, setPinPlace] = useState<Place | null>(null)
  const [pinBusy, setPinBusy] = useState(false)
  const [rideInfo, setRideInfo] = useState<RideInfo | null>(null)
  const [pendingBinding, setPendingBinding] = useState<Binding | null>(null)
  const [resolving, setResolving] = useState(false)
  const inFlight = useRef(false)
  const recents = useRecentPlaces()
  const saved = useSavedCard(Boolean(identity))

  const fleet = services?.find(s => s.fleet)?.fleet || null
  const fleetName = fleet?.name || 'Rideshare'

  // Start-up: rides, who is signed in, and any ride this tab already has.
  useEffect(() => {
    let active = true
    gql<{ marketplaceRideshareServices: Service[] }>(`query RiderServices { marketplaceRideshareServices(limit: 12) { ${SERVICE_FIELDS} } }`)
      .then(data => { if (active) setServices(data.marketplaceRideshareServices || []) })
      .catch(() => { if (active) { setServices([]); setServicesError(true) } })
    whoAmI().then(found => { if (active) setIdentity(found) }).catch(() => {})
    try {
      const emailed = receiptFromFragment(window.location.hash)
      if (emailed) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
        if (!sessionStorage.getItem(receiptStorageKey)) sessionStorage.setItem(receiptStorageKey, JSON.stringify(emailed))
      }
    } catch { /* a malformed link is ignored */ }
    if (initialRide) {
      void (async () => {
        let receipt: RiderReceipt | null = null
        try { receipt = storedReceipt(sessionStorage, initialRide.requestId) } catch { /* the account may still own it */ }
        let requestId = initialRide.requestId || receipt?.requestId || null
        if (!requestId) {
          const data = await gql<{ publicRideshareTrip: { requestId: string } | null }>('query TripRequest($code: String!) { publicRideshareTrip(confirmationCode: $code) { requestId } }', { code: initialRide.code }).catch(() => null)
          requestId = data?.publicRideshareTrip?.requestId || null
        }
        if (active) dispatch({ type: 'resume', receipt: receipt?.requestId === requestId ? receipt : null, requestId: requestId || 'unknown', tripCode: initialRide.code })
      })()
    } else {
      try {
        const saved = parseRiderReceipt(sessionStorage.getItem(receiptStorageKey))
        if (saved) dispatch({ type: 'resume', receipt: saved, requestId: saved.requestId })
        else {
          const pending = parsePendingRequest<Quote>(sessionStorage.getItem(pendingRequestStorageKey))
          if (pending) { setPendingBinding(pending); dispatch({ type: 'restorePending' }) }
        }
      } catch { /* unreadable storage: start fresh, the server still has the ride under My rides */ }
    }
    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Pickup = the fleet's city until the rider's own location arrives (asked once, like the apps do).
  useEffect(() => {
    if (!fleet?.publicCity) return
    let active = true
    cityPoint(fleet.publicCity).then(point => {
      if (active && point) dispatch({ type: 'located', source: 'city', place: { label: fleet.publicCity!, name: fleet.publicCity!, detail: 'City centre', point } })
    })
    return () => { active = false }
  }, [fleet?.publicCity])
  const findMe = useCallback(async (andPick = false) => {
    setLocating(true)
    const point = await locate()
    setLocating(false)
    if (!point) return false
    setUser(point)
    const place = await placeAt(point)
    const resolved: Place = place ? { ...place, point } : { label: `Current location (${point[1].toFixed(4)}, ${point[0].toFixed(4)})`, name: 'Current location', detail: '', point }
    if (andPick) dispatch({ type: 'pick', field: 'pickup', place: resolved })
    else dispatch({ type: 'located', source: 'gps', place: resolved })
    return true
  }, [])
  useEffect(() => { void findMe() }, [findMe])

  // Route and every ride's price once both ends are known.
  const tripKey = flow.pickup && flow.dropoff ? `${flow.pickup.point.join()};${flow.dropoff.point.join()}` : ''
  useEffect(() => {
    if (!tripKey || !flow.pickup || !flow.dropoff) { setRoute(null); return }
    const controller = new AbortController()
    void drivingRoute(flow.pickup.point, flow.dropoff.point, controller.signal).then(path => { if (!controller.signal.aborted) setRoute(path) })
    gql<{ marketplaceRideshareEstimates: Estimates }>('query Estimates($from: JSON!, $to: JSON!) { marketplaceRideshareEstimates(pickupPoint: $from, dropoffPoint: $to) { distanceMeters durationSeconds options { serviceId totalMinor currencyCode } } }', { from: flow.pickup.point, to: flow.dropoff.point }, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setEstimates({ key: tripKey, value: data.marketplaceRideshareEstimates }) })
      .catch(() => { if (!controller.signal.aborted) setEstimates(null) })
    return () => controller.abort()
  }, [tripKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const liveEstimates = estimates?.key === tripKey ? estimates.value : null
  const priceOf = useCallback((id: string) => liveEstimates?.options.find(option => option.serviceId === id)?.totalMinor ?? null, [liveEstimates])

  // The ride list, cheapest first; the everyday ride is preselected.
  const rides = useMemo(() => [...(services || [])].sort((a, b) => Number(!a.readiness?.bookingEnabled) - Number(!b.readiness?.bookingEnabled) || (priceOf(a.id) ?? a.startingFareMinor ?? Infinity) - (priceOf(b.id) ?? b.startingFareMinor ?? Infinity)), [services, priceOf])
  useEffect(() => {
    if (!services?.length || flow.serviceId) return
    const preferred = initialServiceId && services.some(s => s.id === initialServiceId) ? initialServiceId : defaultServiceId(services, id => priceOf(id) ?? services.find(s => s.id === id)?.startingFareMinor ?? null)
    if (preferred) dispatch({ type: 'selectService', serviceId: preferred })
  }, [services, flow.serviceId, initialServiceId, priceOf])
  const selected = services?.find(s => s.id === flow.serviceId) || null

  async function request() {
    if (inFlight.current || flow.phase.name !== 'choose' || !selected || !flow.pickup || !flow.dropoff) return
    if (!selected.readiness?.bookingEnabled) { dispatch({ type: 'requestFailed', error: selected.readiness?.reason || 'This ride can’t be requested right now.' }); return }
    inFlight.current = true
    dispatch({ type: 'request' })
    const inputs = { serviceId: selected.id, pickupLabel: flow.pickup.label.slice(0, 200), dropoffLabel: flow.dropoff.label.slice(0, 200), scheduledFor: flow.when || '', passengerCount: '1', wheelchairAccessible: selected.wheelchairAccessible }
    let binding: Binding
    try {
      const data = await gql<{ marketplaceRideshareQuote: Quote }>(`mutation Quote($serviceId: ID!, $pickup: String!, $dropoff: String!, $from: JSON, $to: JSON, $when: DateTime, $wheelchair: Boolean) { marketplaceRideshareQuote(serviceId: $serviceId, pickupLabel: $pickup, dropoffLabel: $dropoff, pickupPoint: $from, dropoffPoint: $to, scheduledFor: $when, passengerCount: 1, wheelchairAccessible: $wheelchair) { ${QUOTE_FIELDS} } }`,
        { serviceId: inputs.serviceId, pickup: inputs.pickupLabel, dropoff: inputs.dropoffLabel, from: flow.pickup.point, to: flow.dropoff.point, when: flow.when, wheelchair: inputs.wheelchairAccessible })
      if (!isQuoteResponse(data.marketplaceRideshareQuote)) throw new Error('The price couldn’t be confirmed. Try again.')
      binding = { quote: data.marketplaceRideshareQuote, inputs, generation: 1 }
    } catch (cause) {
      inFlight.current = false
      dispatch({ type: 'requestFailed', error: cause instanceof Error && cause.message !== 'Request failed' ? cause.message : 'The price couldn’t be confirmed. Try again.' })
      return
    }
    // The request intent is saved before it is sent, so a lost answer is recovered, never re-sent.
    try { persistPendingRequest(sessionStorage, binding) } catch {
      inFlight.current = false
      dispatch({ type: 'requestFailed', error: 'This browser couldn’t save your request, so nothing was sent.' })
      return
    }
    setPendingBinding(binding)
    try {
      const data = await gql<{ requestRide: RiderReceipt }>('mutation Request($quoteId: ID!, $proof: String!, $needs: JSON!) { requestRide(quoteId: $quoteId, quoteProof: $proof, passengerCount: 1, accessibilityNeeds: $needs) { requestId requestNumber status requestProof replayed } }',
        { quoteId: binding.quote.quoteId, proof: binding.quote.quoteProof, needs: { wheelchairAccessible: inputs.wheelchairAccessible } }, { timeoutMs: 20_000 })
      const receipt = parseRiderReceipt(JSON.stringify(data.requestRide))
      if (!receipt) throw new Error('Incomplete receipt')
      keepReceipt(receipt)
      rememberPlace(flow.dropoff)
      dispatch({ type: 'requested', receipt })
    } catch {
      dispatch({ type: 'requestUncertain' })
    } finally { inFlight.current = false }
  }

  function keepReceipt(receipt: RiderReceipt) {
    try {
      archiveReceipt(sessionStorage, receipt)
      const serialized = JSON.stringify(receipt)
      sessionStorage.setItem(receiptStorageKey, serialized)
      if (sessionStorage.getItem(receiptStorageKey) === serialized) sessionStorage.removeItem(pendingRequestStorageKey)
    } catch { /* the ride is live on the server; this tab keeps it in memory */ }
    setPendingBinding(null)
  }

  async function resolvePending() {
    const binding = pendingBinding
    if (!binding || resolving) return
    setResolving(true)
    try {
      const data = await gql<{ resolveRideRequestIntent: { quoteId: string; kind: string; receipt: RiderReceipt | null } }>('mutation Resolve($quoteId: ID!, $proof: String!, $passengers: Int!, $needs: JSON!) { resolveRideRequestIntent(quoteId: $quoteId, quoteProof: $proof, passengerCount: $passengers, accessibilityNeeds: $needs) { quoteId kind receipt { requestId requestNumber status requestProof replayed } } }',
        { quoteId: binding.quote.quoteId, proof: binding.quote.quoteProof, passengers: Number(binding.inputs.passengerCount) || 1, needs: { wheelchairAccessible: binding.inputs.wheelchairAccessible } })
      const result = data.resolveRideRequestIntent
      if (result?.quoteId !== binding.quote.quoteId) throw new Error()
      if (result.kind === 'request') {
        const receipt = parseRiderReceipt(JSON.stringify(result.receipt))
        if (!receipt) throw new Error()
        keepReceipt(receipt)
        dispatch({ type: 'resolved', receipt })
      } else if (result.kind === 'closed_unused') {
        sessionStorage.removeItem(pendingRequestStorageKey)
        setPendingBinding(null)
        dispatch({ type: 'resolved', receipt: null })
      } else throw new Error()
    } catch { /* still unknown: the button stays */ }
    finally { setResolving(false) }
  }

  function rideOver() {
    try { sessionStorage.removeItem(receiptStorageKey) } catch { /* nothing to clear */ }
    setRideInfo(null)
    dispatch({ type: 'rideOver' })
    if (initialRide) router.replace('/')
  }

  // Set location on map: the address under the pin once the map settles.
  const pinField = flow.phase.name === 'pin' ? flow.phase.field : null
  const pinRequest = useRef(0)
  const onPinMove = useCallback((point: LngLat) => {
    const id = ++pinRequest.current
    setPinBusy(true)
    void placeAt(point).then(place => {
      if (id !== pinRequest.current) return
      setPinPlace(place || { label: `Dropped pin (${point[1].toFixed(4)}, ${point[0].toFixed(4)})`, name: 'Dropped pin', detail: `${point[1].toFixed(5)}, ${point[0].toFixed(5)}`, point })
      setPinBusy(false)
    })
  }, [])
  useEffect(() => { if (!pinField) { setPinPlace(null); setPinBusy(false) } }, [pinField])

  // What the map shows in each state.
  const phase = flow.phase.name
  const inRide = phase === 'ride'
  const mapPickup = inRide ? (rideInfo?.pickup ? { point: rideInfo.pickup } : flow.pickup ? { point: flow.pickup.point } : null) : flow.pickup ? { point: flow.pickup.point } : null
  const mapDropoff = inRide ? (rideInfo?.dropoff ? { point: rideInfo.dropoff } : flow.dropoff ? { point: flow.dropoff.point } : null) : (phase === 'home' ? null : flow.dropoff ? { point: flow.dropoff.point } : null)
  const [rideRoute, setRideRoute] = useState<LngLat[] | null>(null)
  useEffect(() => {
    if (!inRide || !rideInfo?.pickup || !rideInfo.dropoff) { setRideRoute(null); return }
    const controller = new AbortController()
    void drivingRoute(rideInfo.pickup, rideInfo.dropoff, controller.signal).then(path => { if (!controller.signal.aborted) setRideRoute(path?.coordinates || null) })
    return () => controller.abort()
  }, [inRide, rideInfo?.pickup?.join(), rideInfo?.dropoff?.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const mapRoute = inRide ? rideRoute : phase === 'home' ? null : route?.coordinates || null
  const searching = inRide && (rideInfo?.stage === 'finding' || rideInfo?.stage === 'reassigning')
  const near = flow.pickup?.point || user

  const tripSeconds = liveEstimates?.durationSeconds ?? route?.durationSeconds ?? null
  const dropoffAt = (seconds: number | null) => seconds == null ? null : clock(new Date((flow.when ? Date.parse(flow.when) : Date.now()) + seconds * 1000))

  return <div className="rider fixed inset-0 overflow-hidden bg-paper text-ink">
    <RiderMap user={user} pickup={mapPickup} dropoff={mapDropoff} route={mapRoute} bottom={phase === 'search' ? 0 : sheet} pin={pinField} searching={searching} onPinMove={onPinMove} />

    {/* Top bar over the map. */}
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] lg:px-6 lg:pt-5">
      <div className="pointer-events-auto">
        {phase === 'choose' || phase === 'pin'
          ? <MapButton aria-label="Back" onClick={() => dispatch({ type: 'back' })}><Icon.back className="size-5" /></MapButton>
          : <Link href="/" aria-label={fleetName} className="press flex h-11 max-w-[60vw] items-center gap-2 rounded-[14px] bg-white pl-2.5 pr-3.5 shadow-[0_1px_0_rgba(16,35,31,0.06),0_6px_16px_-6px_rgba(16,35,31,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-tide">
            <img alt="" src={`data:image/svg+xml,${encodeURIComponent(storeLogoMark(fleet?.logoIcon))}`} style={{ filter: `hue-rotate(${Number(fleet?.logoColor) || 0}deg)` }} className="h-7 w-6 shrink-0 object-contain" />
            <span className="display truncate text-[19px] font-bold leading-none">{storeWordmark(fleetName)}</span>
          </Link>}
      </div>
      <div className="pointer-events-auto"><RiderMenu identity={identity} fleetName={fleetName} /></div>
    </div>

    {phase === 'search' && <PlanRide field={flow.phase.name === 'search' ? flow.phase.field : 'dropoff'} pickup={flow.pickup} pickupIsGps={flow.pickupSource === 'gps'} dropoff={flow.dropoff} near={near} when={flow.when}
      onNow={() => dispatch({ type: 'setWhen', when: null })} onWhen={() => setWhenOpen(true)} onPick={(field, place) => dispatch({ type: 'pick', field, place })} onField={field => dispatch({ type: 'openSearch', field })}
      onSetOnMap={field => dispatch({ type: 'setOnMap', field })} onBack={() => dispatch({ type: 'back' })} onUseLocation={() => { void findMe(true) }} locating={locating} />}

    {whenOpen && phase !== 'ride' && <div className="fixed inset-0 z-50 flex items-end bg-ink/40 fade-in lg:items-center lg:justify-center" onPointerDown={event => { if (event.target === event.currentTarget) setWhenOpen(false) }}>
      <div role="dialog" aria-modal="true" aria-label="Schedule a pickup" className="sheet-in w-full rounded-t-[28px] bg-paper pb-[max(env(safe-area-inset-bottom),12px)] pt-4 lg:max-w-[460px] lg:rounded-[28px]">
        <WhenPanel when={flow.when} leadMinutes={selected?.advanceBookingMinutes ?? 0} onCancel={() => setWhenOpen(false)} onDone={when => { dispatch({ type: 'setWhen', when }); setWhenOpen(false) }} />
      </div>
    </div>}

    {phase === 'home' && <Sheet key="home" label="Where to" onHeight={setSheet}>
      <div className="px-4 pb-2 pt-1">
        <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_1px_0_rgba(16,35,31,0.04)] ring-1 ring-rule">
          <button type="button" onClick={() => dispatch({ type: 'openSearch', field: 'pickup' })} className="press flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left outline-none focus-visible:bg-tide-soft">
            <PickupMark />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-ink-3">Pickup</span>
              <span className="block truncate text-[15px] font-medium">{flow.pickup ? `${flow.pickupSource === 'gps' ? flow.pickup.label : flow.pickup.name}${flow.pickupSource === 'city' ? ' · set your exact spot' : ''}` : locating ? 'Finding your location…' : 'Choose pickup'}</span>
            </span>
            {locating && !flow.pickup ? <Spinner className="size-4 text-tide" /> : <Icon.chevronRight className="size-4 shrink-0 text-ink-3" />}
          </button>
          <span aria-hidden="true" className="ml-[21px] block h-0 border-t border-dashed border-rule" />
          <button type="button" onClick={() => dispatch({ type: 'openSearch', field: 'dropoff' })} className="press flex min-h-16 w-full items-center gap-3 px-4 text-left outline-none focus-visible:bg-tide-soft">
            <DropoffMark />
            <span className="display min-w-0 flex-1 truncate text-[22px] font-bold">Where to?</span>
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-tide text-white"><Icon.search className="size-[18px]" /></span>
          </button>
        </div>
        <WhenSwitch className="mt-3" when={flow.when} onNow={() => dispatch({ type: 'setWhen', when: null })} onSchedule={() => setWhenOpen(true)} />
        {recents.length > 0 && <ul className="mt-2">
          {recents.slice(0, 3).map(place => <li key={place.label}>
            <button type="button" onClick={() => dispatch({ type: 'pick', field: 'dropoff', place })} className="press flex min-h-14 w-full items-center gap-3 rounded-[14px] px-1 py-1.5 text-left outline-none hover:bg-white focus-visible:bg-white">
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-tide-soft text-tide"><Icon.history className="size-[18px]" /></span>
              <span className="min-w-0"><span className="block truncate text-[15px] font-semibold">{place.name}</span><span className="block truncate text-[13px] text-ink-3">{place.detail}</span></span>
            </button>
          </li>)}
        </ul>}
        {servicesError && <p role="alert" className="mt-2 text-[14px] text-alert">Rides are unavailable right now. Try again shortly.</p>}
      </div>
    </Sheet>}

    {phase === 'pin' && <Sheet key="pin" label="Set location on map" onHeight={setSheet}>
      <div className="px-4 pb-2 pt-2">
        <h2 className="display text-[22px] font-bold">{pinField === 'pickup' ? 'Set your pickup spot' : 'Set your destination'}</h2>
        <p className="mt-0.5 text-[14px] text-ink-2">Drag the map to move the pin</p>
        <div className="mt-3 flex min-h-14 items-center gap-3 rounded-[16px] bg-white px-4 ring-1 ring-rule">
          {pinField === 'pickup' ? <PickupMark /> : <DropoffMark />}
          <span className="min-w-0 flex-1 truncate text-[16px] font-medium">{pinBusy || !pinPlace ? 'Finding address…' : pinPlace.label}</span>
          {pinBusy && <Spinner className="size-4" />}
        </div>
        <Button size="lg" className="mt-3 w-full" disabled={!pinPlace || pinBusy} onClick={() => pinPlace && pinField && dispatch({ type: 'pick', field: pinField, place: pinPlace })}>{pinField === 'pickup' ? 'Confirm pickup' : 'Confirm destination'}</Button>
      </div>
    </Sheet>}

    {(phase === 'choose' || phase === 'requesting') && <Sheet key="choose" label="Choose a ride" onHeight={setSheet}>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-1">
        <h2 className="display truncate text-[22px] font-bold">{phase === 'requesting' ? `Requesting ${selected?.title || 'your ride'}…` : 'Choose a ride'}</h2>
        {tripSeconds != null && <span className="shrink-0 text-[13px] font-semibold text-ink-2">{minutes(tripSeconds)} trip</span>}
      </div>
      <RideTiles count={rides.length}>
        {services === null && <li className="col-span-2 flex items-center gap-3 py-6 text-[15px]"><Spinner className="size-4 text-tide" />Loading rides…</li>}
        {rides.map((service, index) => {
          const price = priceOf(service.id)
          const bookable = Boolean(service.readiness?.bookingEnabled)
          const active = service.id === flow.serviceId
          const at = dropoffAt(tripSeconds)
          return <li key={service.id} className="tile-in" style={{ animationDelay: `${index * 40}ms` }}>
            <button type="button" role="radio" aria-checked={active} disabled={!bookable || phase === 'requesting'} onClick={() => dispatch({ type: 'selectService', serviceId: service.id })}
              className={cx('press flex h-full min-h-[104px] w-full flex-col rounded-[20px] px-3 pb-2.5 pt-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
                active ? 'bg-tide text-white shadow-[0_8px_20px_-10px_rgba(15,92,85,0.8)]' : 'bg-white text-ink ring-1 ring-inset ring-rule hover:ring-[#cfc9ba]', !bookable && 'opacity-50')}>
              <span className="flex items-start justify-between gap-2">
                <VehicleArt src={vehicleArt(service.category, { seats: service.passengerCapacity, wheelchair: service.wheelchairAccessible })} className="h-8 w-11" />
                <span className={cx('display text-[18px] font-bold leading-6 tabular-nums', active ? 'text-white' : 'text-ink')}>{price != null && service.currencyCode ? formatMoney(price, service.currencyCode) : liveEstimates ? '—' : <span className={cx('inline-block h-4 w-12 animate-pulse rounded motion-reduce:animate-none', active ? 'bg-white/30' : 'bg-tide-soft')} />}</span>
              </span>
              <span className="mt-auto pt-1.5 text-[15px] font-semibold leading-5 [overflow-wrap:anywhere] line-clamp-2">{service.title}</span>
              <span className={cx('mt-1 flex min-w-0 items-center gap-2 text-[12px] font-medium', active ? 'text-white/85' : 'text-ink-3')}>
                <span className="inline-flex shrink-0 items-center gap-0.5"><Icon.person className="size-3.5" />{service.passengerCapacity}</span>
                {service.wheelchairAccessible && <Icon.wheelchair className="size-3.5 shrink-0" />}
                <span className="truncate">{bookable ? (at ? `Arrive ${at}` : service.description || '') : service.readiness?.reason || 'Not available now'}</span>
              </span>
            </button>
          </li>
        })}
      </RideTiles>
      <div className="mt-2 px-4 pt-1">
        <WhenSwitch when={flow.when} onNow={() => dispatch({ type: 'setWhen', when: null })} onSchedule={() => setWhenOpen(true)} />
        <p className="mt-2 flex min-h-6 items-center gap-2 text-[13px] text-ink-2"><Icon.card className="size-4 shrink-0" /><span className="truncate">{saved.card ? `${cardName(saved.card)} · charged after the ride` : identity ? 'Card, after your driver is assigned' : 'Pay after your driver is assigned'}</span></p>
        {flow.error && <p role="alert" className="pb-1 text-[14px] text-alert">{flow.error}</p>}
        <Button size="lg" className="mt-2 w-full" disabled={!selected || phase === 'requesting' || !selected.readiness?.bookingEnabled} onClick={() => void request()}>
          {phase === 'requesting' ? <><Spinner className="size-5" />Requesting…</> : <span className="truncate">{`${flow.when ? 'Schedule' : 'Request'} ${selected?.title || 'ride'}`}</span>}
        </Button>
      </div>
    </Sheet>}

    {phase === 'unconfirmed' && <Sheet key="unconfirmed" label="Request status" onHeight={setSheet}>
      <div className="px-4 pb-2 pt-2">
        <h2 className="display text-[22px] font-bold">Checking your request</h2>
        <p className="mt-1 text-[15px] text-ink-2">The connection dropped before we heard back. Check it before requesting again, so you aren’t booked twice.</p>
        <Button size="lg" className="mt-4 w-full" disabled={resolving || !pendingBinding} onClick={() => void resolvePending()}>{resolving ? <><Spinner className="size-5" />Checking…</> : 'Check request'}</Button>
      </div>
    </Sheet>}

    {inRide && flow.phase.name === 'ride' && <Sheet key={`ride-${flow.phase.requestId}`} label="Your ride" onHeight={setSheet}>
      <RidePanel requestId={flow.phase.requestId} receipt={flow.phase.receipt} identity={identity} fleetName={fleetName} onInfo={setRideInfo} onDone={rideOver} fallbackService={selected?.title || null}
        fallbackFare={selected && priceOf(selected.id) != null && selected.currencyCode ? formatMoney(priceOf(selected.id), selected.currencyCode) : null} />
    </Sheet>}
  </div>
}

/** The ride tiles. All of them fit on a phone; when a short screen (or a long list) can't show them all, the
 * list scrolls, fades at the cut edge and says how many more there are, so a tile is never silently clipped. */
function RideTiles({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null)
  const [hidden, setHidden] = useState(0)
  useLayoutEffect(() => {
    const list = ref.current
    if (!list) return
    const measure = () => {
      const bottom = list.getBoundingClientRect().bottom - 2
      setHidden(Array.from(list.children).filter(item => item.getBoundingClientRect().top > bottom - 24).length)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    list.addEventListener('scroll', measure, { passive: true })
    return () => { observer.disconnect(); list.removeEventListener('scroll', measure) }
  }, [count])
  return <div className="relative flex min-h-0 shrink flex-col">
    <ul ref={ref} role="radiogroup" aria-label="Rides" className={cx('mt-3 grid max-h-[48dvh] min-h-[112px] shrink grid-cols-2 gap-2 overflow-y-auto overscroll-contain px-4 pb-1', hidden > 0 && '[mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)]')}>{children}</ul>
    {hidden > 0 && <button type="button" onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.8, behavior: reduced() ? 'auto' : 'smooth' })}
      className="press absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-ink shadow-[0_2px_8px_-2px_rgba(16,35,31,0.35)] ring-1 ring-rule">
      {hidden} more {hidden === 1 ? 'ride' : 'rides'}<Icon.chevronDown className="ml-1 inline size-3.5" />
    </button>}
  </div>
}
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
