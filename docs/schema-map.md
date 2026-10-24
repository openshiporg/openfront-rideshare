# Openfront Rideshare — schema map

Source: `features/keystone/models/**` (38 lists), `features/keystone/mutations/**` (custom GraphQL), `features/keystone/access.ts`, `features/keystone/mutations/onboarding.ts` (starter seed). Read 2026-10-24.

## How access shapes every workflow

- **Tenancy is the fleet.** Almost every list is filtered to the fleets where the actor has an active `FleetMembership` with a role that grants the capability (`access.ts → membershipRoles`):

  | Capability | Roles |
  |---|---|
  | operations | owner, dispatcher |
  | drivers | owner, dispatcher |
  | finance | owner, finance |
  | safety | owner, support |
  | fleetAdmin | owner |

  A global admin (`Role.canManageRoles`) sees every fleet.
- **Generic create/delete is closed on tenant lists** (`fleetScopedAccess`, `lockedFleetAccess`: `create: () => false`, `delete: () => false`). Tenant relationships (`fleet`, `driver`, `vehicle`, `trip`) are field-level immutable. Records are created by **semantic mutations** that set the parent server-side after an authority check.
- Those lists set `ui.hideCreate`/`hideDelete`. Generic **update** stays open on the fleet-scoped lists (Fleet, DriverProfile, Vehicle, ServiceArea, RideService, FareRule, Policy, ProviderConnection, RiderProfile) for descriptive fields. Status fields that gate dispatch (DriverProfile.status/dispatchStatus, Vehicle.status) are field-locked and change only through review mutations.
- **Riders** are `User`s (optionally with a `RiderProfile`). Guests book with a signed request proof kept in the browser (`requestProof`). Account riders own their requests through `RideRequest.rider`.
- **Commands are idempotent.** Dispatch, transitions, cancellations, payments and trip submissions take an `idempotencyKey`, persist the original intent in the browser, and record a `TripEvent` or command row, so a lost response is recovered rather than resent.

## Lists

| List | Purpose here | Key fields | Relationships | Created by | States / transitions |
|---|---|---|---|---|---|
| User | Staff, drivers and riders | name, email, password, phone, onboardingStatus | role, fleetMemberships, driverProfile, riderProfile, requestedRides, trips, reviews | First-run setup; rider signup when a fleet opens rider accounts; staff by people managers | onboarding: not_started → in_progress → completed/dismissed |
| Role | Global permission sets | name, can* booleans | assignedTo (users) | First user gets Admin (User hook); admins | — |
| Fleet | The operating business (tenant) | name, slug, status, city, currency, timezone, logoIcon/Color, operationsMode, riderAccounts | memberships, drivers, vehicles, serviceAreas, services, fareRules, rides, trips, policies, providers, marketplaceRegistration | `setupFleet`, onboarding seed | status setup → active ↔ paused; operationsMode off ↔ manual; riderAccounts closed ↔ open |
| FleetMembership | Staff seat in a fleet | role (owner/dispatcher/support/finance/viewer), status, invitedAt, acceptedAt | fleet, user | `setupFleet` (owner), onboarding, `addFleetMember` | invited → active ↔ suspended |
| DriverProfile | A driver of the fleet | publicName, bio, status, dispatchStatus, acceptsScheduled | user, fleet, documents, vehicles, availabilityRules/Exceptions, policyEvaluations, matchOffers, trips | `addFleetDriver`, seed | status applicant/pending_review → active ↔ paused → ineligible/offboarded (`reviewDriver`); dispatchStatus offline ↔ available → offered → assigned → on_trip (`setDriverOnline`, dispatch, trip transitions) |
| RiderProfile | Rider preferences and safety data | displayName, savedPlaces, emergencyContactEncryptedRef | user, homeFleet | System (rider flows) | — |
| FleetBrandingChange | Branding save journal | command, result | fleet | `saveFleetBranding` | append-only |
| Vehicle | A car the fleet dispatches | label, make, model, year, colour, plateMasked, capacity, wheelchairAccessible, status | fleet, drivers, documents, policyEvaluations, trips | `addFleetVehicle`, seed | pending_review → active ↔ maintenance → suspended/retired (`reviewVehicle`) |
| ComplianceDocument | Licence, insurance, registration, inspection evidence | kind, status, issuer, referenceMasked, issuedAt, expiresAt, reviewer | driver or vehicle | `addComplianceDocument`, seed | submitted → accepted_evidence / rejected_evidence → revoked; expired by date |
| Policy | Eligibility or other rule set per fleet | kind, status, version, requirements | fleet, evaluations | `reviewDriver`/`reviewVehicle` (on first review), seed | draft → active → retired (one active per kind) |
| PolicyEvaluation | Recorded eligibility decision | outcome, reasons, evidenceSnapshot.policyVersion, evaluatedAt, expiresAt | policy, driver or vehicle, evaluator | `reviewDriver`/`reviewVehicle`, seed | append-only; dispatch reads the latest current `eligible` |
| ProviderConnection | Mapping/notification/identity/background-check adapter refs | kind, provider, status, config, secretReference | fleet | Seed; edited in generic list | draft/active |
| ServiceArea | Where the fleet drives | name, publicRegionLabel, countryCode, status, coarseBounds | fleet, services, fareRules | `setupServiceArea`, seed | draft → active ↔ paused |
| RideService | A bookable ride type | name, slug, category, capacity, wheelchairAccessible, advanceBookingMinutes, status | fleet, serviceAreas, fareRules, quotes | `setupRideService`, seed | draft → active ↔ paused |
| AvailabilityRule | Driver weekly hours | dayOfWeek, startTime, endTime, timezone, status, effectiveFrom/Until | driver | `setDriverAvailability`, seed | active → paused (replaced) |
| AvailabilityException | Driver time off or extra hours | startsAt, endsAt, kind (available/blocked), reason | driver | `addDriverTimeOff` | removed with `removeDriverTimeOff` |
| FareRule | Versioned price for service × area | currency, base/per-distance/per-minute/booking/minimum/cancellation/no-show (minor units), distanceUnit, multipliers, version, status | fleet, service, serviceArea, quotes | `setupFareRule`, seed | draft → active → retired (new active version retires the old) |
| RideQuote | Priced, expiring offer to a rider | publicId, pickup/dropoff labels, route evidence, fareSnapshot, totalMinor, expiresAt | service, fareRule, rider, request | `marketplaceRideshareQuote` (storefront) | active → accepted (request) / expired / void |
| RideRequest | A rider's booking | requestNumber, status, requestedFor, passengerCount, accessibilityNeeds, labels, quoteSnapshot | fleet, rider, quote, matchOffers, trip | `requestRide` (storefront) | requested → matching → matched; cancelled (`cancelRideRequest`) / expired |
| RequestCancellationCommand | Idempotent request-cancel journal | idempotencyKey, command, result | request | `cancelRideRequest` | append-only |
| MatchOffer | Dispatch offer to a driver + vehicle | status, offeredAt, expiresAt, reservation window | request, driver, vehicle, acceptedTrip | `offerRideToDriver` (Dispatch) | offered → accepted / declined / expired / withdrawn (`respondToRideOffer`, `expireRideOffers`) |
| Trip | The ride being driven | confirmationCode, status, scheduledFor, timestamps per stage, bookingSnapshot, finalFareSnapshot | fleet, request, acceptedOffer, rider, driver, vehicle, events, locationEvents, cancellations, payments, ledgerEntries, incidents, supportCases, conversation, reviews | `respondToRideOffer` (accept) | driver_assigned → driver_en_route → driver_arrived → in_progress → completed; cancelled (`cancelRide`); no_show (`transitionTrip`) |
| TripEvent | Trip audit log and command receipts | eventType, from/toStatus, actorType, idempotencyKey, metadata | trip, actorUser | System (every transition/submission) | append-only |
| LocationEvent | Coarse driver location | recordedAt, coarseGeohash, encryptedCoordinateRef, expiresAt | trip | `recordTripLocation` | append-only, expiring |
| Cancellation | Trip cancellation record | actorType, reasonCode, fee, refundRequired | trip | `cancelRide` | append-only |
| SafetyIncident | Safety report on a trip | caseNumber, severity, status, category, summary, restrictedDetails | trip, reportedBy, assignedTo | `reportSafetyIncident` (rider/driver) | open → triage → investigating → resolved → closed (`updateSafetyIncident`) |
| SupportCase | Help request on a trip | caseNumber, status, category, subject, description | trip, requester, assignedTo | `openSupportCase` (rider/driver) | open → waiting → resolved → closed (`updateSupportCase`) |
| Conversation | Trip message thread | status | trip, messages | `sendTripMessage` (first message) | open → closed/blocked |
| Message | One trip message | senderType, body, status | conversation, sender | `sendTripMessage` | queued → sent → delivered / failed / blocked |
| Review | Rating after a trip | direction, rating, body, status | trip, author | `submitTripReview` (completed trip participants) | pending → published / hidden / removed (`moderateReview`) |
| PaymentProvider | Installed payment adapter | name, code, isInstalled, adapter function names | payments, refunds, payouts | Seed (`pp_manual`); integrations managers | — |
| Payment | Rider charge for a trip | amountMinor, currency, status, providerReference, capturedAt | trip, provider, refunds, ledgerEntries | `initiateTripPayment` | pending → captured (`confirmManualPayment` for manual) → partially_refunded/refunded; failed/cancelled |
| Refund | Money returned | amountMinor, status, reason | payment, provider | `requestTripRefund` | requested → processing → succeeded (`confirmManualRefund`) / failed / cancelled |
| PaymentObservation | Immutable provider observations | observationKey, details | payment, refund | System (payment/refund flows) | append-only |
| LedgerEntry | Money journal | kind (rider_charge, tax, platform_fee, driver_earning, fleet_share, tip, refund, adjustment, payout_transfer), amount, effectiveAt | trip, payment, payout | `confirmManualPayment`, `confirmManualRefund` | append-only |
| Payout | Driver settlement | amount, status, period | driver, provider, ledgerEntries | Not yet (see Gaps) | pending → approved → submitted → paid / failed / cancelled |
| Notification | Outbound message intents | channel, templateKey, status | trip | System | queued → sent / failed |
| MarketplaceRegistration | Discovery listing of the fleet | sourceId, platform, status, capabilities | fleet | Seed | draft → active → paused/revoked |

## Workflows

| # | Workflow | Steps | Lists touched |
|---|---|---|---|
| W1 | Fleet setup and go-live | create fleet → staff → area → service → fare → status Active + manual dispatch → rider accounts | Fleet, FleetMembership, ServiceArea, RideService, FareRule |
| W2 | Driver onboarding | add driver → documents → accept documents → approve driver (eligibility) → vehicle + documents → approve vehicle → hours/time off → go online | DriverProfile, ComplianceDocument, Policy, PolicyEvaluation, Vehicle, AvailabilityRule, AvailabilityException |
| W3 | Rider booking | browse services → quote → request → receipt → status → history → cancel request | RideService, ServiceArea, FareRule, RideQuote, RideRequest, RequestCancellationCommand |
| W4 | Dispatch and trip | open requests → candidates → offer → driver accept/decline → en route → arrived → on trip → completed / no-show / cancel & reassign | RideRequest, MatchOffer, Trip, TripEvent, LocationEvent, Cancellation |
| W5 | Payment | record charge → mark received (manual) → refund → mark refunded → ledger | Payment, PaymentProvider, PaymentObservation, Refund, LedgerEntry |
| W6 | After the ride | rate → review moderation | Review |
| W7 | Safety and support | rider/driver reports → triage → investigate → resolve → close; help case → waiting → resolved | SafetyIncident, SupportCase, Conversation, Message |
| W8 | Driver settlement | earnings → payout → paid | LedgerEntry, Payout |
| W9 | Branding and discovery | logo/hue → storefront; marketplace registration | Fleet, FleetBrandingChange, MarketplaceRegistration |

## Coverage

Routes are under `/dashboard/platform/…` (slice `features/platform/<slice>`) unless noted. "Before" is commit `a729db6` (the redesign plus QA r1). "After" is this coverage pass.

| Workflow / list | Before | After |
|---|---|---|
| W1 Fleet create | **MISSING** (onboarding seed only) | Settings → Operations "New fleet" (`settings`) |
| W1 Go-live (status, dispatch, rider accounts) | Settings → Operations (`settings`), dispatch only | Same, plus status and rider accounts tracks, live checklist |
| W1 Staff (FleetMembership) | **MISSING** | `/platform/team` (`team`): members, add by email, role, suspend/reactivate |
| W1 ServiceArea / RideService / FareRule | **MISSING** (create blocked) | `/platform/services` (`services`): add, activate/pause, fare versions |
| W2 Drivers list | THIN (read-only rows) | `/platform/drivers` (`drivers`): add driver, missing-document flags, rows link to detail |
| W2 Driver detail, documents, review, hours | **MISSING** | `/platform/drivers/[id]` (`drivers`): review track, online/offline, documents accept/reject, vehicles, weekly hours, time off, checks, trips |
| W2 Vehicles (fleet-wide) | **MISSING** | `/platform/vehicles` (`vehicles`): status tabs, add, approve/maintenance/retire, documents, driver links |
| W2 AvailabilityException (time off) | **MISSING** | Driver detail → Time off |
| W2 Policy / PolicyEvaluation | THIN (generic list) | Created and shown by driver/vehicle review (driver detail → Eligibility checks); policy text editable in the generic list |
| W3 Storefront booking → history | Complete (`storefront`) | Unchanged |
| W4 Dispatch | `/platform/dispatch` (`dispatch`) | Plus Cancelled and Expired history tabs |
| W4 Trips list | `/platform/trips` (`trips`) | Rows link to trip detail |
| W4 Trip detail (events, cancellations, payments, incidents, reviews, messages) | THIN (inline history only) | `/platform/trips/[id]` (`trips`): timeline, actions, payments, messages, cases, reviews |
| W4 Driver workspace | `/platform/my-driving` | Plus Go online/offline |
| W5 Payments | THIN (read-only list) | Finance rows link to trip; trip detail records the charge, marks it received, refunds and marks refunds done |
| W5 Refund / Ledger / Observation | **MISSING** | Trip detail → Payments (refunds, ledger lines); observations are system records shown via payment status |
| W6 Reviews | **MISSING** | `/platform/reviews` (`reviews`): pending/published/hidden, publish/hide |
| W6 Rider rating | **MISSING** (storefront) | Trip status page → Rate this ride (signed-in riders) |
| W7 Safety incidents | THIN (read-only) | `/platform/safety`: triage → investigating → resolved → closed, assign to me, link to trip |
| W7 Support cases | THIN (read-only) | `/platform/safety`: waiting → resolved → closed, link to trip |
| W7 Rider help / safety report / message | **MISSING** (storefront) | Trip status page → Get help, Report a safety issue, Message driver (signed-in riders) |
| W7 Conversation / Message | **MISSING** | Trip detail → Messages (operator can reply) |
| W8 Payout | **MISSING** | **MISSING** (see Gaps) |
| W9 Branding | Settings → Storefront logo | Unchanged |
| W9 MarketplaceRegistration | Generic list | Generic list (system record) |
| RideQuote, RequestCancellationCommand, TripEvent, LocationEvent, PaymentObservation, FleetBrandingChange, Notification | Generic list | Covered by their parents: request/receipt (storefront), trip detail timeline, payment status, branding settings |
| ProviderConnection, PaymentProvider | Generic list | Generic list (integration config) |
| RiderProfile, User, Role | Generic list | Generic list (shared people screens) |

## Gaps left on purpose

- **Payouts (W8):** the codebase states "No payout or revenue journal is posted until a reviewed allocation policy and settlement workflow exist" (`rideLifecycle.ts`). Building payouts needs an owner decision on the driver/fleet split. The schema is ready.
- **Card payments:** only the manual adapter is installed. Stripe needs env vars the deployment rules don't allow (QA-011).
- **Guest riders** can't rate, open a case or message: those mutations require the signed-in participant. Guests can still sign in with the account they booked with.
