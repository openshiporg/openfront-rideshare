import { fleetBranding, saveFleetBranding } from './fleetBranding'
import { mergeSchemas } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import { hasAnyFleetScope } from '../access'
import redirectToInit from './redirectToInit'
import { marketplaceRideshareQuote, marketplaceRideshareServices, publicRideshareRequest, requestRide, resolveRideRequestIntent, marketplaceRideshareService, marketplaceRideshareServiceAreas } from './marketplaceRideshare'
import { offerRideToDriver, publicRideshareTrip, respondToRideOffer, transitionTrip } from './rideLifecycle'
import { cancelRide, cancelRideRequest, openSupportCase, recordTripLocation, reportSafetyIncident, sendTripMessage, submitTripReview, tripCancellationPreview, riderRequestCancellationPreview } from './tripOperations'
import { initiateTripPayment, requestTripRefund } from './finance'
import { bootstrapRideshare, dismissRideshareOnboarding } from './onboarding'
import { myDriverWorkspace, myRideshareTrips } from './accountViews'
import { myRideshareRequests, riderRequestStatus } from './riderReceipts'
import { operatorTripHandoff } from './operatorHandoffs'
import { expireRideOffers, expireRequestFleetOffers } from './offerMaintenance'
import { riderTripHistory } from './riderTripHistory'
import { dispatchCandidatePage } from './dispatchCandidates'

const graphql = String.raw

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({ schemas: [baseSchema], typeDefs: graphql`
    type MarketplaceFleet { logoIcon: String, logoColor: String, id: ID!, name: String!, publicDescription: String, publicCity: String, countryCode: String }
    type RideshareExtension { schema: String!, value: JSON! }
    type RideReadiness { bookingEnabled: Boolean!, mode: String!, reason: String! }
    type OfferMaintenanceResult { releasedCount: Int!, hasMore: Boolean! }
    type PublicServiceArea { id: ID!, name: String!, publicRegionLabel: String!, countryCode: String }
    type PublicServiceAreaPage { items: [PublicServiceArea!]!, nextCursor: ID }
    type MarketplaceRideshareService { nextCursor: String, areasTruncated: Boolean!, id: ID!, title: String!, description: String, category: String!, passengerCapacity: Int!, wheelchairAccessible: Boolean!, advanceBookingMinutes: Int!, publicRegionLabels: [String!]!, fleet: MarketplaceFleet!, startingFareMinor: Int, currencyCode: String!, extension: RideshareExtension!, readiness: RideReadiness! }
    type FareBreakdown { currencyCode: String!, baseFareMinor: Int!, distanceMinor: Int!, durationMinor: Int!, bookingFeeMinor: Int!, multiplierBasisPoints: Int!, subtotalMinor: Int!, totalMinor: Int! }
    type MarketplaceRideQuote { quoteId: ID!, quoteProof: String!, expiresAt: DateTime!, pickupLabel: String!, dropoffLabel: String!, scheduledFor: DateTime, estimatedDistanceMeters: Int!, estimatedDurationSeconds: Int!, cancellationFeeMinor: Int!, noShowFeeMinor: Int!, fare: FareBreakdown!, estimateDisclosure: String!, sourceCheckoutPath: String! }
    type RideRequestReceipt { requestId: ID!, requestNumber: String!, status: String!, requestProof: String!, replayed: Boolean! }
    type RideIntentResolution { kind: String!, quoteId: ID!, receipt: RideRequestReceipt }
    type RideRequestCancellation { requestId: ID!, status: String!, replayed: Boolean!, alreadyCancelled: Boolean! }
    type PublicRequestTrip { fleetBrand: JSON, id: ID!, historyTruncated: Boolean!, confirmationCode: String!, status: String!, scheduledFor: DateTime, acceptedAt: DateTime, enRouteAt: DateTime, arrivedAt: DateTime, startedAt: DateTime, completedAt: DateTime, cancelledAt: DateTime, pickupLabel: String, dropoffLabel: String, bookingSnapshot: JSON!, finalFareSnapshot: JSON, events: [PublicTripEvent!]!, payments: [PublicTripPayment!]!, reviews: [PublicTripReview!]! }
    type PublicRideshareRequest { fleetBrand: JSON, requestId: ID!, requestNumber: String!, status: String!, requestedFor: DateTime, pickupLabel: String, dropoffLabel: String, createdAt: DateTime!, handoffState: String!, trip: PublicRequestTrip }
    type RiderRequestHistory { items: [PublicRideshareRequest!]!, nextCursor: ID }
    type OperatorTripHandoff { available: Boolean!, tripId: ID!, status: String!, requestId: ID, requestNumber: String, requestStatus: String, acceptedOfferId: ID, historyTruncated: Boolean!, events: [PublicTripEvent!]!, nextCursor: String }
    type RideOfferResponse { accepted: Boolean!, requestId: ID!, tripId: ID, confirmationCode: String, tripToken: String }
    type RideshareBootstrapResult { fleetId: ID!, created: Boolean!, summary: JSON! }
    type PublicTripEvent { eventType: String!, fromStatus: String, toStatus: String, occurredAt: DateTime! }
    type PublicTripPayment { amountMinor: Int, currencyCode: String, status: String }
    type PublicTripReview { direction: String, rating: Int, body: String, status: String, submittedAt: DateTime }
    type PublicRideshareTrip { requestId: ID!, fleetBrand: JSON, id: ID!, historyTruncated: Boolean!, confirmationCode: String!, status: String!, scheduledFor: DateTime, acceptedAt: DateTime, enRouteAt: DateTime, arrivedAt: DateTime, startedAt: DateTime, completedAt: DateTime, cancelledAt: DateTime, pickupLabel: String, dropoffLabel: String, bookingSnapshot: JSON!, finalFareSnapshot: JSON, events: [PublicTripEvent!]!, payments: [PublicTripPayment!]!, reviews: [PublicTripReview!]! }
    type DriverWorkspaceDriver { id: ID!, publicName: String!, status: String, dispatchStatus: String }
    type DriverWorkspaceRequest { id: ID!, requestNumber: String!, requestedFor: DateTime, passengerCount: Int, pickupLabel: String, dropoffLabel: String }
    type DriverWorkspaceVehicle { id: ID!, label: String!, make: String, model: String, color: String, plateMasked: String }
    type DriverWorkspaceOffer { id: ID!, status: String!, offeredAt: DateTime, expiresAt: DateTime!, request: DriverWorkspaceRequest, vehicle: DriverWorkspaceVehicle }
    type DriverWorkspaceTripVehicle { id: ID!, label: String!, plateMasked: String }
    type DriverWorkspaceTrip { acceptedOfferId: ID, id: ID!, confirmationCode: String!, status: String!, scheduledFor: DateTime, pickupLabel: String, dropoffLabel: String, vehicle: DriverWorkspaceTripVehicle }
    type DriverWorkspace { actorId: ID!, offersNextCursor: String, tripsNextCursor: String, driver: DriverWorkspaceDriver, offers: [DriverWorkspaceOffer!]!, trips: [DriverWorkspaceTrip!]!, actionsEnabled: Boolean!, actionsBlockedReason: String }
    type RiderTripSummary { id: ID!, confirmationCode: String!, status: String!, scheduledFor: DateTime, pickupLabel: String, dropoffLabel: String, bookingSnapshot: JSON!, finalFareSnapshot: JSON, createdAt: DateTime! }
    type Query {
      redirectToInit: Boolean
      marketplaceRideshareServices(query: String, location: String, limit: Int, after: String): [MarketplaceRideshareService!]!
      marketplaceRideshareService(id: ID!): MarketplaceRideshareService
      marketplaceRideshareServiceAreas(serviceId: ID!, after: ID): PublicServiceAreaPage!
      publicRideshareTrip(confirmationCode: String!, tripToken: String, requestId: ID, requestProof: String): PublicRideshareTrip
      riderRequestStatus(requestId: ID!, requestProof: String): PublicRideshareRequest
      myRideshareRequests(cursor: ID): RiderRequestHistory!
      operatorTripHandoff(tripId: ID!, cursor: String): OperatorTripHandoff
      publicRideshareRequest(requestId: ID!, requestProof: String!): PublicRideshareRequest
      myDriverWorkspace(offersCursor: String, tripsCursor: String): DriverWorkspace!
      myRideshareTrips: [RiderTripSummary!]!
      safetyQueueScope: Boolean!
      financeQueueScope: Boolean!
      rideshareCapabilities: JSON!
      riderAccountOptions: JSON!
      fleetBranding(fleetId: ID!): JSON
      tripCancellationPreview(tripId: ID!): JSON
      riderRequestCancellationPreview(requestId: ID!, requestProof: String): JSON
      riderTripHistory(requestId: ID!, requestProof: String, kind: String!, cursor: String): JSON
      dispatchCandidatePage(requestId: ID!, cursor: String, query: String): JSON
      dispatchQueueScope: Boolean!
    }
    type Mutation {
      marketplaceRideshareQuote(serviceId: ID!, pickupLabel: String!, dropoffLabel: String!, scheduledFor: DateTime, passengerCount: Int, wheelchairAccessible: Boolean, handoffId: String): MarketplaceRideQuote!
      requestRide(quoteId: ID!, quoteProof: String!, passengerCount: Int, accessibilityNeeds: JSON, riderNotes: String, preciseRouteEncryptedRef: String): RideRequestReceipt!
      resolveRideRequestIntent(quoteId: ID!, quoteProof: String!, passengerCount: Int, accessibilityNeeds: JSON, riderNotes: String, preciseRouteEncryptedRef: String): RideIntentResolution!
      offerRideToDriver(requestId: ID!, driverId: ID!, vehicleId: ID!, expiresInSeconds: Int, idempotencyKey: String!, expectedActorId: ID!): MatchOffer!
      respondToRideOffer(offerId: ID!, response: String!, reason: String, idempotencyKey: String!): RideOfferResponse!
      transitionTrip(tripId: ID!, action: String!, reason: String, idempotencyKey: String!, expectedActorId: ID!, expectedAcceptedOfferId: ID!): Trip!
      cancelRideRequest(requestId: ID!, requestProof: String, idempotencyKey: String!, expectedActorId: ID!): RideRequestCancellation!
      cancelRide(tripId: ID!, tripToken: String, reasonCode: String!, reason: String, idempotencyKey: String!, reassign: Boolean, expectedActorId: ID!, expectedAcceptedOfferId: ID!, expectedUpdatedAt: DateTime!, expectedFeeMinor: Int!, expectedCurrencyCode: String!): Cancellation!
      recordTripLocation(tripId: ID!, recordedAt: DateTime, coarseGeohash: String, encryptedCoordinateRef: String!, accuracyMeters: Int, providerEvidence: JSON): LocationEvent!
      submitTripReview(tripId: ID!, tripToken: String, rating: Int!, body: String, idempotencyKey: String!): Review!
      reportSafetyIncident(tripId: ID!, tripToken: String, severity: String, category: String, summary: String!, restrictedDetails: JSON, evidenceRefs: JSON, idempotencyKey: String!): SafetyIncident!
      openSupportCase(tripId: ID!, tripToken: String, category: String, subject: String!, description: String!, idempotencyKey: String!): SupportCase!
      sendTripMessage(tripId: ID!, tripToken: String, body: String!, idempotencyKey: String!): Message!
      initiateTripPayment(tripId: ID!, providerCode: String!, idempotencyKey: String!): Payment!
      requestTripRefund(paymentId: ID!, amountMinor: Int!, reason: String, idempotencyKey: String!): Refund!
      saveFleetBranding(fleetId: ID!, expectedUpdatedAt: DateTime!, logoIcon: String!, logoColor: String!, idempotencyKey: String!, expectedActorId: ID!): JSON!
      dismissRideshareOnboarding: Boolean!
      bootstrapRideshare(mode: String!): RideshareBootstrapResult!
      expireRideOffers(fleetId: ID!): OfferMaintenanceResult!
      expireRequestFleetOffers(requestId: ID!): OfferMaintenanceResult!
    }
  `, resolvers: {
    Query: {
      redirectToInit, marketplaceRideshareServices, marketplaceRideshareService, marketplaceRideshareServiceAreas, publicRideshareTrip, publicRideshareRequest, myDriverWorkspace, myRideshareTrips, riderRequestStatus, myRideshareRequests, operatorTripHandoff,
      safetyQueueScope: (_root, _args, context) => hasAnyFleetScope(context, context.session, 'safety'),
      financeQueueScope: (_root, _args, context) => hasAnyFleetScope(context, context.session, 'finance'),
      rideshareCapabilities: async (_root, _args, context) => Object.fromEntries(await Promise.all((['operations', 'drivers', 'finance', 'safety', 'fleetAdmin'] as const).map(async capability => [capability, await hasAnyFleetScope(context, context.session, capability)]))),
      tripCancellationPreview, riderRequestCancellationPreview, riderTripHistory, fleetBranding, dispatchCandidatePage,
      dispatchQueueScope: (_root, _args, context) => hasAnyFleetScope(context, context.session, 'operations'),
      riderAccountOptions: () => ({ registrationEnabled: process.env.PUBLIC_SIGNUPS_ALLOWED === 'true' }),
    },
    Mutation: { saveFleetBranding, marketplaceRideshareQuote, requestRide, resolveRideRequestIntent, offerRideToDriver, respondToRideOffer, transitionTrip, cancelRideRequest, cancelRide, recordTripLocation, submitTripReview, reportSafetyIncident, openSupportCase, sendTripMessage, initiateTripPayment, requestTripRefund, bootstrapRideshare, dismissRideshareOnboarding, expireRideOffers, expireRequestFleetOffers },
  } })
}
