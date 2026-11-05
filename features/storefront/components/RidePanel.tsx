'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { gql, idempotencyKey, type Identity, type LngLat, type TripVehicle } from '../lib/api'
import { formatMoney, initials, shortPlace, vehicleName, dayAndTime } from '../lib/format'
import { rideStage, type RideStage } from '../domain/riderFlow'
import type { RiderReceipt } from '../domain/riderReceiptStorage'
import { Button, Icon, RouteMarks, Spinner, cx } from './ui'

type Snapshot = { quote?: { currencyCode?: string | null; totalMinor?: number | null; routeEvidence?: { pickup?: LngLat | null; dropoff?: LngLat | null } }; service?: { name?: string | null }; vehicle?: TripVehicle } | null
type RideView = {
  requestId: string; requestNumber: string; status: string; requestedFor: string | null; pickupLabel: string | null; dropoffLabel: string | null; handoffState: string
  fleetBrand: { name?: string } | null
  trip: { id: string; confirmationCode: string; status: string; bookingSnapshot: Snapshot; finalFareSnapshot: { currencyCode?: string | null; totalMinor?: number | null } | null } | null
}
type Driver = { publicName: string; photoUrl: string | null; rating: number | null; ratingCount: number | null }
type Card = { enabled: boolean; payable: boolean; status: string | null; amountMinor: number | null; currencyCode: string | null; url: string | null }
const CARD = 'enabled payable status amountMinor currencyCode url'
const LIVE: RideStage[] = ['finding', 'reassigning', 'assigned', 'arrived', 'onTrip', 'scheduled']

export type RideInfo = { stage: RideStage; pickup: LngLat | null; dropoff: LngLat | null; pickupLabel: string | null; dropoffLabel: string | null; tripCode: string | null }

/**
 * Everything after Request, in one sheet that changes with the ride: finding a driver → driver
 * card → on trip → receipt and rating. Polls the rider's own request (guest proof or account).
 */
export function RidePanel({ requestId, receipt, identity, fleetName, onInfo, onDone, fallbackFare, fallbackService }: {
  requestId: string
  receipt: RiderReceipt | null
  identity: Identity
  fleetName: string
  onInfo: (info: RideInfo) => void
  onDone: () => void
  fallbackFare?: string | null
  fallbackService?: string | null
}) {
  const [view, setView] = useState<RideView | null>(null)
  const [driver, setDriver] = useState<Driver | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  const proof = receipt?.requestProof ?? null
  const stage = view ? rideStage(view.status, view.trip?.status, view.handoffState, view.requestedFor) : 'unknown'
  const live = LIVE.includes(stage)
  const tripId = view?.trip?.id ?? null
  const tripCode = view?.trip?.confirmationCode ?? null

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    gql<{ riderRequestStatus: RideView | null }>(`query RideStatus($id: ID!, $proof: String) { riderRequestStatus(requestId: $id, requestProof: $proof) { requestId requestNumber status requestedFor pickupLabel dropoffLabel handoffState fleetBrand trip { id confirmationCode status bookingSnapshot finalFareSnapshot } } }`, { id: requestId, proof }, { signal: controller.signal, timeoutMs: 9000 })
      .then(data => { if (!active) return; setView(data.riderRequestStatus); setFailed(!data.riderRequestStatus) })
      .catch(() => { if (active && !controller.signal.aborted) setFailed(current => current || !view) })
    return () => { active = false; controller.abort() }
  }, [requestId, proof, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live rides refresh every 5 s (and on focus); finished ones stop.
  useEffect(() => {
    if (view && !live) return
    const timer = window.setInterval(() => setTick(t => t + 1), 5000)
    const focus = () => setTick(t => t + 1)
    window.addEventListener('focus', focus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [live, view])

  // The assigned driver, once per trip.
  useEffect(() => {
    if (!tripCode) { setDriver(null); return }
    let active = true
    gql<{ publicRideshareTrip: { driver: Driver | null } | null }>(`query RideDriver($code: String!, $id: ID, $proof: String) { publicRideshareTrip(confirmationCode: $code, requestId: $id, requestProof: $proof) { driver { publicName photoUrl rating ratingCount } } }`, { code: tripCode, id: requestId, proof })
      .then(data => { if (active) setDriver(data.publicRideshareTrip?.driver ?? null) }).catch(() => { /* the vehicle still shows */ })
    return () => { active = false }
  }, [tripCode, requestId, proof])

  // Card payment (Stripe Checkout) for a signed-in rider's trip; settles a return from Checkout.
  useEffect(() => {
    if (!tripId || !identity) { setCard(null); return }
    let active = true
    void (async () => {
      try {
        const checkout = new URLSearchParams(window.location.search).get('checkout')
        if (checkout?.startsWith('cs_')) {
          const done = await gql<{ confirmTripCardPayment: Card }>(`mutation ConfirmCard($tripId: ID!) { confirmTripCardPayment(tripId: $tripId) { ${CARD} } }`, { tripId }, { timeoutMs: 25_000 })
          if (active) setNotice(done.confirmTripCardPayment.status === 'captured' ? 'Payment received. Thanks for riding.' : 'Your payment is processing.')
          window.history.replaceState(null, '', window.location.pathname + `?request=${encodeURIComponent(requestId)}`)
        } else if (checkout === 'cancelled' && active) setNotice('Payment cancelled. You can pay any time.')
        const data = await gql<{ tripCardPayment: Card }>(`query TripCard($tripId: ID!) { tripCardPayment(tripId: $tripId) { ${CARD} } }`, { tripId })
        if (active) setCard(data.tripCardPayment)
      } catch { if (active) setCard(null) }
    })()
    return () => { active = false }
  }, [tripId, identity, view?.trip?.status, requestId])

  const evidence = view?.trip?.bookingSnapshot?.quote?.routeEvidence
  const infoKey = [stage, evidence?.pickup?.join(), evidence?.dropoff?.join(), view?.pickupLabel, view?.dropoffLabel, tripCode].join('|')
  const report = useRef(onInfo)
  useEffect(() => { report.current = onInfo })
  useEffect(() => { if (view) report.current({ stage, pickup: evidence?.pickup ?? null, dropoff: evidence?.dropoff ?? null, pickupLabel: view.pickupLabel, dropoffLabel: view.dropoffLabel, tripCode }) }, [infoKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) return <div className="px-4 pb-4 pt-3">
    {failed ? <div className="space-y-4">
      <h2 className="text-[22px] font-bold">Ride not available</h2>
      <p className="text-[15px] text-[#5e5e5e]">Sign in with the account you booked with, or open it in the browser you booked in.</p>
      <div className="grid grid-cols-2 gap-2"><Button tone="secondary" onClick={onDone}>Book a ride</Button><ButtonLinkPrimary href="/account/signin">Sign in</ButtonLinkPrimary></div>
    </div> : <div className="flex items-center gap-3 py-6 text-[16px]"><Spinner />Loading your ride…</div>}
  </div>

  const snapshot = view.trip?.bookingSnapshot
  const fare = view.trip?.finalFareSnapshot?.totalMinor != null ? view.trip.finalFareSnapshot : snapshot?.quote
  const fareText = fare?.totalMinor != null && fare.currencyCode ? formatMoney(fare.totalMinor, fare.currencyCode) : fallbackFare || null
  const serviceName = snapshot?.service?.name || fallbackService || null
  const vehicle = snapshot?.vehicle
  const signedInOwner = Boolean(identity)
  const headline: Record<RideStage, string> = {
    finding: 'Finding your driver', reassigning: 'Finding you another driver', scheduled: view.requestedFor ? `Pickup ${dayAndTime(view.requestedFor)}` : 'Ride scheduled',
    assigned: driver ? `${firstName(driver.publicName)} is on the way` : 'Your driver is on the way', arrived: 'Your driver has arrived', onTrip: `Heading to ${shortPlace(view.dropoffLabel) || 'your destination'}`,
    completed: 'You’ve arrived', cancelled: 'Ride cancelled', noDriver: 'No drivers were available', unknown: 'Ride update',
  }
  const sub: Partial<Record<RideStage, string>> = {
    finding: `${fleetName} is assigning a driver to your ride.`,
    reassigning: 'Your driver had to cancel. You won’t be charged for that.',
    scheduled: view.trip ? 'Your driver is confirmed for this time.' : `${fleetName} will assign a driver before pickup.`,
    arrived: 'Meet them at the pickup spot.',
    noDriver: 'You weren’t charged. Try requesting again.',
    cancelled: 'You won’t be charged unless a cancellation fee was shown.',
  }
  const canCancelRequest = ['requested', 'matching'].includes(view.status) && (!view.trip || view.trip.status === 'cancelled')
  const canCancelTrip = Boolean(view.trip && ['driver_assigned', 'driver_en_route', 'driver_arrived'].includes(view.trip.status))

  return <div className="flex min-h-0 flex-col overflow-y-auto px-4 pb-2 pt-2">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[22px] font-bold leading-7" aria-live="polite">{headline[stage]}</h2>
        {sub[stage] && <p className="mt-1 text-[15px] text-[#5e5e5e]">{sub[stage]}</p>}
      </div>
      {stage === 'arrived' && <span className="mt-0.5 shrink-0 rounded-md bg-black px-2 py-1 text-[14px] font-semibold text-white">Now</span>}
    </div>
    {(stage === 'finding' || stage === 'reassigning') && <div className="progress mt-4" role="progressbar" aria-label="Finding a driver"><span /></div>}

    {view.trip && (driver || vehicle) && !['completed', 'cancelled'].includes(stage) && <div className="mt-4 flex items-center gap-3 border-t border-[#eeeeee] pt-4">
      {driver?.photoUrl ? <img src={driver.photoUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-[#eeeeee] text-[18px] font-semibold">{driver ? initials(driver.publicName) : <Icon.person className="size-6" />}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-semibold">{driver?.publicName || 'Your driver'}{driver?.rating != null && <span className="ml-2 inline-flex items-center gap-0.5 text-[14px] font-medium"><Icon.star className="size-3.5" />{driver.rating.toFixed(2)}</span>}</p>
        <p className="truncate text-[14px] text-[#5e5e5e]">{vehicleName(vehicle) || serviceName}</p>
      </div>
      {vehicle?.plateMasked && <span className="shrink-0 rounded-md bg-[#eeeeee] px-2.5 py-1.5 font-mono text-[16px] font-bold tracking-wide">{vehicle.plateMasked}</span>}
    </div>}

    <div className="mt-4 flex gap-3 border-t border-[#eeeeee] pt-4">
      <RouteMarks className="py-[7px]" />
      <div className="min-w-0 flex-1 space-y-3 text-[15px]">
        <p className="truncate">{view.pickupLabel || 'Pickup'}</p>
        <p className="truncate">{view.dropoffLabel || 'Destination'}</p>
      </div>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#eeeeee] pt-4 text-[15px]">
      <span className="min-w-0 truncate">{stage === 'completed' ? (serviceName ? `${serviceName} · fare` : 'Fare') : serviceName ? `${serviceName} · estimate` : 'Fare estimate'}</span>
      <span className="shrink-0 font-semibold tabular-nums">{fareText || '—'}</span>
    </div>

    {card?.enabled && (card.payable || card.status === 'captured') && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#f6f6f6] px-4 py-3">
      <span className="flex items-center gap-2 text-[15px]"><Icon.card className="size-5" />{card.status === 'captured' ? 'Paid by card' : 'Pay by card'}</span>
      {card.payable && card.status !== 'captured' && <PayButton tripId={tripId!} onError={setNotice} />}
    </div>}
    {notice && <p role="status" className="mt-3 text-[14px] text-[#5e5e5e]">{notice}</p>}

    {stage === 'completed' && tripId && <RateRide tripId={tripId} signedIn={signedInOwner} driverName={driver ? firstName(driver.publicName) : null} />}

    <div className="mt-4 space-y-2">
      {live && <div className={cx('grid gap-2', signedInOwner && view.trip ? 'grid-cols-3' : 'grid-cols-2')}>
        <ShareButton requestId={requestId} code={tripCode} />
        {signedInOwner && view.trip && <MessageButton tripId={view.trip.id} />}
        {(canCancelRequest || canCancelTrip) ? <Button tone="danger" onClick={() => setConfirming(true)}>Cancel</Button> : <Button tone="secondary" onClick={() => setTick(t => t + 1)}>Refresh</Button>}
      </div>}
      {!live && <Button size="lg" className="w-full" onClick={onDone}>{stage === 'completed' ? 'Done' : 'Book another ride'}</Button>}
    </div>
    {canCancelTrip && !signedInOwner && <p className="mt-3 text-[13px] text-[#5e5e5e]">To cancel after a driver is assigned, <Link href="/account/signin" className="font-semibold underline underline-offset-2">sign in</Link> with the account you booked with, or contact {fleetName}.</p>}
    <p className="mt-3 text-center font-mono text-[12px] text-[#8a8a8a]">{tripCode || view.requestNumber}</p>

    {confirming && <CancelConfirm requestId={requestId} proof={proof} tripId={canCancelTrip && signedInOwner ? tripId : null} requestCancellable={canCancelRequest} onClose={() => setConfirming(false)} onCancelled={() => { setConfirming(false); setTick(t => t + 1) }} />}
  </div>
}

const firstName = (name: string) => name.split(/\s+/)[0] || name
function ButtonLinkPrimary({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="press inline-flex h-12 items-center justify-center rounded-xl bg-black px-5 text-[16px] font-semibold text-white">{children}</Link>
}

function ShareButton({ requestId, code }: { requestId: string; code: string | null }) {
  const [copied, setCopied] = useState(false)
  async function share() {
    const url = `${window.location.origin}${code ? `/rides/${encodeURIComponent(code)}?request=${encodeURIComponent(requestId)}` : '/'}`
    try {
      if (navigator.share) await navigator.share({ title: 'My ride', url })
      else { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000) }
    } catch { /* closed the share sheet */ }
  }
  return <Button tone="secondary" onClick={() => void share()}><Icon.share className="size-[18px]" />{copied ? 'Copied' : 'Share'}</Button>
}

function PayButton({ tripId, onError }: { tripId: string; onError: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  async function pay() {
    setBusy(true)
    try {
      const data = await gql<{ startTripCardPayment: Card }>(`mutation StartCard($tripId: ID!) { startTripCardPayment(tripId: $tripId) { ${CARD} } }`, { tripId }, { timeoutMs: 25_000 })
      if (data.startTripCardPayment.url) { window.location.assign(data.startTripCardPayment.url); return }
      onError('Card payment couldn’t start. Try again.')
    } catch (cause) { onError(cause instanceof Error ? cause.message : 'Card payment couldn’t start.') }
    setBusy(false)
  }
  return <Button size="sm" disabled={busy} onClick={() => void pay()}>{busy ? 'Opening…' : 'Pay fare'}</Button>
}

function MessageButton({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  async function send() {
    if (!text.trim()) return
    setState('sending')
    try { await gql('mutation Message($tripId: ID!, $body: String!, $key: String!) { sendTripMessage(tripId: $tripId, body: $body, idempotencyKey: $key) { id } }', { tripId, body: text.trim(), key: idempotencyKey('message') }); setText(''); setState('sent') }
    catch { setState('failed') }
  }
  return <>
    <Button tone="secondary" onClick={() => { setOpen(true); setState('idle') }}><Icon.message className="size-[18px]" />Message</Button>
    {open && <Overlay label="Message your driver" onClose={() => setOpen(false)}>
      <h3 className="text-[20px] font-bold">Message your driver</h3>
      <textarea value={text} onChange={event => setText(event.target.value)} rows={3} maxLength={2000} placeholder="I’m by the main entrance" className="mt-3 w-full rounded-xl bg-[#f3f3f3] px-4 py-3 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-black" />
      {state === 'sent' && <p role="status" className="mt-2 text-[14px]">Sent.</p>}
      {state === 'failed' && <p role="alert" className="mt-2 text-[14px] text-[#c4160d]">Not sent. Try again.</p>}
      <div className="mt-3 grid grid-cols-2 gap-2"><Button tone="secondary" onClick={() => setOpen(false)}>Close</Button><Button disabled={state === 'sending' || !text.trim()} onClick={() => void send()}>{state === 'sending' ? 'Sending…' : 'Send'}</Button></div>
    </Overlay>}
  </>
}

function RateRide({ tripId, signedIn, driverName }: { tripId: string; signedIn: boolean; driverName: string | null }) {
  const [rating, setRating] = useState(0)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  if (!signedIn) return <p className="mt-4 text-[14px] text-[#5e5e5e]"><Link href="/account/signin" className="font-semibold text-black underline underline-offset-2">Sign in</Link> to rate this ride.</p>
  async function send(value: number) {
    setRating(value); setState('sending')
    try { await gql('mutation Rate($tripId: ID!, $rating: Int!, $key: String!) { submitTripReview(tripId: $tripId, rating: $rating, idempotencyKey: $key) { id } }', { tripId, rating: value, key: idempotencyKey('review') }); setState('sent') }
    catch { setState('failed') }
  }
  return <div className="mt-4 border-t border-[#eeeeee] pt-4 text-center">
    <p className="text-[16px] font-semibold">{state === 'sent' ? 'Thanks for rating' : `How was your ride${driverName ? ` with ${driverName}` : ''}?`}</p>
    <div role="radiogroup" aria-label="Rating" className="mt-2 flex justify-center gap-1">
      {[1, 2, 3, 4, 5].map(value => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value === 1 ? '' : 's'}`} disabled={state === 'sending' || state === 'sent'} onClick={() => void send(value)}
        className="press grid size-11 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-black"><Icon.star className={cx('size-8', value <= rating ? 'text-black' : 'text-[#d6d6d6]')} /></button>)}
    </div>
    {state === 'failed' && <p role="alert" className="text-[14px] text-[#c4160d]">Rating not sent. Each ride can be rated once.</p>}
  </div>
}

/** Uber's cancel confirmation: what it costs, then "Keep ride" or "Cancel ride". */
type RequestIntent = { v: 1; requestId: string; requestProof: string | null; actorId: string; key: string; phase: 'pending' | 'resolved' }
const cancelKey = (id: string) => `openfront-rideshare-request-cancel-v1:${id}`
function CancelConfirm({ requestId, proof, tripId, requestCancellable, onClose, onCancelled }: { requestId: string; proof: string | null; tripId: string | null; requestCancellable: boolean; onClose: () => void; onCancelled: () => void }) {
  const [preview, setPreview] = useState<{ kind: 'request'; actorId: string } | { kind: 'trip'; actorId: string; acceptedOfferId: string; updatedAt: string; feeMinor: number; currencyCode: string } | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'sending' | 'failed' | 'unavailable'>('loading')
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (requestCancellable) {
          const pending = readIntent(requestId)
          if (pending?.phase === 'pending') { if (active) { setPreview({ kind: 'request', actorId: pending.actorId }); setState('ready') } return }
          const data = await gql<{ riderRequestCancellationPreview: { requestId: string; actorId: string; status: string } | null }>('query CancelPreview($id: ID!, $proof: String) { riderRequestCancellationPreview(requestId: $id, requestProof: $proof) }', { id: requestId, proof })
          const result = data.riderRequestCancellationPreview
          if (!result || result.requestId !== requestId || !result.actorId) throw new Error()
          if (active) { setPreview({ kind: 'request', actorId: result.actorId }); setState('ready') }
        } else if (tripId) {
          const data = await gql<{ tripCancellationPreview: { actorId: string; acceptedOfferId: string; updatedAt: string; feeMinor: number; currencyCode: string } | null }>('query TripCancelPreview($id: ID!) { tripCancellationPreview(tripId: $id) }', { id: tripId })
          const result = data.tripCancellationPreview
          if (!result) throw new Error()
          if (active) { setPreview({ kind: 'trip', ...result }); setState('ready') }
        } else throw new Error()
      } catch { if (active) setState('unavailable') }
    })()
    return () => { active = false }
  }, [requestId, proof, tripId, requestCancellable])

  async function confirm() {
    if (!preview || state === 'sending') return
    setState('sending')
    try {
      if (preview.kind === 'request') {
        // The cancel intent is saved before it is sent, so an unconfirmed cancel retries with the same key.
        let intent = readIntent(requestId)
        if (!intent || intent.phase === 'resolved') {
          intent = { v: 1, requestId, requestProof: proof, actorId: preview.actorId, key: idempotencyKey('cancel-request'), phase: 'pending' }
          sessionStorage.setItem(cancelKey(requestId), JSON.stringify(intent))
        }
        const data = await gql<{ cancelRideRequest: { requestId: string; status: string } }>('mutation CancelRequest($id: ID!, $proof: String, $key: String!, $actor: ID!) { cancelRideRequest(requestId: $id, requestProof: $proof, idempotencyKey: $key, expectedActorId: $actor) { requestId status replayed alreadyCancelled } }', { id: requestId, proof: intent.requestProof, key: intent.key, actor: intent.actorId })
        if (data.cancelRideRequest?.status !== 'cancelled') throw new Error()
        sessionStorage.setItem(cancelKey(requestId), JSON.stringify({ ...intent, phase: 'resolved' }))
      } else {
        await gql('mutation CancelTrip($tripId: ID!, $key: String!, $actor: ID!, $offer: ID!, $at: DateTime!, $fee: Int!, $currency: String!) { cancelRide(tripId: $tripId, reasonCode: "rider_cancelled", reason: "Cancelled by rider", idempotencyKey: $key, expectedActorId: $actor, expectedAcceptedOfferId: $offer, expectedUpdatedAt: $at, expectedFeeMinor: $fee, expectedCurrencyCode: $currency) { id } }',
          { tripId, key: idempotencyKey('cancel-trip'), actor: preview.actorId, offer: preview.acceptedOfferId, at: preview.updatedAt, fee: preview.feeMinor, currency: preview.currencyCode })
      }
      onCancelled()
    } catch { setState('failed') }
  }
  const fee = preview?.kind === 'trip' && preview.feeMinor > 0 ? formatMoney(preview.feeMinor, preview.currencyCode) : null
  return <Overlay label="Cancel ride" onClose={state === 'sending' ? () => {} : onClose}>
    <h3 className="text-[20px] font-bold">Cancel your ride?</h3>
    <p className="mt-2 text-[15px] text-[#5e5e5e]">{state === 'loading' ? 'Checking…' : state === 'unavailable' ? 'This ride can’t be cancelled here any more. It may already have a driver.' : fee ? `Your driver is already on the way, so a ${fee} cancellation fee applies.` : 'You won’t be charged.'}</p>
    {state === 'failed' && <p role="alert" className="mt-2 text-[14px] text-[#c4160d]">We couldn’t confirm the cancellation. Try again.</p>}
    <div className="mt-4 grid gap-2">
      <Button size="lg" className="bg-[#c4160d] hover:bg-[#a8120b]" disabled={!preview || state === 'loading' || state === 'sending' || state === 'unavailable'} onClick={() => void confirm()}>{state === 'sending' ? <><Spinner className="size-4" />Cancelling…</> : state === 'failed' ? 'Try again' : 'Cancel ride'}</Button>
      <Button tone="secondary" size="lg" disabled={state === 'sending'} onClick={onClose}>Keep ride</Button>
    </div>
  </Overlay>
}
function readIntent(requestId: string): RequestIntent | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(cancelKey(requestId)) || 'null')
    return value?.v === 1 && value.requestId === requestId && typeof value.key === 'string' && typeof value.actorId === 'string' ? value : null
  } catch { return null }
}

/** A small sheet over the ride sheet, for confirms and short inputs. */
function Overlay({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close.current() }
    window.addEventListener('keydown', key)
    box.current?.querySelector<HTMLElement>('textarea, button')?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', key)
  }, [])
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 fade-in lg:items-center" onPointerDown={event => { if (event.target === event.currentTarget) close.current() }}>
    <div ref={box} role="dialog" aria-modal="true" aria-label={label} className="sheet-in w-full max-w-[440px] rounded-t-[20px] bg-white p-5 pb-[max(env(safe-area-inset-bottom),20px)] lg:rounded-2xl">{children}</div>
  </div>
}
