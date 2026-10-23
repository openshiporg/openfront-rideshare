import type { StatusTone } from '../components/StatusTitle'

// One label and dot colour per stored status value, shared by the rider storefront and the platform.
const STATUS: Record<string, [string, StatusTone]> = {
  // Ride requests
  requested: ['Requested', 'blue'],
  matching: ['Finding a driver', 'amber'],
  matched: ['Matched', 'emerald'],
  expired: ['Expired', 'zinc'],
  // Trips
  driver_assigned: ['Driver assigned', 'indigo'],
  driver_en_route: ['Driver on the way', 'blue'],
  driver_arrived: ['Driver arrived', 'teal'],
  in_progress: ['On trip', 'emerald'],
  completed: ['Completed', 'green'],
  no_show: ['No-show', 'orange'],
  // Offers
  offered: ['Offered', 'amber'],
  accepted: ['Accepted', 'emerald'],
  declined: ['Declined', 'zinc'],
  withdrawn: ['Withdrawn', 'zinc'],
  // Drivers
  applicant: ['Applicant', 'zinc'],
  pending_review: ['In review', 'amber'],
  active: ['Active', 'green'],
  paused: ['Paused', 'orange'],
  ineligible: ['Ineligible', 'red'],
  offboarded: ['Offboarded', 'zinc'],
  offline: ['Offline', 'zinc'],
  available: ['Available', 'green'],
  assigned: ['Assigned', 'indigo'],
  on_trip: ['On trip', 'emerald'],
  // Payments
  pending: ['Pending', 'amber'],
  authorized: ['Authorized', 'blue'],
  captured: ['Captured', 'green'],
  failed: ['Failed', 'red'],
  partially_refunded: ['Partly refunded', 'orange'],
  refunded: ['Refunded', 'zinc'],
  cancelled: ['Cancelled', 'zinc'],
  // Safety and support
  open: ['Open', 'red'],
  triage: ['Triage', 'orange'],
  investigating: ['Investigating', 'amber'],
  waiting: ['Waiting', 'amber'],
  resolved: ['Resolved', 'green'],
  closed: ['Closed', 'zinc'],
  published: ['Published', 'green'],
}

export function statusLabel(status: string | null | undefined) {
  if (!status) return 'Unknown'
  return STATUS[status]?.[0] ?? status.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase())
}

export function statusTone(status: string | null | undefined): StatusTone {
  return (status && STATUS[status]?.[1]) || 'zinc'
}

/** Live trip stages, in order. Used for progress rails on both sides of a ride. */
export const TRIP_STAGES = ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress', 'completed'] as const

export function tripStageIndex(status: string | null | undefined) {
  return TRIP_STAGES.indexOf(status as typeof TRIP_STAGES[number])
}

export function formatWhen(value: string | null | undefined, fallback = 'Time not recorded') {
  if (!value) return fallback
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : fallback
}
