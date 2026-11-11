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

const rawModels = {
  User, Role, FleetBrandingChange, Fleet, FleetMembership, DriverProfile, RiderProfile,
  Vehicle, ComplianceDocument, Policy, PolicyEvaluation, ProviderConnection,
  ServiceArea, RideService, AvailabilityRule, AvailabilityException, FareRule, RideQuote,
  RideRequest, RequestCancellationCommand, MatchOffer, Trip, TripEvent, LocationEvent, Cancellation,
  SafetyIncident, SupportCase, Conversation, Message, Review,
  PaymentProvider, Payment, Refund, PaymentObservation, LedgerEntry, Payout,
  Notification, MarketplaceRegistration,
}

// Sidebar visibility follows the role: a list whose query access denies the session is hidden from navigation
// (Keystone evaluates ui.isHidden per session in admin meta). Explicit isHidden settings are kept.
export const models = Object.fromEntries(Object.entries(rawModels).map(([key, config]: [string, any]) => {
  const query = config?.access?.operation?.query
  if (typeof query !== 'function') return [key, config]
  const existing = config?.ui?.isHidden
  const isHidden = async (args: any) => {
    if (existing === true) return true
    if (typeof existing === 'function' && await existing(args)) return true
    return !(await query(args))
  }
  return [key, { ...config, ui: { ...(config.ui ?? {}), isHidden } }]
})) as typeof rawModels
