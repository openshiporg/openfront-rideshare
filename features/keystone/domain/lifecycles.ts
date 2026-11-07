import { GraphQLError } from 'graphql'

/** One transitions map per lifecycle. Every writer asks `assertTransition` before it changes a status, so an
 * illegal move is refused on the server whatever button or API call asked for it. Trips have their own map in
 * tripState.ts; request, offer and offer-response states are guarded inside the dispatch transactions. */
export const lifecycles = {
  payment: {
    pending: ['authorized', 'captured', 'failed', 'cancelled'],
    authorized: ['captured', 'failed', 'cancelled'],
    captured: ['partially_refunded', 'refunded'],
    partially_refunded: ['partially_refunded', 'refunded'],
    failed: ['pending'],
    refunded: [],
    cancelled: [],
  },
  refund: {
    requested: ['processing', 'succeeded', 'failed', 'cancelled'],
    processing: ['succeeded', 'failed', 'cancelled'],
    succeeded: [],
    failed: [],
    cancelled: [],
  },
  document: {
    submitted: ['under_review', 'accepted_evidence', 'rejected_evidence'],
    under_review: ['accepted_evidence', 'rejected_evidence'],
    accepted_evidence: ['revoked', 'expired'],
    rejected_evidence: [],
    expired: [],
    revoked: [],
  },
  vehicle: {
    pending_review: ['active', 'maintenance', 'suspended', 'retired'],
    active: ['maintenance', 'suspended', 'retired'],
    maintenance: ['active', 'suspended', 'retired'],
    suspended: ['active', 'maintenance', 'retired'],
    retired: [],
  },
  driver: {
    applicant: ['pending_review', 'active', 'paused', 'ineligible', 'offboarded'],
    pending_review: ['active', 'paused', 'ineligible', 'offboarded'],
    active: ['paused', 'ineligible', 'offboarded'],
    paused: ['active', 'ineligible', 'offboarded'],
    ineligible: ['active', 'paused', 'offboarded'],
    offboarded: ['active'],
  },
  incident: {
    open: ['triage', 'investigating', 'resolved'],
    triage: ['investigating', 'resolved'],
    investigating: ['resolved'],
    resolved: ['closed', 'investigating'],
    closed: [],
  },
  supportCase: {
    open: ['waiting', 'resolved'],
    waiting: ['open', 'resolved'],
    resolved: ['closed', 'open'],
    closed: [],
  },
  review: {
    pending: ['published', 'hidden', 'removed'],
    published: ['hidden', 'removed'],
    hidden: ['published', 'removed'],
    removed: [],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>

export type LifecycleName = keyof typeof lifecycles

export function canTransition(machine: LifecycleName, from: string | null | undefined, to: string) {
  const map = lifecycles[machine] as Record<string, readonly string[]>
  return (map[from || Object.keys(map)[0]] || []).includes(to)
}

/** Throws a message the client can show when the move is not on the machine's map. */
export function assertTransition(machine: LifecycleName, from: string | null | undefined, to: string, noun: string) {
  if (canTransition(machine, from, to)) return
  const current = String(from || Object.keys(lifecycles[machine])[0]).replaceAll('_', ' ')
  throw new GraphQLError(`A ${current} ${noun} can’t move to ${to.replaceAll('_', ' ')}.`, { extensions: { code: 'RIDESHARE_ILLEGAL_TRANSITION' } })
}

/** Payment states that mean the fare is settled or still being settled; a second attempt must not start. */
export const ACTIVE_PAYMENT_STATUSES = ['pending', 'authorized', 'captured', 'partially_refunded'] as const
/** Trip states in which a vehicle or driver is committed to a rider. */
export const COMMITTED_TRIP_STATUSES = ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress'] as const
/** A fare may only be collected for a ride that happened or is still going to; never for a cancelled or no-show trip. */
export const COLLECTABLE_FARE_TRIP_STATUSES = [...COMMITTED_TRIP_STATUSES, 'completed'] as const
