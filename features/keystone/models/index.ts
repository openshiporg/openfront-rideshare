import { PaymentObservation } from './PaymentObservation'
import { RequestCancellationCommand } from './RequestCancellationCommand'
import { FleetBrandingChange } from './FleetBrandingChange'
import { User } from './User'
import { Role } from './Role'
import { Fleet, FleetMembership, DriverProfile, RiderProfile } from './Identity'
import { Vehicle, ComplianceDocument, Policy, PolicyEvaluation, ProviderConnection } from './Operations'
import { ServiceArea, RideService, AvailabilityRule, AvailabilityException, FareRule, RideQuote } from './Service'
import { RideRequest, MatchOffer, Trip, TripEvent, LocationEvent, Cancellation } from './Ride'
import { SafetyIncident, SupportCase, Conversation, Message, Review } from './Safety'
import { PaymentProvider, Payment, Refund, LedgerEntry, Payout } from './Finance'
import { Notification, MarketplaceRegistration } from './Integration'

export const models = {
  User, Role, FleetBrandingChange, Fleet, FleetMembership, DriverProfile, RiderProfile,
  Vehicle, ComplianceDocument, Policy, PolicyEvaluation, ProviderConnection,
  ServiceArea, RideService, AvailabilityRule, AvailabilityException, FareRule, RideQuote,
  RideRequest, RequestCancellationCommand, MatchOffer, Trip, TripEvent, LocationEvent, Cancellation,
  SafetyIncident, SupportCase, Conversation, Message, Review,
  PaymentProvider, Payment, Refund, PaymentObservation, LedgerEntry, Payout,
  Notification, MarketplaceRegistration,
}
