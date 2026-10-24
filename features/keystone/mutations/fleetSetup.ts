import { randomUUID } from 'node:crypto'
import { GraphQLError } from 'graphql'
import { canAccessFleet, currentHumanActor, permissions, type FleetCapability } from '../access'
import { validateFareRule } from '../domain/fare'
import { refreshDriverPresentDispatchStatus } from '../domain/driverDispatchPresence'

// Semantic setup for a fleet's day-one records. Generic CRUD stays closed for tenant
// relationships (models/*.ts), so these mutations set the fleet server-side after checking
// the actor's membership, and own the review transitions that make drivers and vehicles
// dispatchable (status plus a current eligibility evaluation, see domain/eligibility.ts).

const fail = (message: string): never => { throw new GraphQLError(message, { extensions: { code: 'RIDESHARE_SETUP_INVALID' } }) }
const text = (value: unknown, label: string, { required = false, max = 200 } = {}) => {
  const clean = typeof value === 'string' ? value.trim() : ''
  if (required && !clean) fail(`${label} is required.`)
  if (clean.length > max) fail(`${label} must be ${max} characters or fewer.`)
  return clean
}
const whole = (value: unknown, label: string, min: number, max: number, fallback?: number) => {
  if ((value === null || value === undefined || value === '') && fallback !== undefined) return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < min || number > max) fail(`${label} must be a whole number from ${min} to ${max}.`)
  return number
}
const oneOf = <T extends string>(value: unknown, options: readonly T[], label: string, fallback?: T): T => {
  if ((value === null || value === undefined || value === '') && fallback) return fallback
  if (!options.includes(value as T)) fail(`${label} must be one of: ${options.join(', ').replaceAll('_', ' ')}.`)
  return value as T
}
const dateOrNull = (value: unknown, label: string) => {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) fail(`${label} is not a valid date.`)
  return date
}
const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item'
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

async function requireActor(context: any) {
  const actor = await currentHumanActor(context.prisma, context.session)
  if (!actor) fail('Sign in to continue.')
  return actor!
}
async function requireFleet(context: any, fleetId: unknown, capability: FleetCapability) {
  if (typeof fleetId !== 'string' || !fleetId || !await canAccessFleet(context, context.session, fleetId, capability)) fail('Fleet not found or outside your access.')
  return fleetId as string
}

export const DRIVER_DOCUMENTS = ['driver_license', 'insurance'] as const
export const VEHICLE_DOCUMENTS = ['vehicle_registration', 'inspection'] as const
const DOCUMENT_KINDS = ['driver_license', 'vehicle_registration', 'insurance', 'inspection', 'background_check', 'business_license', 'other'] as const

/** Kinds still lacking an accepted, unexpired document. */
export function missingDocuments(documents: Array<{ kind: string | null; status: string | null; expiresAt: Date | string | null }>, required: readonly string[], now = new Date()) {
  return required.filter(kind => !documents.some(document => document.kind === kind && document.status === 'accepted_evidence' && (!document.expiresAt || new Date(document.expiresAt).getTime() > now.getTime())))
}

/** The fleet's single active eligibility policy of a kind, created on first review if the fleet has none. */
async function eligibilityPolicy(tx: any, fleetId: string, kind: 'driver_eligibility' | 'vehicle_eligibility') {
  const policies = await tx.policy.findMany({ where: { fleetId, kind, status: 'active' }, orderBy: { id: 'asc' }, take: 2, select: { id: true, version: true } })
  if (policies.length > 1) fail('This fleet has more than one active eligibility policy of this kind. Retire one before reviewing.')
  if (policies[0]) return policies[0]
  return tx.policy.create({ data: { fleetId, kind, status: 'active', name: kind === 'driver_eligibility' ? 'Driver document review' : 'Vehicle document review', version: '1', requirements: { documents: kind === 'driver_eligibility' ? DRIVER_DOCUMENTS : VEHICLE_DOCUMENTS } }, select: { id: true, version: true } })
}

export async function createFleet(_root: unknown, args: { name: string; publicCity?: string | null; countryCode?: string | null; currencyCode?: string | null; timezone?: string | null }, context: any) {
  const actor = await requireActor(context)
  if (!await permissions.canManageFleet({ context, session: context.session })) fail('Fleet management permission is required.')
  const name = text(args.name, 'Fleet name', { required: true, max: 120 })
  const currencyCode = text(args.currencyCode, 'Currency', { max: 3 }).toUpperCase() || 'USD'
  if (!/^[A-Z]{3}$/.test(currencyCode)) fail('Currency must be a three-letter code such as USD.')
  const timezone = text(args.timezone, 'Time zone', { max: 64 }) || 'UTC'
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }) } catch { fail('Time zone is not recognised.') }
  return context.prisma.$transaction(async (tx: any) => {
    const fleet = await tx.fleet.create({ data: { name, slug: `${slugify(name)}-${randomUUID().slice(0, 6)}`, status: 'setup', publicCity: text(args.publicCity, 'City', { max: 120 }), countryCode: text(args.countryCode, 'Country', { max: 2 }).toUpperCase() || 'US', currencyCode, timezone }, select: { id: true, name: true, status: true } })
    await tx.fleetMembership.create({ data: { fleetId: fleet.id, userId: actor.id, role: 'owner', status: 'active', acceptedAt: new Date() } })
    return fleet
  })
}

export async function addFleetDriver(_root: unknown, args: { fleetId: string; publicName: string; email?: string | null; acceptsScheduled?: boolean | null; publicBio?: string | null }, context: any) {
  await requireActor(context)
  const fleetId = await requireFleet(context, args.fleetId, 'drivers')
  const publicName = text(args.publicName, 'Driver name', { required: true, max: 80 })
  const email = text(args.email, 'Email', { max: 200 }).toLowerCase()
  return context.prisma.$transaction(async (tx: any) => {
    let userId: string | null = null
    if (email) {
      const user = await tx.user.findUnique({ where: { email }, select: { id: true, driverProfile: { select: { id: true } } } })
      if (!user) fail('No account uses that email. The driver signs up first, or leave email empty.')
      if (user.driverProfile) fail('That account already has a driver profile.')
      userId = user.id
    }
    return tx.driverProfile.create({ data: { fleetId, userId, publicName, publicBio: text(args.publicBio, 'Bio', { max: 500 }), acceptsScheduled: args.acceptsScheduled !== false, status: 'pending_review', dispatchStatus: 'offline' }, select: { id: true, publicName: true, status: true } })
  })
}

export async function addFleetVehicle(_root: unknown, args: { fleetId: string; label: string; make?: string | null; model?: string | null; year?: number | null; color?: string | null; plateMasked?: string | null; capacity?: number | null; wheelchairAccessible?: boolean | null; driverIds?: string[] | null }, context: any) {
  await requireActor(context)
  const fleetId = await requireFleet(context, args.fleetId, 'operations')
  const label = text(args.label, 'Vehicle name', { required: true, max: 80 })
  const year = args.year === null || args.year === undefined ? null : whole(args.year, 'Year', 1980, new Date().getFullYear() + 1)
  const driverIds = [...new Set((args.driverIds || []).filter(id => typeof id === 'string'))].slice(0, 20)
  return context.prisma.$transaction(async (tx: any) => {
    if (driverIds.length && await tx.driverProfile.count({ where: { id: { in: driverIds }, fleetId } }) !== driverIds.length) fail('Every assigned driver must belong to this fleet.')
    return tx.vehicle.create({ data: {
      fleetId, label, make: text(args.make, 'Make', { max: 60 }), model: text(args.model, 'Model', { max: 60 }), year, color: text(args.color, 'Colour', { max: 40 }),
      plateMasked: text(args.plateMasked, 'Plate', { max: 20 }), capacity: whole(args.capacity, 'Seats', 1, 50, 4), wheelchairAccessible: args.wheelchairAccessible === true, status: 'pending_review',
      ...(driverIds.length ? { drivers: { connect: driverIds.map(id => ({ id })) } } : {}),
    }, select: { id: true, label: true, status: true } })
  })
}

export async function assignVehicleDrivers(_root: unknown, args: { vehicleId: string; driverIds: string[] }, context: any) {
  await requireActor(context)
  const vehicle = await context.prisma.vehicle.findUnique({ where: { id: args.vehicleId }, select: { id: true, fleetId: true } })
  const fleetId = await requireFleet(context, vehicle?.fleetId, 'operations')
  const driverIds = [...new Set((args.driverIds || []).filter(id => typeof id === 'string'))].slice(0, 20)
  if (driverIds.length && await context.prisma.driverProfile.count({ where: { id: { in: driverIds }, fleetId } }) !== driverIds.length) fail('Every assigned driver must belong to this fleet.')
  return context.prisma.vehicle.update({ where: { id: vehicle!.id }, data: { drivers: { set: driverIds.map(id => ({ id })) } }, select: { id: true, label: true } })
}

export async function addComplianceDocument(_root: unknown, args: { driverId?: string | null; vehicleId?: string | null; kind: string; issuer?: string | null; referenceMasked?: string | null; issuedAt?: string | null; expiresAt?: string | null }, context: any) {
  await requireActor(context)
  if (Boolean(args.driverId) === Boolean(args.vehicleId)) fail('Attach the document to one driver or one vehicle.')
  const owner = args.driverId
    ? await context.prisma.driverProfile.findUnique({ where: { id: args.driverId }, select: { id: true, fleetId: true } })
    : await context.prisma.vehicle.findUnique({ where: { id: args.vehicleId! }, select: { id: true, fleetId: true } })
  await requireFleet(context, owner?.fleetId, 'drivers')
  const kind = oneOf(args.kind, DOCUMENT_KINDS, 'Document type')
  const issuedAt = dateOrNull(args.issuedAt, 'Issue date')
  const expiresAt = dateOrNull(args.expiresAt, 'Expiry date')
  if (issuedAt && expiresAt && expiresAt <= issuedAt) fail('Expiry date must be after the issue date.')
  return context.prisma.complianceDocument.create({ data: { ...(args.driverId ? { driverId: owner!.id } : { vehicleId: owner!.id }), kind, status: 'submitted', issuer: text(args.issuer, 'Issuer', { max: 120 }), referenceMasked: text(args.referenceMasked, 'Reference', { max: 40 }), issuedAt, expiresAt }, select: { id: true, kind: true, status: true } })
}

export async function reviewComplianceDocument(_root: unknown, args: { documentId: string; decision: string; notes?: string | null }, context: any) {
  const actor = await requireActor(context)
  const document = await context.prisma.complianceDocument.findUnique({ where: { id: args.documentId }, select: { id: true, expiresAt: true, driver: { select: { fleetId: true } }, vehicle: { select: { fleetId: true } } } })
  await requireFleet(context, document?.driver?.fleetId || document?.vehicle?.fleetId, 'drivers')
  const decision = oneOf(args.decision, ['accepted_evidence', 'rejected_evidence', 'revoked'] as const, 'Decision')
  if (decision === 'accepted_evidence' && document!.expiresAt && new Date(document!.expiresAt).getTime() <= Date.now()) fail('This document has expired and cannot be accepted.')
  return context.prisma.complianceDocument.update({ where: { id: document!.id }, data: { status: decision, reviewedAt: new Date(), reviewerId: actor.id, reviewNotes: text(args.notes, 'Notes', { max: 1000 }) }, select: { id: true, status: true } })
}

/** Approve, pause or remove a driver. Approval needs accepted licence and insurance and records the eligibility evaluation dispatch reads. */
export async function reviewDriver(_root: unknown, args: { driverId: string; decision: string; notes?: string | null }, context: any) {
  const actor = await requireActor(context)
  const driver = await context.prisma.driverProfile.findUnique({ where: { id: args.driverId }, select: { id: true, fleetId: true, status: true, dispatchStatus: true } })
  const fleetId = await requireFleet(context, driver?.fleetId, 'drivers')
  const decision = oneOf(args.decision, ['active', 'paused', 'ineligible', 'offboarded'] as const, 'Decision')
  if (decision !== 'active' && ['offered', 'assigned', 'on_trip'].includes(driver!.dispatchStatus || '')) fail('This driver has a live offer or trip. Finish or reassign it first.')
  const notes = text(args.notes, 'Notes', { max: 1000 })
  return context.prisma.$transaction(async (tx: any) => {
    const documents = await tx.complianceDocument.findMany({ where: { driverId: driver!.id }, select: { kind: true, status: true, expiresAt: true } })
    const missing = missingDocuments(documents, DRIVER_DOCUMENTS)
    if (decision === 'active' && missing.length) fail(`Accept the driver's ${missing.map(kind => kind.replaceAll('_', ' ')).join(' and ')} first.`)
    const policy = await eligibilityPolicy(tx, fleetId, 'driver_eligibility')
    const expiries = documents.filter((document: any) => DRIVER_DOCUMENTS.includes(document.kind) && document.expiresAt).map((document: any) => new Date(document.expiresAt).getTime())
    await tx.policyEvaluation.create({ data: { policyId: policy.id, driverId: driver!.id, outcome: decision === 'active' ? 'eligible' : 'ineligible', reasons: [notes || `Driver ${decision === 'active' ? 'approved' : decision} by operator review.`], evidenceSnapshot: { policyVersion: policy.version, documents: documents.map((document: any) => ({ kind: document.kind, status: document.status })) }, evaluatedAt: new Date(), expiresAt: expiries.length ? new Date(Math.min(...expiries)) : null, evaluatorId: actor.id } })
    return tx.driverProfile.update({ where: { id: driver!.id }, data: { status: decision, ...(decision === 'active' ? {} : { dispatchStatus: 'offline' }) }, select: { id: true, status: true } })
  })
}

/** Approve or take a vehicle off the road. Approval needs accepted registration and inspection. */
export async function reviewVehicle(_root: unknown, args: { vehicleId: string; decision: string; notes?: string | null }, context: any) {
  const actor = await requireActor(context)
  const vehicle = await context.prisma.vehicle.findUnique({ where: { id: args.vehicleId }, select: { id: true, fleetId: true } })
  const fleetId = await requireFleet(context, vehicle?.fleetId, 'drivers')
  const decision = oneOf(args.decision, ['active', 'maintenance', 'suspended', 'retired'] as const, 'Decision')
  const notes = text(args.notes, 'Notes', { max: 1000 })
  return context.prisma.$transaction(async (tx: any) => {
    const documents = await tx.complianceDocument.findMany({ where: { vehicleId: vehicle!.id }, select: { kind: true, status: true, expiresAt: true } })
    const missing = missingDocuments(documents, VEHICLE_DOCUMENTS)
    if (decision === 'active' && missing.length) fail(`Accept the vehicle's ${missing.map(kind => kind.replaceAll('_', ' ')).join(' and ')} first.`)
    const policy = await eligibilityPolicy(tx, fleetId, 'vehicle_eligibility')
    const expiries = documents.filter((document: any) => VEHICLE_DOCUMENTS.includes(document.kind) && document.expiresAt).map((document: any) => new Date(document.expiresAt).getTime())
    await tx.policyEvaluation.create({ data: { policyId: policy.id, vehicleId: vehicle!.id, outcome: decision === 'active' ? 'eligible' : 'ineligible', reasons: [notes || `Vehicle ${decision === 'active' ? 'approved' : decision} by operator review.`], evidenceSnapshot: { policyVersion: policy.version, documents: documents.map((document: any) => ({ kind: document.kind, status: document.status })) }, evaluatedAt: new Date(), expiresAt: expiries.length ? new Date(Math.min(...expiries)) : null, evaluatorId: actor.id } })
    return tx.vehicle.update({ where: { id: vehicle!.id }, data: { status: decision }, select: { id: true, status: true } })
  })
}

/** Replace a driver's weekly hours. Earlier rules are paused, never deleted. */
export async function setDriverAvailability(_root: unknown, args: { driverId: string; timezone: string; rules: Array<{ dayOfWeek: number; startTime: string; endTime: string }> }, context: any) {
  await requireActor(context)
  const driver = await context.prisma.driverProfile.findUnique({ where: { id: args.driverId }, select: { id: true, fleetId: true } })
  await requireFleet(context, driver?.fleetId, 'operations')
  const timezone = text(args.timezone, 'Time zone', { required: true, max: 64 })
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }) } catch { fail('Time zone is not recognised.') }
  if (!Array.isArray(args.rules) || args.rules.length > 21) fail('Up to 21 time windows can be saved.')
  const rules = args.rules.map(rule => {
    const dayOfWeek = whole(rule.dayOfWeek, 'Day', 0, 6)
    if (!TIME.test(rule.startTime) || !TIME.test(rule.endTime) || rule.endTime <= rule.startTime) fail('Each window needs a start before its end, in HH:MM.')
    return { dayOfWeek, startTime: rule.startTime, endTime: rule.endTime }
  })
  return context.prisma.$transaction(async (tx: any) => {
    await tx.availabilityRule.updateMany({ where: { driverId: driver!.id, status: 'active' }, data: { status: 'paused' } })
    for (const rule of rules) await tx.availabilityRule.create({ data: { driverId: driver!.id, ...rule, timezone, status: 'active' } })
    return { driverId: driver!.id, rules: rules.length }
  })
}

export async function createServiceArea(_root: unknown, args: { fleetId: string; name: string; publicRegionLabel: string; countryCode?: string | null; status?: string | null }, context: any) {
  await requireActor(context)
  const fleetId = await requireFleet(context, args.fleetId, 'fleetAdmin')
  return context.prisma.serviceArea.create({ data: { fleetId, name: text(args.name, 'Area name', { required: true, max: 120 }), publicRegionLabel: text(args.publicRegionLabel, 'Public area label', { required: true, max: 160 }), countryCode: text(args.countryCode, 'Country', { max: 2 }).toUpperCase() || 'US', status: oneOf(args.status, ['draft', 'active', 'paused'] as const, 'Status', 'active') }, select: { id: true, name: true, status: true } })
}

export async function createRideService(_root: unknown, args: { fleetId: string; name: string; description?: string | null; category?: string | null; passengerCapacity?: number | null; wheelchairAccessible?: boolean | null; advanceBookingMinutes?: number | null; serviceAreaIds: string[]; status?: string | null }, context: any) {
  await requireActor(context)
  const fleetId = await requireFleet(context, args.fleetId, 'fleetAdmin')
  const name = text(args.name, 'Service name', { required: true, max: 80 })
  const areaIds = [...new Set((args.serviceAreaIds || []).filter(id => typeof id === 'string'))].slice(0, 50)
  if (!areaIds.length) fail('Choose at least one service area.')
  return context.prisma.$transaction(async (tx: any) => {
    if (await tx.serviceArea.count({ where: { id: { in: areaIds }, fleetId } }) !== areaIds.length) fail('Every service area must belong to this fleet.')
    return tx.rideService.create({ data: {
      fleetId, name, slug: `${slugify(name)}-${randomUUID().slice(0, 6)}`, description: text(args.description, 'Description', { max: 500 }),
      category: oneOf(args.category, ['standard', 'comfort', 'xl', 'accessible', 'pet_friendly', 'scheduled'] as const, 'Category', 'standard'),
      passengerCapacity: whole(args.passengerCapacity, 'Seats', 1, 50, 4), wheelchairAccessible: args.wheelchairAccessible === true,
      advanceBookingMinutes: whole(args.advanceBookingMinutes, 'Book-ahead minutes', 0, 43_200, 0), status: oneOf(args.status, ['draft', 'active', 'paused'] as const, 'Status', 'draft'),
      serviceAreas: { connect: areaIds.map(id => ({ id })) },
    }, select: { id: true, name: true, status: true } })
  })
}

export async function createFareRule(_root: unknown, args: { serviceId: string; serviceAreaId: string; name: string; currencyCode?: string | null; distanceUnit?: string | null; baseFareMinor: number; perDistanceUnitMinor: number; perMinuteMinor: number; bookingFeeMinor?: number | null; minimumFareMinor?: number | null; cancellationFeeMinor?: number | null; noShowFeeMinor?: number | null; status?: string | null }, context: any) {
  await requireActor(context)
  const service = await context.prisma.rideService.findUnique({ where: { id: args.serviceId }, select: { id: true, fleetId: true, fleet: { select: { currencyCode: true } } } })
  const fleetId = await requireFleet(context, service?.fleetId, 'fleetAdmin')
  const area = await context.prisma.serviceArea.findFirst({ where: { id: args.serviceAreaId, fleetId, services: { some: { id: service!.id } } }, select: { id: true } })
  if (!area) fail('Choose a service area this service runs in.')
  const minor = (value: unknown, label: string) => whole(value, label, 0, 10_000_000, 0)
  const data = {
    fleetId, serviceId: service!.id, serviceAreaId: area!.id, name: text(args.name, 'Fare name', { required: true, max: 120 }),
    currencyCode: (text(args.currencyCode, 'Currency', { max: 3 }) || service!.fleet?.currencyCode || 'USD').toUpperCase(),
    distanceUnit: oneOf(args.distanceUnit, ['kilometer', 'mile'] as const, 'Distance unit', 'mile'),
    baseFareMinor: minor(args.baseFareMinor, 'Base fare'), perDistanceUnitMinor: minor(args.perDistanceUnitMinor, 'Distance rate'), perMinuteMinor: minor(args.perMinuteMinor, 'Time rate'),
    bookingFeeMinor: minor(args.bookingFeeMinor, 'Booking fee'), minimumFareMinor: minor(args.minimumFareMinor, 'Minimum fare'), cancellationFeeMinor: minor(args.cancellationFeeMinor, 'Cancellation fee'), noShowFeeMinor: minor(args.noShowFeeMinor, 'No-show fee'),
    status: oneOf(args.status, ['draft', 'active', 'retired'] as const, 'Status', 'active'),
  }
  return context.prisma.$transaction(async (tx: any) => {
    const latest = await tx.fareRule.findFirst({ where: { serviceId: service!.id, serviceAreaId: area!.id }, orderBy: { version: 'desc' }, select: { version: true } })
    const version = (latest?.version || 0) + 1
    try { validateFareRule({ ...data, version } as any) } catch { fail('Check the currency and amounts.') }
    // One active fare per service and area: activating a new version retires the previous active one.
    if (data.status === 'active') await tx.fareRule.updateMany({ where: { serviceId: service!.id, serviceAreaId: area!.id, status: 'active' }, data: { status: 'retired' } })
    return tx.fareRule.create({ data: { ...data, version }, select: { id: true, name: true, version: true, status: true } })
  })
}

/** Driver presence. With no driverId the signed-in driver switches themselves; with one, a fleet operator does.
 * Online only from offline; offline only while no offer or trip holds the driver. */
export async function setDriverOnline(_root: unknown, args: { online: boolean; driverId?: string | null }, context: any) {
  const actor = await requireActor(context)
  const driver = args.driverId
    ? await context.prisma.driverProfile.findUnique({ where: { id: args.driverId }, select: { id: true, fleetId: true, status: true, dispatchStatus: true } })
    : await context.prisma.driverProfile.findFirst({ where: { userId: actor.id }, select: { id: true, fleetId: true, status: true, dispatchStatus: true } })
  if (!driver) fail('No driver profile found.')
  if (args.driverId) await requireFleet(context, driver!.fleetId, 'operations')
  if (driver!.status !== 'active') fail('Only approved drivers can go online.')
  return context.prisma.$transaction(async (tx: any) => {
    if (args.online) {
      await tx.driverProfile.updateMany({ where: { id: driver!.id, status: 'active', dispatchStatus: 'offline' }, data: { dispatchStatus: 'available' } })
      await refreshDriverPresentDispatchStatus(tx, driver!.id)
    } else {
      const result = await tx.driverProfile.updateMany({ where: { id: driver!.id, dispatchStatus: { in: ['available', 'offline'] } }, data: { dispatchStatus: 'offline' } })
      if (result.count !== 1) fail('Finish or decline your current offer or trip before going offline.')
    }
    return tx.driverProfile.findUnique({ where: { id: driver!.id }, select: { id: true, dispatchStatus: true } })
  })
}
