/**
 * The rider's journey as one state machine, in the order Uber and Lyft use:
 *
 *   home ──Where to?──▶ search ──pick destination──▶ choose ──Request──▶ requesting ──▶ ride
 *                         │  ▲                         │
 *                         ▼  │                         └─ "Now ▾" opens the optional scheduler (never a step)
 *                         pin (set location on map)
 *
 * Pickup is the rider's location (or the fleet's city until they share one). The pickup time is
 * `null` = Now unless the rider opts into scheduling. Choosing a destination always lands on the
 * ride list with a request button ready: one tap to request.
 */
import type { Place } from '../lib/api'
import type { RiderReceipt } from './riderReceiptStorage'

export type Field = 'pickup' | 'dropoff'
export type PickupSource = 'none' | 'city' | 'gps' | 'chosen'
export type Phase =
  | { name: 'home' }
  | { name: 'search'; field: Field }
  | { name: 'pin'; field: Field }
  | { name: 'choose' }
  | { name: 'requesting' }
  | { name: 'unconfirmed' }
  | { name: 'ride'; receipt: RiderReceipt | null; requestId: string; tripCode: string | null }

export type FlowState = {
  phase: Phase
  pickup: Place | null
  pickupSource: PickupSource
  dropoff: Place | null
  /** null = Now (the default, always). An ISO time only when the rider chose to schedule. */
  when: string | null
  serviceId: string | null
  error: string
}

export type FlowEvent =
  | { type: 'located'; place: Place; source: 'gps' | 'city' }
  | { type: 'openSearch'; field: Field }
  | { type: 'pick'; field: Field; place: Place }
  | { type: 'setOnMap'; field: Field }
  | { type: 'back' }
  | { type: 'selectService'; serviceId: string }
  | { type: 'setWhen'; when: string | null }
  | { type: 'request' }
  | { type: 'requested'; receipt: RiderReceipt }
  | { type: 'requestUncertain' }
  | { type: 'requestFailed'; error: string }
  | { type: 'resume'; receipt: RiderReceipt | null; requestId: string; tripCode?: string | null }
  | { type: 'restorePending' }
  | { type: 'resolved'; receipt: RiderReceipt | null }
  | { type: 'rideOver' }
  | { type: 'clearError' }

export const initialFlow: FlowState = { phase: { name: 'home' }, pickup: null, pickupSource: 'none', dropoff: null, when: null, serviceId: null, error: '' }

/** Where a finished pick goes next: a missing destination is asked for, otherwise straight to the ride list. */
function afterPick(state: FlowState): FlowState {
  if (!state.dropoff) return { ...state, phase: { name: 'search', field: 'dropoff' } }
  if (!state.pickup) return { ...state, phase: { name: 'search', field: 'pickup' } }
  return { ...state, phase: { name: 'choose' }, error: '' }
}

export function riderFlow(state: FlowState, event: FlowEvent): FlowState {
  const busy = state.phase.name === 'requesting' || state.phase.name === 'unconfirmed'
  switch (event.type) {
    case 'located':
      // A chosen pickup is never replaced by a later GPS fix; GPS replaces the city fallback.
      if (state.pickupSource === 'chosen' || (state.pickupSource === 'gps' && event.source === 'city')) return state
      return { ...state, pickup: event.place, pickupSource: event.source }
    case 'openSearch':
      if (busy || state.phase.name === 'ride') return state
      return { ...state, phase: { name: 'search', field: event.field }, error: '' }
    case 'setOnMap':
      if (busy || state.phase.name === 'ride') return state
      return { ...state, phase: { name: 'pin', field: event.field } }
    case 'pick': {
      if (busy || state.phase.name === 'ride') return state
      const next = event.field === 'pickup'
        ? { ...state, pickup: event.place, pickupSource: 'chosen' as const }
        : { ...state, dropoff: event.place }
      return afterPick(next)
    }
    case 'back':
      switch (state.phase.name) {
        case 'search': return { ...state, phase: state.dropoff && state.pickup ? { name: 'choose' } : { name: 'home' } }
        case 'pin': return { ...state, phase: { name: 'search', field: state.phase.field } }
        // Back from the ride list returns to planning with the destination kept (as Uber does).
        case 'choose': return { ...state, phase: { name: 'search', field: 'dropoff' }, error: '' }
        default: return state
      }
    case 'selectService':
      return busy ? state : { ...state, serviceId: event.serviceId, error: '' }
    case 'setWhen':
      return busy ? state : { ...state, when: event.when }
    case 'request':
      if (state.phase.name !== 'choose' || !state.pickup || !state.dropoff || !state.serviceId) return state
      return { ...state, phase: { name: 'requesting' }, error: '' }
    case 'requested':
      return { ...state, phase: { name: 'ride', receipt: event.receipt, requestId: event.receipt.requestId, tripCode: null }, error: '' }
    case 'requestUncertain':
      return { ...state, phase: { name: 'unconfirmed' }, error: 'We couldn’t confirm your request. Check it before requesting again.' }
    case 'requestFailed':
      return { ...state, phase: { name: 'choose' }, error: event.error }
    case 'restorePending':
      return { ...state, phase: { name: 'unconfirmed' } }
    case 'resolved':
      return event.receipt
        ? { ...state, phase: { name: 'ride', receipt: event.receipt, requestId: event.receipt.requestId, tripCode: null }, error: '' }
        : { ...state, phase: { name: 'choose' }, error: 'That request was never placed. You can request again.' }
    case 'resume':
      return { ...state, phase: { name: 'ride', receipt: event.receipt, requestId: event.requestId, tripCode: event.tripCode ?? null } }
    case 'rideOver':
      // A fresh start: keep the pickup, forget the trip, back to Now.
      return { ...initialFlow, pickup: state.pickupSource === 'chosen' ? null : state.pickup, pickupSource: state.pickupSource === 'chosen' ? 'none' : state.pickupSource, serviceId: state.serviceId }
    case 'clearError':
      return { ...state, error: '' }
  }
}

/** The ride the list starts on: the cheapest bookable, non-specialist ride (Uber's "UberX first"). */
export function defaultServiceId(services: Array<{ id: string; wheelchairAccessible: boolean; readiness: { bookingEnabled: boolean } | null }>, price: (id: string) => number | null) {
  const bookable = services.filter(service => service.readiness?.bookingEnabled)
  const ranked = [...bookable].sort((a, b) => Number(a.wheelchairAccessible) - Number(b.wheelchairAccessible) || (price(a.id) ?? Infinity) - (price(b.id) ?? Infinity))
  return ranked[0]?.id ?? services[0]?.id ?? null
}

/** The earliest time a scheduled ride may start for this service (lead time, rounded up to 5 minutes). */
export function earliestScheduled(now: Date, leadMinutes: number) {
  const at = new Date(now.getTime() + Math.max(leadMinutes, 15) * 60_000)
  at.setSeconds(0, 0)
  at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5)
  return at
}

/** Rider-facing words for where the ride is. Never operator labels. */
export type RideStage = 'finding' | 'scheduled' | 'assigned' | 'arrived' | 'onTrip' | 'completed' | 'cancelled' | 'noDriver' | 'reassigning' | 'unknown'
export function rideStage(requestStatus: string | null | undefined, tripStatus: string | null | undefined, handoffState?: string | null, requestedFor?: string | null, now = Date.now()): RideStage {
  if (handoffState === 'reassignment_pending') return 'reassigning'
  if (tripStatus) {
    if (tripStatus === 'driver_assigned' || tripStatus === 'driver_en_route') return requestedFor && Date.parse(requestedFor) > now + 30 * 60_000 ? 'scheduled' : 'assigned'
    if (tripStatus === 'driver_arrived') return 'arrived'
    if (tripStatus === 'in_progress') return 'onTrip'
    if (tripStatus === 'completed') return 'completed'
    if (tripStatus === 'cancelled' || tripStatus === 'no_show') return requestStatus === 'matching' ? 'reassigning' : 'cancelled'
  }
  if (requestStatus === 'requested' || requestStatus === 'matching') return requestedFor && Date.parse(requestedFor) > now + 30 * 60_000 ? 'scheduled' : 'finding'
  if (requestStatus === 'cancelled') return 'cancelled'
  if (requestStatus === 'expired') return 'noDriver'
  return 'unknown'
}
