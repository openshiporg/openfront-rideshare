'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { gql, QUOTE_FIELDS, SERVICE_FIELDS, whoAmI, type Estimates, type Identity, type LngLat, type Place, type Quote, type Service } from '../lib/api'
import { cityPoint, drivingRoute, locate, placeAt, recentPlaces, rememberPlace, type RoutePath } from '../lib/places'
import { clock, formatMoney, minutes, shortPlace } from '../lib/format'
import { storeLogoMark, storeWordmark } from '../lib/store-mark'
import { defaultServiceId, initialFlow, riderFlow } from '../domain/riderFlow'
import { archiveReceipt, parsePendingRequest, parseRiderReceipt, pendingRequestStorageKey, persistPendingRequest, receiptFromFragment, receiptStorageKey, storedReceipt, type RiderReceipt } from '../domain/riderReceiptStorage'
import { isQuoteResponse } from '../domain/quoteResponse'
import type { QuoteBinding } from '../domain/quoteBinding'
import { RiderMap } from '../components/RiderMap'
import { PlanRide } from '../components/PlanRide'
import { RidePanel, type RideInfo } from '../components/RidePanel'
import { RiderMenu } from '../components/RiderMenu'
import { WhenButton, WhenPanel } from '../components/WhenPanel'
import { Button, CarGlyph, Icon, MapButton, Sheet, Spinner, cx } from '../components/ui'

type Binding = QuoteBinding<Quote>

/**
 * The rider app: one screen, one map, one sheet that changes with the ride (Uber/Lyft).
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

  return <div className="rider fixed inset-0 overflow-hidden bg-white text-black">
    <RiderMap user={user} pickup={mapPickup} dropoff={mapDropoff} route={mapRoute} bottom={phase === 'search' ? 0 : sheet} pin={pinField} searching={searching} onPinMove={onPinMove} />

    {/* Top bar over the map. */}
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] lg:px-6 lg:pt-5">
      <div className="pointer-events-auto">
        {phase === 'choose' || phase === 'pin'
          ? <MapButton aria-label="Back" onClick={() => dispatch({ type: 'back' })}><Icon.back className="size-5" /></MapButton>
          : <Link href="/" aria-label={fleetName} className="press flex h-11 max-w-[60vw] items-center gap-2 rounded-full bg-white pl-3 pr-4 shadow-[0_2px_10px_rgba(0,0,0,0.18)] outline-none focus-visible:ring-2 focus-visible:ring-black">
            <img alt="" src={`data:image/svg+xml,${encodeURIComponent(storeLogoMark(fleet?.logoIcon))}`} className="size-6 shrink-0 object-contain brightness-0" />
            <span className="truncate text-[17px] font-bold tracking-[-0.01em]">{storeWordmark(fleetName)}</span>
          </Link>}
      </div>
      <div className="pointer-events-auto"><RiderMenu identity={identity} fleetName={fleetName} /></div>
    </div>

    {phase === 'search' && <PlanRide field={flow.phase.name === 'search' ? flow.phase.field : 'dropoff'} pickup={flow.pickup} pickupIsGps={flow.pickupSource === 'gps'} dropoff={flow.dropoff} near={near} when={flow.when}
      onWhen={() => setWhenOpen(true)} onPick={(field, place) => dispatch({ type: 'pick', field, place })} onField={field => dispatch({ type: 'openSearch', field })}
      onSetOnMap={field => dispatch({ type: 'setOnMap', field })} onBack={() => dispatch({ type: 'back' })} onUseLocation={() => { void findMe(true) }} locating={locating} />}

    {whenOpen && phase !== 'ride' && <div className="fixed inset-0 z-50 flex items-end bg-black/40 fade-in lg:items-center lg:justify-center" onPointerDown={event => { if (event.target === event.currentTarget) setWhenOpen(false) }}>
      <div role="dialog" aria-modal="true" aria-label="Pickup time" className="sheet-in w-full rounded-t-[20px] bg-white pb-[max(env(safe-area-inset-bottom),16px)] pt-3 lg:max-w-[440px] lg:rounded-2xl">
        <WhenPanel when={flow.when} leadMinutes={selected?.advanceBookingMinutes ?? 0} onCancel={() => setWhenOpen(false)} onDone={when => { dispatch({ type: 'setWhen', when }); setWhenOpen(false) }} />
      </div>
    </div>}

    {phase === 'home' && <Sheet key="home" label="Where to" onHeight={setSheet}>
      <div className="px-4 pb-2 pt-2">
        <div className="flex h-14 items-center gap-2 rounded-full bg-[#eeeeee] pl-5 pr-1.5">
          <button type="button" onClick={() => dispatch({ type: 'openSearch', field: 'dropoff' })} className="flex h-full min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:underline">
            <Icon.search className="size-[22px] shrink-0" /><span className="truncate text-[19px] font-semibold">Where to?</span>
          </button>
          <WhenButton when={flow.when} onClick={() => setWhenOpen(true)} />
        </div>
        <button type="button" onClick={() => dispatch({ type: 'openSearch', field: 'pickup' })} className="press mt-2 flex min-h-11 w-full items-center gap-3 px-1 text-left text-[15px] outline-none focus-visible:bg-black/5">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-black" />
          <span className="min-w-0 flex-1 truncate"><span className="text-[#6b6b6b]">Pickup · </span>{flow.pickupSource === 'gps' ? shortPlace(flow.pickup?.label) || 'Current location' : flow.pickup ? `${flow.pickup.name}${flow.pickupSource === 'city' ? ' (set your exact spot)' : ''}` : locating ? 'Finding your location…' : 'Choose pickup'}</span>
          <Icon.chevronRight className="size-4 shrink-0 text-[#9a9a9a]" />
        </button>
        <ul className="mt-1">
          {recentPlaces().slice(0, 3).map(place => <li key={place.label} className="border-t border-[#eeeeee]">
            <button type="button" onClick={() => dispatch({ type: 'pick', field: 'dropoff', place })} className="press flex min-h-[60px] w-full items-center gap-4 py-2 text-left outline-none focus-visible:bg-black/5">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eeeeee]"><Icon.history className="size-[18px]" /></span>
              <span className="min-w-0"><span className="block truncate text-[16px] font-medium">{place.name}</span><span className="block truncate text-[14px] text-[#6b6b6b]">{place.detail}</span></span>
            </button>
          </li>)}
        </ul>
        {servicesError && <p role="alert" className="mt-2 text-[14px] text-[#c4160d]">Rides are unavailable right now. Try again shortly.</p>}
      </div>
    </Sheet>}

    {phase === 'pin' && <Sheet key="pin" label="Set location on map" onHeight={setSheet}>
      <div className="px-4 pb-2 pt-2">
        <h2 className="text-center text-[18px] font-bold">{pinField === 'pickup' ? 'Set your pickup spot' : 'Set your destination'}</h2>
        <p className="mt-1 text-center text-[14px] text-[#6b6b6b]">Drag the map to move the pin</p>
        <div className="mt-3 flex min-h-12 items-center gap-3 rounded-xl bg-[#f3f3f3] px-4">
          <span aria-hidden="true" className={cx('size-2.5 shrink-0 bg-black', pinField === 'pickup' && 'rounded-full')} />
          <span className="min-w-0 flex-1 truncate text-[16px]">{pinBusy || !pinPlace ? 'Finding address…' : pinPlace.name}</span>
          {pinBusy && <Spinner className="size-4" />}
        </div>
        <Button size="lg" className="mt-3 w-full" disabled={!pinPlace || pinBusy} onClick={() => pinPlace && pinField && dispatch({ type: 'pick', field: pinField, place: pinPlace })}>{pinField === 'pickup' ? 'Confirm pickup' : 'Confirm destination'}</Button>
      </div>
    </Sheet>}

    {(phase === 'choose' || phase === 'requesting') && <Sheet key="choose" label="Choose a ride" onHeight={setSheet}>
      <h2 className="px-4 pt-1 text-center text-[18px] font-bold">{phase === 'requesting' ? `Requesting ${selected?.title || 'your ride'}…` : 'Choose a ride'}</h2>
      <ul role="radiogroup" aria-label="Rides" className="mt-2 max-h-[34dvh] min-h-0 overflow-y-auto px-2 lg:max-h-[44dvh]">
        {services === null && <li className="flex items-center gap-3 px-3 py-6 text-[15px]"><Spinner className="size-4" />Loading rides…</li>}
        {rides.map(service => {
          const price = priceOf(service.id)
          const bookable = Boolean(service.readiness?.bookingEnabled)
          const active = service.id === flow.serviceId
          const at = dropoffAt(tripSeconds)
          return <li key={service.id}>
            <button type="button" role="radio" aria-checked={active} disabled={!bookable || phase === 'requesting'} onClick={() => dispatch({ type: 'selectService', serviceId: service.id })}
              className={cx('press flex min-h-[72px] w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-black', active ? 'ring-2 ring-black' : 'hover:bg-black/[0.03]', !bookable && 'opacity-45')}>
              {service.photoUrl ? <img src={service.photoUrl} alt="" className="h-12 w-[72px] shrink-0 object-contain" /> : <CarGlyph seats={service.passengerCapacity} className="h-12 w-[72px] shrink-0" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[17px] font-semibold"><span className="truncate">{service.title}</span><span className="inline-flex shrink-0 items-center gap-0.5 text-[14px] font-medium"><Icon.person className="size-3.5" />{service.passengerCapacity}</span>{service.wheelchairAccessible && <Icon.wheelchair className="size-4 shrink-0" />}</span>
                <span className="block truncate text-[14px] text-[#5e5e5e]">{bookable ? [at ? `Drop-off ${at}` : null, tripSeconds != null ? minutes(tripSeconds) : null].filter(Boolean).join(' · ') || service.description : service.readiness?.reason || 'Not available right now'}</span>
              </span>
              <span className="shrink-0 text-right text-[17px] font-semibold tabular-nums">{price != null && service.currencyCode ? formatMoney(price, service.currencyCode) : liveEstimates ? '—' : <span className="inline-block h-4 w-14 animate-pulse rounded bg-[#eeeeee] motion-reduce:animate-none" />}</span>
            </button>
          </li>
        })}
      </ul>
      <div className="mt-1 border-t border-[#eeeeee] px-4 pt-2">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-[15px]"><Icon.card className="size-5 shrink-0" /><span className="truncate">{identity ? 'Card, after your driver is assigned' : 'Pay after your driver is assigned'}</span></span>
          <WhenButton when={flow.when} onClick={() => setWhenOpen(true)} className="shadow-none ring-1 ring-[#e2e2e2]" />
        </div>
        {flow.error && <p role="alert" className="pb-1 text-[14px] text-[#c4160d]">{flow.error}</p>}
        <Button size="lg" className="mt-1 w-full" disabled={!selected || phase === 'requesting' || !selected.readiness?.bookingEnabled} onClick={() => void request()}>
          {phase === 'requesting' ? <><Spinner className="size-5" />Requesting…</> : `${flow.when ? 'Schedule' : 'Request'} ${selected?.title || 'ride'}`}
        </Button>
      </div>
    </Sheet>}

    {phase === 'unconfirmed' && <Sheet key="unconfirmed" label="Request status" onHeight={setSheet}>
      <div className="px-4 pb-2 pt-2">
        <h2 className="text-[22px] font-bold">Checking your request</h2>
        <p className="mt-1 text-[15px] text-[#5e5e5e]">The connection dropped before we heard back. Check it before requesting again, so you aren’t booked twice.</p>
        <Button size="lg" className="mt-4 w-full" disabled={resolving || !pendingBinding} onClick={() => void resolvePending()}>{resolving ? <><Spinner className="size-5" />Checking…</> : 'Check request'}</Button>
      </div>
    </Sheet>}

    {inRide && flow.phase.name === 'ride' && <Sheet key={`ride-${flow.phase.requestId}`} label="Your ride" onHeight={setSheet}>
      <RidePanel requestId={flow.phase.requestId} receipt={flow.phase.receipt} identity={identity} fleetName={fleetName} onInfo={setRideInfo} onDone={rideOver} fallbackService={selected?.title || null}
        fallbackFare={selected && priceOf(selected.id) != null && selected.currencyCode ? formatMoney(priceOf(selected.id), selected.currencyCode) : null} />
    </Sheet>}
  </div>
}
