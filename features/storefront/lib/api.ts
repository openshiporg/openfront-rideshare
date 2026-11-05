/** The rider app's only door to the server: same-origin Keystone GraphQL, with a deadline. */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 12_000)
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
  const response = await fetch('/api/graphql', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables }), signal })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.errors?.length || !payload?.data) throw new GqlError(payload?.errors?.[0]?.message || 'Request failed')
  return payload.data as T
}

export class GqlError extends Error {}

export type LngLat = [number, number]
export type Place = { label: string; name: string; detail: string; point: LngLat }

export type Fleet = { name: string; publicCity: string | null; logoIcon?: string | null; logoColor?: string | null }
export type Service = {
  id: string
  title: string
  description: string | null
  photoUrl: string | null
  category: string
  passengerCapacity: number
  wheelchairAccessible: boolean
  advanceBookingMinutes: number
  startingFareMinor: number | null
  currencyCode: string | null
  readiness: { bookingEnabled: boolean; mode: string; reason: string | null } | null
  fleet: Fleet | null
}
export const SERVICE_FIELDS = 'id title description photoUrl category passengerCapacity wheelchairAccessible advanceBookingMinutes startingFareMinor currencyCode readiness { bookingEnabled mode reason } fleet { name publicCity logoIcon logoColor }'

export type Estimate = { serviceId: string; totalMinor: number; currencyCode: string }
export type Estimates = { distanceMeters: number; durationSeconds: number; options: Estimate[] }

export type Quote = {
  quoteId: string; quoteProof: string; expiresAt: string; pickupLabel: string; dropoffLabel: string; scheduledFor: string | null
  estimatedDistanceMeters: number; estimatedDurationSeconds: number; cancellationFeeMinor: number; noShowFeeMinor: number; estimateDisclosure: string
  fare: { currencyCode: string; totalMinor: number }
}
export const QUOTE_FIELDS = 'quoteId quoteProof expiresAt pickupLabel dropoffLabel scheduledFor estimatedDistanceMeters estimatedDurationSeconds cancellationFeeMinor noShowFeeMinor estimateDisclosure fare { currencyCode totalMinor }'

export type RequestView = {
  requestId: string; requestNumber: string; status: string; requestedFor: string | null; pickupLabel: string | null; dropoffLabel: string | null
  handoffState: string; createdAt: string; fleetBrand: { name?: string } | null
  trip: { id: string; confirmationCode: string; status: string; scheduledFor: string | null } | null
}
export const REQUEST_FIELDS = 'requestId requestNumber status requestedFor pickupLabel dropoffLabel handoffState createdAt fleetBrand trip { id confirmationCode status scheduledFor }'

export type TripVehicle = { label?: string | null; make?: string | null; model?: string | null; color?: string | null; plateMasked?: string | null }
export type TripView = {
  id: string; requestId: string; confirmationCode: string; status: string; scheduledFor: string | null
  pickupLabel: string | null; dropoffLabel: string | null; completedAt: string | null; cancelledAt: string | null
  bookingSnapshot: { quote?: { currencyCode?: string | null; totalMinor?: number | null; routeEvidence?: { pickup?: LngLat | null; dropoff?: LngLat | null } }; service?: { name?: string | null; category?: string | null }; vehicle?: TripVehicle } | null
  finalFareSnapshot: { currencyCode?: string | null; totalMinor?: number | null } | null
  driver: { publicName: string; photoUrl: string | null; rating: number | null; ratingCount: number | null } | null
  fleetBrand: { name?: string } | null
}
export const TRIP_FIELDS = 'id requestId confirmationCode status scheduledFor pickupLabel dropoffLabel completedAt cancelledAt bookingSnapshot finalFareSnapshot driver { publicName photoUrl rating ratingCount } fleetBrand'

export type Identity = { id: string; name: string; email: string } | null
export async function whoAmI(signal?: AbortSignal): Promise<Identity> {
  const data = await gql<{ authenticatedItem: Identity }>('query RiderWho { authenticatedItem { ... on User { id name email } } }', {}, { signal })
  return data.authenticatedItem?.id ? data.authenticatedItem : null
}

export const idempotencyKey = (purpose: string) => `${purpose}:${crypto.randomUUID()}`
