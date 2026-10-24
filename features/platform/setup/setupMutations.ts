'use client'

import { platformGraphql } from '../components/SetupSheet'

// Browser calls for the semantic setup mutations in features/keystone/mutations/fleetSetup.ts.
const call = (mutation: string, variables: Record<string, unknown>) => platformGraphql(mutation, variables)

export const setup = {
  fleet: (values: Record<string, unknown>) => call(`mutation($name: String!, $publicCity: String, $currencyCode: String, $timezone: String) { setupFleet(name: $name, publicCity: $publicCity, currencyCode: $currencyCode, timezone: $timezone) }`, values),
  driver: (values: Record<string, unknown>) => call(`mutation($fleetId: ID!, $publicName: String!, $email: String, $acceptsScheduled: Boolean) { addFleetDriver(fleetId: $fleetId, publicName: $publicName, email: $email, acceptsScheduled: $acceptsScheduled) }`, values),
  vehicle: (values: Record<string, unknown>) => call(`mutation($fleetId: ID!, $label: String!, $make: String, $model: String, $year: Int, $color: String, $plateMasked: String, $capacity: Int, $wheelchairAccessible: Boolean, $driverIds: [ID!]) { addFleetVehicle(fleetId: $fleetId, label: $label, make: $make, model: $model, year: $year, color: $color, plateMasked: $plateMasked, capacity: $capacity, wheelchairAccessible: $wheelchairAccessible, driverIds: $driverIds) }`, values),
  vehicleDrivers: (vehicleId: string, driverIds: string[]) => call(`mutation($vehicleId: ID!, $driverIds: [ID!]!) { assignVehicleDrivers(vehicleId: $vehicleId, driverIds: $driverIds) }`, { vehicleId, driverIds }),
  document: (values: Record<string, unknown>) => call(`mutation($driverId: ID, $vehicleId: ID, $kind: String!, $issuer: String, $referenceMasked: String, $issuedAt: DateTime, $expiresAt: DateTime) { addComplianceDocument(driverId: $driverId, vehicleId: $vehicleId, kind: $kind, issuer: $issuer, referenceMasked: $referenceMasked, issuedAt: $issuedAt, expiresAt: $expiresAt) }`, values),
  reviewDocument: (documentId: string, decision: string) => call(`mutation($documentId: ID!, $decision: String!) { reviewComplianceDocument(documentId: $documentId, decision: $decision) }`, { documentId, decision }),
  reviewDriver: (driverId: string, decision: string) => call(`mutation($driverId: ID!, $decision: String!) { reviewDriver(driverId: $driverId, decision: $decision) }`, { driverId, decision }),
  reviewVehicle: (vehicleId: string, decision: string) => call(`mutation($vehicleId: ID!, $decision: String!) { reviewVehicle(vehicleId: $vehicleId, decision: $decision) }`, { vehicleId, decision }),
  availability: (driverId: string, timezone: string, rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }>) => call(`mutation($driverId: ID!, $timezone: String!, $rules: JSON!) { setDriverAvailability(driverId: $driverId, timezone: $timezone, rules: $rules) }`, { driverId, timezone, rules }),
  area: (values: Record<string, unknown>) => call(`mutation($fleetId: ID!, $name: String!, $publicRegionLabel: String!, $status: String) { setupServiceArea(fleetId: $fleetId, name: $name, publicRegionLabel: $publicRegionLabel, status: $status) }`, values),
  service: (values: Record<string, unknown>) => call(`mutation($fleetId: ID!, $name: String!, $description: String, $category: String, $passengerCapacity: Int, $wheelchairAccessible: Boolean, $advanceBookingMinutes: Int, $serviceAreaIds: [ID!]!, $status: String) { setupRideService(fleetId: $fleetId, name: $name, description: $description, category: $category, passengerCapacity: $passengerCapacity, wheelchairAccessible: $wheelchairAccessible, advanceBookingMinutes: $advanceBookingMinutes, serviceAreaIds: $serviceAreaIds, status: $status) }`, values),
  fare: (values: Record<string, unknown>) => call(`mutation($serviceId: ID!, $serviceAreaId: ID!, $name: String!, $distanceUnit: String, $baseFareMinor: Int!, $perDistanceUnitMinor: Int!, $perMinuteMinor: Int!, $bookingFeeMinor: Int, $minimumFareMinor: Int, $cancellationFeeMinor: Int, $noShowFeeMinor: Int, $status: String) { setupFareRule(serviceId: $serviceId, serviceAreaId: $serviceAreaId, name: $name, distanceUnit: $distanceUnit, baseFareMinor: $baseFareMinor, perDistanceUnitMinor: $perDistanceUnitMinor, perMinuteMinor: $perMinuteMinor, bookingFeeMinor: $bookingFeeMinor, minimumFareMinor: $minimumFareMinor, cancellationFeeMinor: $cancellationFeeMinor, noShowFeeMinor: $noShowFeeMinor, status: $status) }`, values),
  online: (online: boolean, driverId?: string) => call(`mutation($online: Boolean!, $driverId: ID) { setDriverOnline(online: $online, driverId: $driverId) }`, { online, driverId: driverId || null }),
  serviceStatus: (id: string, status: string) => call(`mutation($id: ID!, $status: String!) { updateRideService(where: { id: $id }, data: { status: $status }) { id status } }`, { id, status }),
  areaStatus: (id: string, status: string) => call(`mutation($id: ID!, $status: String!) { updateServiceArea(where: { id: $id }, data: { status: $status }) { id status } }`, { id, status }),
}

export const ops = {
  addMember: (values: Record<string, unknown>) => call(`mutation($fleetId: ID!, $email: String!, $role: String!) { addFleetMember(fleetId: $fleetId, email: $email, role: $role) }`, values),
  updateMember: (membershipId: string, patch: { role?: string; status?: string }) => call(`mutation($membershipId: ID!, $role: String, $status: String) { updateFleetMember(membershipId: $membershipId, role: $role, status: $status) }`, { membershipId, role: patch.role || null, status: patch.status || null }),
  addTimeOff: (values: Record<string, unknown>) => call(`mutation($driverId: ID!, $startsAt: DateTime!, $endsAt: DateTime!, $reason: String) { addDriverTimeOff(driverId: $driverId, startsAt: $startsAt, endsAt: $endsAt, reason: $reason) }`, values),
  removeTimeOff: (exceptionId: string) => call(`mutation($exceptionId: ID!) { removeDriverTimeOff(exceptionId: $exceptionId) }`, { exceptionId }),
  incident: (incidentId: string, patch: { status?: string; assignToMe?: boolean }) => call(`mutation($incidentId: ID!, $status: String, $assignToMe: Boolean) { triageSafetyIncident(incidentId: $incidentId, status: $status, assignToMe: $assignToMe) }`, { incidentId, status: patch.status || null, assignToMe: patch.assignToMe || null }),
  supportCase: (caseId: string, patch: { status?: string; assignToMe?: boolean }) => call(`mutation($caseId: ID!, $status: String, $assignToMe: Boolean) { triageSupportCase(caseId: $caseId, status: $status, assignToMe: $assignToMe) }`, { caseId, status: patch.status || null, assignToMe: patch.assignToMe || null }),
  review: (reviewId: string, status: string) => call(`mutation($reviewId: ID!, $status: String!) { moderateReview(reviewId: $reviewId, status: $status) }`, { reviewId, status }),
  recordPayment: (tripId: string) => call(`mutation($tripId: ID!, $key: String!) { initiateTripPayment(tripId: $tripId, providerCode: "pp_manual", idempotencyKey: $key) { id status } }`, { tripId, key: `payment:${tripId}:${crypto.randomUUID()}` }),
  confirmPayment: (paymentId: string, method: string) => call(`mutation($paymentId: ID!, $method: String) { confirmManualPayment(paymentId: $paymentId, method: $method) }`, { paymentId, method }),
  refund: (paymentId: string, amountMinor: number, reason: string) => call(`mutation($paymentId: ID!, $amountMinor: Int!, $reason: String, $key: String!) { requestTripRefund(paymentId: $paymentId, amountMinor: $amountMinor, reason: $reason, idempotencyKey: $key) { id status } }`, { paymentId, amountMinor, reason, key: `refund:${paymentId}:${crypto.randomUUID()}` }),
  confirmRefund: (refundId: string) => call(`mutation($refundId: ID!) { confirmManualRefund(refundId: $refundId) }`, { refundId }),
  message: (tripId: string, body: string) => call(`mutation($tripId: ID!, $body: String!, $key: String!) { sendTripMessage(tripId: $tripId, body: $body, idempotencyKey: $key) { id } }`, { tripId, body, key: `message:${tripId}:${crypto.randomUUID()}` }),
}

const dateValue = (value: unknown) => typeof value === 'string' && value ? new Date(`${value}T00:00:00`).toISOString() : null
export const toDocumentInput = (values: Record<string, any>) => ({ ...values, issuedAt: dateValue(values.issuedAt), expiresAt: dateValue(values.expiresAt) })

export const DOCUMENT_KIND_OPTIONS = [
  { value: 'driver_license', label: 'Driver licence' }, { value: 'insurance', label: 'Insurance' }, { value: 'vehicle_registration', label: 'Vehicle registration' },
  { value: 'inspection', label: 'Inspection' }, { value: 'background_check', label: 'Background check' }, { value: 'business_license', label: 'Business licence' }, { value: 'other', label: 'Other' },
]
