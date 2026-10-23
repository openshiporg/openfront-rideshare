import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { calculateFare } from '../domain/fare'
import { createOwnershipProof, createRecoverableRequestProof, verifyOwnershipProof } from '../domain/ownershipProof'
import { receiptBinding, recoverRequestReceipt, requestIntent, requestIntentHash } from '../domain/requestReceipt'
import { riderRequestStatus } from './riderReceipts'
import { estimateRoute } from '../../integrations/mapping/manual'
import { requireFleetOperations, rideReadiness } from '../domain/operationalReadiness'
import { currentRiderId, requestOwnerWhere } from '../domain/requestAuthority'
import { requireServiceReadiness } from '../domain/serviceReadiness'
import { projectFleetBrand } from '../domain/fleetBrand'

const cleanLabel = (value: string, name: string) => {
  const label = String(value || '').trim().replace(/\s+/g, ' ')
  if (label.length < 2 || label.length > 120) throw new Error(`${name} must be between 2 and 120 characters.`)
  return label
}

export async function marketplaceRideshareService(_root: unknown, args: { id: string }, context: any) {
  if (typeof args.id !== 'string' || !args.id || args.id.length > 200) return null
  const rows = await marketplaceRideshareServices(null, { serviceId: args.id, limit: 1 }, context)
  return rows[0] || null
}

export async function marketplaceRideshareServiceAreas(_root: unknown, args: { serviceId: string; after?: string | null }, context: any) {
  if (typeof args.serviceId !== 'string' || !args.serviceId || args.serviceId.length > 200 || (args.after && (typeof args.after !== 'string' || args.after.length > 200))) throw new Error('Invalid service area page.')
  const service = await context.prisma.rideService.findFirst({ where: { id: args.serviceId, status: 'active', fleet: { is: { status: 'active' } } }, select: { id: true, fleetId: true } })
  if (!service?.fleetId) return { items: [], nextCursor: null }
  const where = { fleetId: service.fleetId, status: 'active', services: { some: { id: service.id } } }
  if (args.after && !await context.prisma.serviceArea.findFirst({ where: { ...where, id: args.after }, select: { id: true } })) throw new Error('Invalid service area page.')
  const rows = await context.prisma.serviceArea.findMany({ where: { ...where, ...(args.after ? { id: { gt: args.after } } : {}) }, orderBy: { id: 'asc' }, take: 25, select: { id: true, name: true, publicRegionLabel: true, countryCode: true } })
  return { items: rows.slice(0, 24), nextCursor: rows.length > 24 ? rows[23].id : null }
}

export async function marketplaceRideshareServices(_root: unknown, args: { query?: string; location?: string; limit?: number; after?: string | null; serviceId?: string }, context: any) {
  const limit = Math.max(1, Math.min(Number(args.limit) || 10, 24))
  const query = String(args.query || '').trim().slice(0, 100)
  const location = String(args.location || '').trim().slice(0, 100)
  let boundary: { name: string; id: string } | null = null
  if (args.after) {
    if (typeof args.after !== 'string' || args.after.length > 1600) throw new Error('Invalid discovery cursor.')
    let value: any
    try { value = JSON.parse(Buffer.from(args.after, 'base64url').toString()) } catch { throw new Error('Invalid discovery cursor.') }
    if (value?.v !== 1 || value.query !== query || value.location !== location || typeof value.name !== 'string' || value.name.length > 300 || typeof value.id !== 'string' || value.id.length > 200) throw new Error('Invalid discovery cursor.')
    boundary = value
  }
  const services = await context.sudo().query.RideService.findMany({
    where: {
      ...(args.serviceId ? { id: { equals: args.serviceId } } : {}),
      ...(boundary ? { AND: [{ OR: [{ name: { gt: boundary.name } }, { name: { equals: boundary.name }, id: { gt: boundary.id } }] }] } : {}),
      status: { equals: 'active' }, fleet: { status: { equals: 'active' } },
      ...(location ? { serviceAreas: { some: { status: { equals: 'active' }, publicRegionLabel: { contains: location, mode: 'insensitive' } } } } : { serviceAreas: { some: { status: { equals: 'active' } } } }),
      ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] } : {}),
    },
    take: limit + 1,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    // Stable bounded public projection.
    query: `id name slug description category passengerCapacity wheelchairAccessible advanceBookingMinutes fleet { id operationsMode name slug publicDescription publicCity countryCode currencyCode logoIcon logoColor } serviceAreas(where: { status: { equals: "active" } }, orderBy: [{ publicRegionLabel: asc }, { id: asc }], take: 25) { id name publicRegionLabel countryCode status fleet { id } } fareRules(where: { status: { equals: "active" } }, orderBy: { version: desc }, take: 1) { id currencyCode baseFareMinor minimumFareMinor }`,
  })
  return services.slice(0, limit).filter((service: any) => service.fleet).map((service: any, index: number) => {
    const publicRegionLabels = service.serviceAreas.slice(0, 24).filter((area: any) => area.fleet?.id === service.fleet.id).map((area: any) => area.publicRegionLabel)
    return {
      id: service.id, title: service.name, description: service.description, category: service.category, passengerCapacity: service.passengerCapacity,
      wheelchairAccessible: service.wheelchairAccessible, advanceBookingMinutes: service.advanceBookingMinutes, publicRegionLabels,
      readiness: rideReadiness(service.fleet.operationsMode), areasTruncated: service.serviceAreas.length > 24, nextCursor: services.length > limit && index === limit - 1 ? Buffer.from(JSON.stringify({ v: 1, query, location, name: service.name, id: service.id })).toString('base64url') : null,
      fleet: { ...projectFleetBrand(service.fleet), id: service.fleet.id, name: service.fleet.name, publicDescription: service.fleet.publicDescription, publicCity: service.fleet.publicCity, countryCode: service.fleet.countryCode },
      startingFareMinor: service.fareRules?.[0]?.minimumFareMinor ?? null, currencyCode: service.fareRules?.[0]?.currencyCode || service.fleet.currencyCode,
      extension: { schema: 'openfront.rideshare.service/v1', value: { category: service.category, passengerCapacity: service.passengerCapacity, wheelchairAccessible: service.wheelchairAccessible, serviceAreas: publicRegionLabels } },
    }
  })
}

export async function marketplaceRideshareQuote(_root: unknown, args: { serviceId: string; pickupLabel: string; dropoffLabel: string; scheduledFor?: string | null; passengerCount?: number | null; wheelchairAccessible?: boolean | null; handoffId?: string | null }, context: any) {
  return context.transaction(async (context: any) => {
  const riderId = await currentRiderId(context.prisma, context.session)
  const pickupLabel = cleanLabel(args.pickupLabel, 'pickupLabel')
  const dropoffLabel = cleanLabel(args.dropoffLabel, 'dropoffLabel')
  const scheduledFor = args.scheduledFor ? new Date(args.scheduledFor) : null
  if (scheduledFor && (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() < Date.now() - 60_000)) throw new Error('scheduledFor must be a future date.')
  const service = await context.sudo().query.RideService.findOne({ where: { id: args.serviceId }, query: `id name status category passengerCapacity wheelchairAccessible advanceBookingMinutes fleet { id status currencyCode } fareRules(where: { status: { equals: "active" } }, take: 1, orderBy: { version: desc }) { id version currencyCode baseFareMinor perDistanceUnitMinor distanceUnit perMinuteMinor bookingFeeMinor minimumFareMinor maximumMultiplierBasisPoints cancellationFeeMinor noShowFeeMinor }` })
  if (!service || service.status !== 'active' || service.fleet?.status !== 'active' || !service.fareRules?.[0]) throw new Error('Service is not available for quoting.')
  const passengerCount = args.passengerCount ?? 1
  if (!Number.isSafeInteger(passengerCount) || passengerCount < 1 || passengerCount > 50) throw new Error('Passenger count must be a whole number from 1 to 50.')
  if (passengerCount > service.passengerCapacity) throw new Error('Passenger count exceeds this service capacity.')
  if (args.wheelchairAccessible && !service.wheelchairAccessible) throw new Error('This service does not advertise wheelchair-accessible vehicles.')
  if (scheduledFor && scheduledFor.getTime() < Date.now() + service.advanceBookingMinutes * 60_000) throw new Error('This service requires more advance notice for scheduled rides.')
  await requireFleetOperations(context.prisma, service.fleet.id)
  await requireServiceReadiness(context.prisma, service.id, service.fleet.id)
  const route = await estimateRoute({ pickupLabel, dropoffLabel })
  const rule = service.fareRules[0]
  const breakdown = calculateFare(rule, route.distanceMeters, route.durationSeconds)
  const publicId = `rq_${randomUUID()}`
  const expiresAt = new Date(Date.now() + 10 * 60_000)
  const proof = createOwnershipProof('quote', publicId, expiresAt)
  await context.sudo().query.RideQuote.createOne({ data: {
    publicId, ...(riderId ? { rider: { connect: { id: riderId } } } : {}), handoffId: args.handoffId?.trim() || '', status: 'active', service: { connect: { id: service.id } }, fareRule: { connect: { id: rule.id } },
    pickupLabel, dropoffLabel, routeInputHash: proof.hash, routeEvidence: route.evidence, estimatedDistanceMeters: route.distanceMeters, estimatedDurationSeconds: route.durationSeconds,
    fareSnapshot: { ...breakdown, _quoteOwner: { kind: riderId ? 'account' : 'guest', userId: riderId }, cancellationFeeMinor: rule.cancellationFeeMinor, noShowFeeMinor: rule.noShowFeeMinor, fareRuleId: rule.id, fareRuleVersion: rule.version, service: { id: service.id, fleetId: service.fleet.id, name: service.name, category: service.category, passengerCapacity: service.passengerCapacity, wheelchairAccessible: service.wheelchairAccessible }, routeEvidence: route.evidence },
    totalMinor: breakdown.totalMinor, currencyCode: breakdown.currencyCode, scheduledFor, expiresAt, guestProofHash: proof.hash,
  }, query: 'id' })
  return { quoteId: publicId, quoteProof: proof.token, expiresAt: expiresAt.toISOString(), pickupLabel, dropoffLabel, scheduledFor: scheduledFor?.toISOString() || null, estimatedDistanceMeters: route.distanceMeters, estimatedDurationSeconds: route.durationSeconds, cancellationFeeMinor: rule.cancellationFeeMinor, noShowFeeMinor: rule.noShowFeeMinor, fare: breakdown, estimateDisclosure: 'Estimated from your pickup and destination areas. The fleet confirms the final fare.', sourceCheckoutPath: `/book?service=${encodeURIComponent(service.id)}` }
  })
}

export async function requestRide(_root: unknown, args: { quoteId: string; quoteProof: string; passengerCount?: number | null; accessibilityNeeds?: unknown; riderNotes?: string | null; preciseRouteEncryptedRef?: string | null }, context: any) {
  const prisma = context.prisma as PrismaClient
  return prisma.$transaction(async tx => {
    const riderId = await currentRiderId(tx, context.session)
    const intent = requestIntent(args, riderId)
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${args.quoteId}, 0))::text IS NOT NULL`
    const quoteHeader = await tx.rideQuote.findUnique({ where: { publicId: args.quoteId }, select: { id: true, publicId: true, guestProofHash: true, riderId: true, requestId: true } })
    if (!quoteHeader?.guestProofHash || typeof args.quoteProof !== 'string' || args.quoteProof.length > 4096 || !verifyOwnershipProof(args.quoteProof, 'quote', quoteHeader.publicId, quoteHeader.guestProofHash, quoteHeader.requestId ? 0 : Date.now()) || (quoteHeader.riderId && quoteHeader.riderId !== riderId)) throw new Error('Quote is invalid or not owned by this session.')
    if (quoteHeader.requestId) {
      const requestHeader = await tx.rideRequest.findUnique({ where: { id: quoteHeader.requestId }, select: { id: true, fleetId: true, riderId: true } })
      if (!requestHeader || requestHeader.riderId !== riderId) throw new Error('Original receipt ownership is unavailable.')
      const existing = await tx.rideRequest.findFirst({ where: requestOwnerWhere(requestHeader) })
      if (!existing) throw new Error('Original receipt ownership is unavailable.')
      return recoverRequestReceipt(existing, quoteHeader, intent, args.quoteProof)
    }
    const quote = await tx.rideQuote.findFirst({ where: { id: quoteHeader.id, riderId, fareSnapshot: { path: ['_quoteOwner', 'kind'], equals: riderId ? 'account' : 'guest' } } })
    // After commit the original quote is a recovery credential only, bounded by the
    // stored request receipt expiry/hash. It can never create a new expired request.
    if (!quote || !quote.guestProofHash || !verifyOwnershipProof(args.quoteProof, 'quote', quote.publicId, quote.guestProofHash, quote.requestId ? 0 : Date.now()) || (quote.riderId && quote.riderId !== intent.riderId)) throw new Error('Quote is invalid or not owned by this session.')
    if (quote.requestId) {
      const existing = await tx.rideRequest.findUnique({ where: { id: quote.requestId } })
      if (!existing || quote.requestId !== existing.id) throw new Error('Request receipt is temporarily unavailable; retry with the same quote proof.')
      const service = quote.serviceId ? await tx.rideService.findUnique({ where: { id: quote.serviceId }, select: { fleetId: true } }) : null
      if (!service?.fleetId || service.fleetId !== existing.fleetId) throw new Error('Original request binding is unavailable.')
      return recoverRequestReceipt(existing, quote, intent, args.quoteProof)
    }

    // Original committed receipt recovery above is read-only and requires no
    // external provider activation. The operational creation barrier stays closed.
    if (quote.status !== 'active' || quote.expiresAt <= new Date()) throw new Error('Quote is invalid or expired.')
    const quoteSnapshot = quote.fareSnapshot && typeof quote.fareSnapshot === 'object' && !Array.isArray(quote.fareSnapshot) ? quote.fareSnapshot as Record<string, unknown> : {}
    const serviceSnapshot = quoteSnapshot.service && typeof quoteSnapshot.service === 'object' ? quoteSnapshot.service as Record<string, unknown> : {}
    const passengerCount = intent.passengerCount
    if (passengerCount > Number(serviceSnapshot.passengerCapacity || 0)) throw new Error('Passenger count exceeds the quoted service capacity.')
    const accessibilityNeeds = intent.accessibilityNeeds
    if (accessibilityNeeds.wheelchairAccessible === true && serviceSnapshot.wheelchairAccessible !== true) throw new Error('The quoted service does not meet the accessibility requirement.')
    const requestNumber = `RIDE-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`
    const proofExpiry = new Date(Date.now() + 24 * 60 * 60_000)
    const requestId = randomUUID()
    const receiptProof = createRecoverableRequestProof(requestId, requestNumber, proofExpiry, args.quoteProof)
    if (!quote.serviceId) throw new Error('The quote no longer references a service.')
    const service = await requireServiceReadiness(tx, quote.serviceId)
    if (!service?.fleetId) throw new Error('The quoted service is no longer attached to an operating fleet.')
    await requireFleetOperations(tx, service.fleetId)
    const request = await tx.rideRequest.create({ data: {
      id: requestId, fleetId: service.fleetId, riderId: intent.riderId, requestNumber, status: 'requested', requestedFor: quote.scheduledFor,
      passengerCount, accessibilityNeeds, riderNotes: intent.riderNotes,
      pickupLabel: quote.pickupLabel, dropoffLabel: quote.dropoffLabel, preciseRouteEncryptedRef: intent.preciseRouteEncryptedRef, quoteSnapshot: { ...quoteSnapshot, _requestReceipt: receiptBinding(quote, service.fleetId, intent) } as Prisma.InputJsonValue,
      guestProofHash: receiptProof.hash, guestProofExpiresAt: proofExpiry,
    } })
    await tx.rideQuote.update({ where: { id: quote.id }, data: { status: 'accepted', request: { connect: { id: request.id } } } })
    return { requestId: request.id, requestNumber, status: request.status, requestProof: receiptProof.token, replayed: false }
  }, { isolationLevel: 'Serializable' })
}

export async function publicRideshareRequest(_root: unknown, args: { requestId: string; requestProof: string }, context: any) {
  return riderRequestStatus(_root, args, context)
}

/** Explicit resolution uses EXACTLY requestRide's quote lock. A closed unused
 * quote can never be consumed by a delayed original submit. */
export async function resolveRideRequestIntent(_root: unknown, args: Parameters<typeof requestRide>[1], context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    const riderId = await currentRiderId(tx, context.session)
    const intent = requestIntent(args, riderId)
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${args.quoteId}, 0))::text IS NOT NULL`
    const header = await tx.rideQuote.findUnique({ where: { publicId: args.quoteId }, select: { id: true, publicId: true, riderId: true, guestProofHash: true, requestId: true } })
    if (!header?.guestProofHash || typeof args.quoteProof !== 'string' || args.quoteProof.length > 4096 || !verifyOwnershipProof(args.quoteProof, 'quote', header.publicId, header.guestProofHash, 0) || header.riderId !== riderId) throw new Error('Original request intent is unavailable.')
    if (header.requestId) {
      const requestHeader = await tx.rideRequest.findUnique({ where: { id: header.requestId }, select: { id: true, riderId: true, fleetId: true } })
      if (!requestHeader || requestHeader.riderId !== riderId) throw new Error('Original request intent is unavailable.')
      const request = await tx.rideRequest.findFirst({ where: requestOwnerWhere(requestHeader) })
      if (!request) throw new Error('Original request intent is unavailable.')
      return { kind: 'request', quoteId: args.quoteId, receipt: recoverRequestReceipt(request, header, intent, args.quoteProof) }
    }
    const quote = await tx.rideQuote.findFirst({ where: { id: header.id, riderId, fareSnapshot: { path: ['_quoteOwner', 'kind'], equals: riderId ? 'account' : 'guest' } } })
    if (!quote) throw new Error('Original quote ownership provenance is unavailable.')
    const snapshot = quote.fareSnapshot || {}
    const binding = { version: 1, purpose: 'unused_quote_resolution', riderId, quoteId: header.publicId, intentHash: requestIntentHash(intent) }
    if (snapshot._intentResolution) {
      if (JSON.stringify(snapshot._intentResolution.binding) !== JSON.stringify(binding)) throw new Error('Original resolution body is different.')
      if (quote.status !== 'void') throw new Error('Resolution state is unavailable.')
    } else {
      if (!['active', 'expired', 'void'].includes(quote.status)) throw new Error('Original quote state is unavailable.')
      const closed = await tx.rideQuote.updateMany({ where: { id: quote.id, requestId: null, status: quote.status }, data: { status: 'void', fareSnapshot: { ...snapshot, _intentResolution: { binding, result: 'closed_unused', occurredAt: new Date().toISOString() } } } })
      if (closed.count !== 1) throw new Error('Original quote changed; reconcile the same intent again.')
    }
    return { kind: 'closed_unused', quoteId: args.quoteId, receipt: null }
  }, { isolationLevel: 'Serializable' })
}
