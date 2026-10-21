import { isDriverAvailableAt } from '../../../keystone/domain/availability'
import { isFutureScheduledRequest } from '../../../keystone/domain/dispatchSchedule'
import { isCurrentEligibility, type EligibilityKind } from '../../../keystone/domain/eligibility'

type Evaluation = {
  outcome?: string | null
  expiresAt?: string | null
  policy?: { status?: string | null; kind?: string | null; fleet?: { id: string } | null } | null
}
type AvailabilityRule = {
  dayOfWeek?: number | null
  startTime?: string | null
  endTime?: string | null
  timezone?: string | null
  status?: string | null
  effectiveFrom?: string | null
  effectiveUntil?: string | null
}
type AvailabilityException = { startsAt: string; endsAt: string; kind: string }
type CandidateVehicle = {
  id: string
  label: string
  status: string
  capacity: number | null
  wheelchairAccessible: boolean
  fleet: { id: string } | null
  policyEvaluations: Evaluation[]
}
type CandidateDriver = {
  id: string
  publicName: string
  status: string
  dispatchStatus: string
  acceptsScheduled: boolean
  fleet: { id: string } | null
  availabilityRules: AvailabilityRule[]
  availabilityExceptions: AvailabilityException[]
  vehicles: CandidateVehicle[]
  policyEvaluations: Evaluation[]
}
type ExistingOffer = {
  status: string
  expiresAt: string | null
  driver: { id: string } | null
  vehicle: { id: string } | null
}
type DispatchRequest = {
  id: string
  status: string
  requestedFor: string | null
  passengerCount: number | null
  accessibilityNeeds: unknown
  fleet: { id: string } | null
  quote: { service: { status: string; advanceBookingMinutes: number | null; passengerCapacity: number; wheelchairAccessible: boolean } | null } | null
  matchOffers: ExistingOffer[]
}

export type DispatchCandidatePair = { driver: CandidateDriver; vehicle: CandidateVehicle }

function isCurrentEvaluation(evaluation: Evaluation | undefined, kind: string, fleetId: string, now: Date) {
  return isCurrentEligibility(evaluation, kind as EligibilityKind, fleetId, now)
}

function conflictsWithLiveOffer(request: DispatchRequest, driverId: string, vehicleId: string, now: Date) {
  return request.matchOffers.some(offer => {
    if (offer.status === 'accepted') return true
    if (offer.status !== 'offered') return false
    const expiry = offer.expiresAt ? new Date(offer.expiresAt).getTime() : Number.NaN
    // An unknown lease is conservatively considered active.
    return (!Number.isFinite(expiry) || expiry > now.getTime()) && (offer.driver?.id === driverId || offer.vehicle?.id === vehicleId)
  })
}

/** A bounded, preliminary UI projection. The offer mutation remains authoritative
 * for reservation overlap and revalidates every field inside its transaction. */
export function getDispatchCandidates(request: DispatchRequest, drivers: CandidateDriver[], now: Date): DispatchCandidatePair[] {
  const fleetId = request.fleet?.id
  const service = request.quote?.service
  if (!['requested', 'matching'].includes(request.status) || !fleetId || !service || service.status !== 'active' || !Number.isSafeInteger(service.passengerCapacity) || service.passengerCapacity < 1 || !Number.isFinite(now.getTime())) return []

  const scheduled = request.requestedFor !== null
  if (scheduled && !isFutureScheduledRequest(request.requestedFor, now)) return []
  const requestedAt = scheduled ? new Date(request.requestedFor!) : now
  if (!Number.isFinite(requestedAt.getTime())) return []

  const needs = request.accessibilityNeeds && typeof request.accessibilityNeeds === 'object' && !Array.isArray(request.accessibilityNeeds)
    ? request.accessibilityNeeds as Record<string, unknown>
    : {}
  const passengerCount = request.passengerCount || 1

  return drivers.flatMap(driver => {
    const statusAllowsRequest = scheduled
      ? ['available', 'offered', 'assigned', 'on_trip'].includes(driver.dispatchStatus)
      : driver.dispatchStatus === 'available'
    if (driver.fleet?.id !== fleetId || driver.status !== 'active' || !statusAllowsRequest || (scheduled && !driver.acceptsScheduled) ||
      !isCurrentEvaluation(driver.policyEvaluations[0], 'driver_eligibility', fleetId, now) ||
      !isDriverAvailableAt(driver.availabilityRules, driver.availabilityExceptions, requestedAt)) return []

    return driver.vehicles.filter(vehicle => vehicle.status === 'active' && vehicle.fleet?.id === fleetId &&
      isCurrentEvaluation(vehicle.policyEvaluations[0], 'vehicle_eligibility', fleetId, now) &&
      (vehicle.capacity || 0) >= passengerCount && passengerCount <= service.passengerCapacity &&
      (needs.wheelchairAccessible !== true || vehicle.wheelchairAccessible) &&
      (!service.wheelchairAccessible || vehicle.wheelchairAccessible) &&
      !conflictsWithLiveOffer(request, driver.id, vehicle.id, now))
      .map(vehicle => ({ driver, vehicle }))
  })
}
