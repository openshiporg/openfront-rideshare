/*
  Warnings:

  - You are about to drop the column `canCreateTodos` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the column `canEditOtherPeople` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the column `canManageAllTodos` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the column `canSeeOtherPeople` on the `Role` table. All the data in the column will be lost.
  - You are about to drop the `Todo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TodoImage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_Todo_todoImages` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name]` on the table `Role` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Todo" DROP CONSTRAINT "Todo_assignedTo_fkey";

-- DropForeignKey
ALTER TABLE "_Todo_todoImages" DROP CONSTRAINT "_Todo_todoImages_A_fkey";

-- DropForeignKey
ALTER TABLE "_Todo_todoImages" DROP CONSTRAINT "_Todo_todoImages_B_fkey";

-- AlterTable
ALTER TABLE "Role" DROP COLUMN "canCreateTodos",
DROP COLUMN "canEditOtherPeople",
DROP COLUMN "canManageAllTodos",
DROP COLUMN "canSeeOtherPeople",
ADD COLUMN     "canDispatchRides" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageDrivers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageFinance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageFleet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageIntegrations" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canManageSafety" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "onboardingStatus" TEXT DEFAULT 'not_started',
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "Todo";

-- DropTable
DROP TABLE "TodoImage";

-- DropTable
DROP TABLE "_Todo_todoImages";

-- CreateTable
CREATE TABLE "Fleet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'setup',
    "publicDescription" TEXT NOT NULL DEFAULT '',
    "publicCity" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "supportEmail" TEXT NOT NULL DEFAULT '',
    "supportPhone" TEXT NOT NULL DEFAULT '',
    "preciseLocationRetentionDays" TEXT NOT NULL DEFAULT '30',
    "marketplaceRegistration" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Fleet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetMembership" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "user" TEXT,
    "role" TEXT DEFAULT 'viewer',
    "status" TEXT DEFAULT 'invited',
    "invitedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "FleetMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "fleet" TEXT,
    "publicName" TEXT NOT NULL DEFAULT '',
    "publicBio" TEXT NOT NULL DEFAULT '',
    "publicPhotoUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'applicant',
    "dispatchStatus" TEXT DEFAULT 'offline',
    "acceptsScheduled" BOOLEAN NOT NULL DEFAULT true,
    "languages" JSONB DEFAULT '[]',
    "accessibilityTrainingEvidence" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiderProfile" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "homeFleet" TEXT,
    "displayName" TEXT NOT NULL DEFAULT '',
    "savedPlaces" JSONB DEFAULT '[]',
    "accessibilityPreferences" JSONB DEFAULT '{}',
    "communicationPreferences" JSONB DEFAULT '{}',
    "emergencyContactEncryptedRef" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RiderProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "make" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "year" INTEGER,
    "color" TEXT NOT NULL DEFAULT '',
    "plateMasked" TEXT NOT NULL DEFAULT '',
    "plateEncryptedRef" TEXT NOT NULL DEFAULT '',
    "vinEncryptedRef" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER DEFAULT 4,
    "wheelchairAccessible" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT DEFAULT 'pending_review',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDocument" (
    "id" TEXT NOT NULL,
    "driver" TEXT,
    "vehicle" TEXT,
    "kind" TEXT,
    "status" TEXT DEFAULT 'submitted',
    "issuer" TEXT NOT NULL DEFAULT '',
    "referenceMasked" TEXT NOT NULL DEFAULT '',
    "secureFileRef" TEXT NOT NULL DEFAULT '',
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewer" TEXT,
    "reviewNotes" TEXT NOT NULL DEFAULT '',
    "evidenceMetadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ComplianceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '',
    "jurisdiction" TEXT NOT NULL DEFAULT '',
    "kind" TEXT,
    "status" TEXT DEFAULT 'draft',
    "requirements" JSONB DEFAULT '{}',
    "evidenceSources" JSONB DEFAULT '[]',
    "disclaimer" TEXT NOT NULL DEFAULT 'Evidence recording is not legal approval or a compliance certification.',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyEvaluation" (
    "id" TEXT NOT NULL,
    "policy" TEXT,
    "driver" TEXT,
    "vehicle" TEXT,
    "outcome" TEXT DEFAULT 'pending',
    "reasons" JSONB DEFAULT '[]',
    "evidenceSnapshot" JSONB DEFAULT '[]',
    "evaluatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "evaluator" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PolicyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConnection" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT,
    "adapter" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'unconfigured',
    "config" JSONB DEFAULT '{}',
    "secretReference" TEXT NOT NULL DEFAULT '',
    "evidencePolicyUrl" TEXT NOT NULL DEFAULT '',
    "lastVerifiedAt" TIMESTAMP(3),
    "capabilities" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "publicRegionLabel" TEXT NOT NULL DEFAULT '',
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "status" TEXT DEFAULT 'draft',
    "coarseBounds" JSONB DEFAULT '{}',
    "providerGeometryRef" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideService" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'draft',
    "category" TEXT DEFAULT 'standard',
    "passengerCapacity" INTEGER DEFAULT 4,
    "wheelchairAccessible" BOOLEAN NOT NULL DEFAULT false,
    "advanceBookingMinutes" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RideService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "driver" TEXT,
    "dayOfWeek" INTEGER,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveUntil" TIMESTAMP(3),
    "status" TEXT DEFAULT 'active',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL,
    "driver" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT DEFAULT 'blocked',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FareRule" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "service" TEXT,
    "serviceArea" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "version" INTEGER DEFAULT 1,
    "status" TEXT DEFAULT 'draft',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "baseFareMinor" INTEGER DEFAULT 0,
    "perDistanceUnitMinor" INTEGER DEFAULT 0,
    "distanceUnit" TEXT DEFAULT 'mile',
    "perMinuteMinor" INTEGER DEFAULT 0,
    "bookingFeeMinor" INTEGER DEFAULT 0,
    "minimumFareMinor" INTEGER DEFAULT 0,
    "cancellationFeeMinor" INTEGER DEFAULT 0,
    "noShowFeeMinor" INTEGER DEFAULT 0,
    "maximumMultiplierBasisPoints" INTEGER DEFAULT 10000,
    "rules" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "FareRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideQuote" (
    "id" TEXT NOT NULL,
    "service" TEXT,
    "fareRule" TEXT,
    "publicId" TEXT NOT NULL DEFAULT '',
    "handoffId" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "pickupLabel" TEXT NOT NULL DEFAULT '',
    "dropoffLabel" TEXT NOT NULL DEFAULT '',
    "routeInputHash" TEXT NOT NULL DEFAULT '',
    "routeEvidence" JSONB DEFAULT '{}',
    "estimatedDistanceMeters" INTEGER,
    "estimatedDurationSeconds" INTEGER,
    "fareSnapshot" JSONB DEFAULT '{}',
    "totalMinor" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "scheduledFor" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "guestProofHash" TEXT NOT NULL DEFAULT '',
    "rider" TEXT,
    "request" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RideQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideRequest" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "rider" TEXT,
    "requestNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'requested',
    "requestedFor" TIMESTAMP(3),
    "passengerCount" INTEGER DEFAULT 1,
    "accessibilityNeeds" JSONB DEFAULT '{}',
    "riderNotes" TEXT NOT NULL DEFAULT '',
    "pickupLabel" TEXT NOT NULL DEFAULT '',
    "dropoffLabel" TEXT NOT NULL DEFAULT '',
    "preciseRouteEncryptedRef" TEXT NOT NULL DEFAULT '',
    "quoteSnapshot" JSONB DEFAULT '{}',
    "guestProofHash" TEXT NOT NULL DEFAULT '',
    "guestProofExpiresAt" TIMESTAMP(3),
    "trip" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchOffer" (
    "id" TEXT NOT NULL,
    "request" TEXT,
    "driver" TEXT,
    "vehicle" TEXT,
    "status" TEXT DEFAULT 'offered',
    "offeredAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "eligibilitySnapshot" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "MatchOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "fleet" TEXT,
    "rider" TEXT,
    "driver" TEXT,
    "vehicle" TEXT,
    "confirmationCode" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'driver_assigned',
    "scheduledFor" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "enRouteAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "pickupLabel" TEXT NOT NULL DEFAULT '',
    "dropoffLabel" TEXT NOT NULL DEFAULT '',
    "bookingSnapshot" JSONB DEFAULT '{}',
    "finalFareSnapshot" JSONB,
    "managementTokenHash" TEXT NOT NULL DEFAULT '',
    "managementTokenExpiresAt" TIMESTAMP(3),
    "managementTokenRevokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "eventType" TEXT NOT NULL DEFAULT '',
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "actorType" TEXT,
    "actorUser" TEXT,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "TripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationEvent" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "actorType" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "coarseGeohash" TEXT NOT NULL DEFAULT '',
    "encryptedCoordinateRef" TEXT NOT NULL DEFAULT '',
    "accuracyMeters" INTEGER,
    "providerEvidence" JSONB DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "LocationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cancellation" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "actorType" TEXT,
    "reasonCode" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "policySnapshot" JSONB DEFAULT '{}',
    "feeMinor" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "refundRequired" TEXT DEFAULT 'no',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Cancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyIncident" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "caseNumber" TEXT NOT NULL DEFAULT '',
    "severity" TEXT DEFAULT 'medium',
    "status" TEXT DEFAULT 'open',
    "category" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "restrictedDetails" JSONB DEFAULT '{}',
    "evidenceRefs" JSONB DEFAULT '[]',
    "reportedBy" TEXT,
    "assignedTo" TEXT,
    "reportedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SafetyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "caseNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'open',
    "category" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "priority" TEXT DEFAULT 'normal',
    "requester" TEXT,
    "assignedTo" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "status" TEXT DEFAULT 'open',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversation" TEXT,
    "senderType" TEXT,
    "sender" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "relayProviderReference" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'queued',
    "sentAt" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "author" TEXT,
    "direction" TEXT,
    "rating" INTEGER,
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "moderatedAt" TIMESTAMP(3),
    "moderationReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "isInstalled" TEXT DEFAULT 'no',
    "credentialsReference" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "createPaymentFunction" TEXT NOT NULL DEFAULT '',
    "capturePaymentFunction" TEXT NOT NULL DEFAULT '',
    "refundPaymentFunction" TEXT NOT NULL DEFAULT '',
    "getPaymentStatusFunction" TEXT NOT NULL DEFAULT '',
    "handleWebhookFunction" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "provider" TEXT,
    "amountMinor" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'pending',
    "providerReference" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "providerEvidence" JSONB DEFAULT '{}',
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "payment" TEXT,
    "provider" TEXT,
    "amountMinor" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'requested',
    "providerReference" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "payment" TEXT,
    "payout" TEXT,
    "entryKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT,
    "account" TEXT NOT NULL DEFAULT '',
    "direction" TEXT,
    "amountMinor" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "effectiveAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "memo" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "driver" TEXT,
    "provider" TEXT,
    "amountMinor" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'pending',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "providerReference" TEXT NOT NULL DEFAULT '',
    "evidence" JSONB DEFAULT '{}',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "trip" TEXT,
    "recipient" TEXT,
    "channel" TEXT,
    "templateKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'queued',
    "payload" JSONB DEFAULT '{}',
    "providerReference" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "attemptCount" INTEGER DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceRegistration" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT 'openfront-rideshare',
    "status" TEXT DEFAULT 'draft',
    "manifestVersion" TEXT NOT NULL DEFAULT '1',
    "publicBaseUrl" TEXT NOT NULL DEFAULT '',
    "capabilities" JSONB DEFAULT '["marketplace.discovery","rideshare.quote","rideshare.request","rideshare.trip.view"]',
    "lastVerifiedAt" TIMESTAMP(3),
    "verificationEvidence" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DriverProfile_vehicles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_RideService_serviceAreas" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Fleet_slug_key" ON "Fleet"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Fleet_marketplaceRegistration_key" ON "Fleet"("marketplaceRegistration");

-- CreateIndex
CREATE INDEX "Fleet_createdAt_idx" ON "Fleet"("createdAt");

-- CreateIndex
CREATE INDEX "Fleet_updatedAt_idx" ON "Fleet"("updatedAt");

-- CreateIndex
CREATE INDEX "FleetMembership_fleet_idx" ON "FleetMembership"("fleet");

-- CreateIndex
CREATE INDEX "FleetMembership_user_idx" ON "FleetMembership"("user");

-- CreateIndex
CREATE INDEX "FleetMembership_createdAt_idx" ON "FleetMembership"("createdAt");

-- CreateIndex
CREATE INDEX "FleetMembership_updatedAt_idx" ON "FleetMembership"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_user_key" ON "DriverProfile"("user");

-- CreateIndex
CREATE INDEX "DriverProfile_fleet_idx" ON "DriverProfile"("fleet");

-- CreateIndex
CREATE INDEX "DriverProfile_createdAt_idx" ON "DriverProfile"("createdAt");

-- CreateIndex
CREATE INDEX "DriverProfile_updatedAt_idx" ON "DriverProfile"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiderProfile_user_key" ON "RiderProfile"("user");

-- CreateIndex
CREATE INDEX "RiderProfile_homeFleet_idx" ON "RiderProfile"("homeFleet");

-- CreateIndex
CREATE INDEX "RiderProfile_createdAt_idx" ON "RiderProfile"("createdAt");

-- CreateIndex
CREATE INDEX "RiderProfile_updatedAt_idx" ON "RiderProfile"("updatedAt");

-- CreateIndex
CREATE INDEX "Vehicle_fleet_idx" ON "Vehicle"("fleet");

-- CreateIndex
CREATE INDEX "Vehicle_createdAt_idx" ON "Vehicle"("createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_updatedAt_idx" ON "Vehicle"("updatedAt");

-- CreateIndex
CREATE INDEX "ComplianceDocument_driver_idx" ON "ComplianceDocument"("driver");

-- CreateIndex
CREATE INDEX "ComplianceDocument_vehicle_idx" ON "ComplianceDocument"("vehicle");

-- CreateIndex
CREATE INDEX "ComplianceDocument_reviewer_idx" ON "ComplianceDocument"("reviewer");

-- CreateIndex
CREATE INDEX "ComplianceDocument_createdAt_idx" ON "ComplianceDocument"("createdAt");

-- CreateIndex
CREATE INDEX "ComplianceDocument_updatedAt_idx" ON "ComplianceDocument"("updatedAt");

-- CreateIndex
CREATE INDEX "Policy_fleet_idx" ON "Policy"("fleet");

-- CreateIndex
CREATE INDEX "Policy_createdAt_idx" ON "Policy"("createdAt");

-- CreateIndex
CREATE INDEX "Policy_updatedAt_idx" ON "Policy"("updatedAt");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_policy_idx" ON "PolicyEvaluation"("policy");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_driver_idx" ON "PolicyEvaluation"("driver");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_vehicle_idx" ON "PolicyEvaluation"("vehicle");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_evaluator_idx" ON "PolicyEvaluation"("evaluator");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_createdAt_idx" ON "PolicyEvaluation"("createdAt");

-- CreateIndex
CREATE INDEX "PolicyEvaluation_updatedAt_idx" ON "PolicyEvaluation"("updatedAt");

-- CreateIndex
CREATE INDEX "ProviderConnection_fleet_idx" ON "ProviderConnection"("fleet");

-- CreateIndex
CREATE INDEX "ProviderConnection_createdAt_idx" ON "ProviderConnection"("createdAt");

-- CreateIndex
CREATE INDEX "ProviderConnection_updatedAt_idx" ON "ProviderConnection"("updatedAt");

-- CreateIndex
CREATE INDEX "ServiceArea_fleet_idx" ON "ServiceArea"("fleet");

-- CreateIndex
CREATE INDEX "ServiceArea_createdAt_idx" ON "ServiceArea"("createdAt");

-- CreateIndex
CREATE INDEX "ServiceArea_updatedAt_idx" ON "ServiceArea"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RideService_slug_key" ON "RideService"("slug");

-- CreateIndex
CREATE INDEX "RideService_fleet_idx" ON "RideService"("fleet");

-- CreateIndex
CREATE INDEX "RideService_createdAt_idx" ON "RideService"("createdAt");

-- CreateIndex
CREATE INDEX "RideService_updatedAt_idx" ON "RideService"("updatedAt");

-- CreateIndex
CREATE INDEX "AvailabilityRule_driver_idx" ON "AvailabilityRule"("driver");

-- CreateIndex
CREATE INDEX "AvailabilityRule_createdAt_idx" ON "AvailabilityRule"("createdAt");

-- CreateIndex
CREATE INDEX "AvailabilityRule_updatedAt_idx" ON "AvailabilityRule"("updatedAt");

-- CreateIndex
CREATE INDEX "AvailabilityException_driver_idx" ON "AvailabilityException"("driver");

-- CreateIndex
CREATE INDEX "AvailabilityException_createdAt_idx" ON "AvailabilityException"("createdAt");

-- CreateIndex
CREATE INDEX "AvailabilityException_updatedAt_idx" ON "AvailabilityException"("updatedAt");

-- CreateIndex
CREATE INDEX "FareRule_fleet_idx" ON "FareRule"("fleet");

-- CreateIndex
CREATE INDEX "FareRule_service_idx" ON "FareRule"("service");

-- CreateIndex
CREATE INDEX "FareRule_serviceArea_idx" ON "FareRule"("serviceArea");

-- CreateIndex
CREATE INDEX "FareRule_createdAt_idx" ON "FareRule"("createdAt");

-- CreateIndex
CREATE INDEX "FareRule_updatedAt_idx" ON "FareRule"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RideQuote_publicId_key" ON "RideQuote"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "RideQuote_request_key" ON "RideQuote"("request");

-- CreateIndex
CREATE INDEX "RideQuote_service_idx" ON "RideQuote"("service");

-- CreateIndex
CREATE INDEX "RideQuote_fareRule_idx" ON "RideQuote"("fareRule");

-- CreateIndex
CREATE INDEX "RideQuote_handoffId_idx" ON "RideQuote"("handoffId");

-- CreateIndex
CREATE INDEX "RideQuote_rider_idx" ON "RideQuote"("rider");

-- CreateIndex
CREATE INDEX "RideQuote_createdAt_idx" ON "RideQuote"("createdAt");

-- CreateIndex
CREATE INDEX "RideQuote_updatedAt_idx" ON "RideQuote"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RideRequest_requestNumber_key" ON "RideRequest"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RideRequest_trip_key" ON "RideRequest"("trip");

-- CreateIndex
CREATE INDEX "RideRequest_fleet_idx" ON "RideRequest"("fleet");

-- CreateIndex
CREATE INDEX "RideRequest_rider_idx" ON "RideRequest"("rider");

-- CreateIndex
CREATE INDEX "RideRequest_createdAt_idx" ON "RideRequest"("createdAt");

-- CreateIndex
CREATE INDEX "RideRequest_updatedAt_idx" ON "RideRequest"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchOffer_idempotencyKey_key" ON "MatchOffer"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MatchOffer_request_idx" ON "MatchOffer"("request");

-- CreateIndex
CREATE INDEX "MatchOffer_driver_idx" ON "MatchOffer"("driver");

-- CreateIndex
CREATE INDEX "MatchOffer_vehicle_idx" ON "MatchOffer"("vehicle");

-- CreateIndex
CREATE INDEX "MatchOffer_createdAt_idx" ON "MatchOffer"("createdAt");

-- CreateIndex
CREATE INDEX "MatchOffer_updatedAt_idx" ON "MatchOffer"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_confirmationCode_key" ON "Trip"("confirmationCode");

-- CreateIndex
CREATE INDEX "Trip_fleet_idx" ON "Trip"("fleet");

-- CreateIndex
CREATE INDEX "Trip_rider_idx" ON "Trip"("rider");

-- CreateIndex
CREATE INDEX "Trip_driver_idx" ON "Trip"("driver");

-- CreateIndex
CREATE INDEX "Trip_vehicle_idx" ON "Trip"("vehicle");

-- CreateIndex
CREATE INDEX "Trip_createdAt_idx" ON "Trip"("createdAt");

-- CreateIndex
CREATE INDEX "Trip_updatedAt_idx" ON "Trip"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripEvent_idempotencyKey_key" ON "TripEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TripEvent_trip_idx" ON "TripEvent"("trip");

-- CreateIndex
CREATE INDEX "TripEvent_actorUser_idx" ON "TripEvent"("actorUser");

-- CreateIndex
CREATE INDEX "TripEvent_createdAt_idx" ON "TripEvent"("createdAt");

-- CreateIndex
CREATE INDEX "TripEvent_updatedAt_idx" ON "TripEvent"("updatedAt");

-- CreateIndex
CREATE INDEX "LocationEvent_trip_idx" ON "LocationEvent"("trip");

-- CreateIndex
CREATE INDEX "LocationEvent_createdAt_idx" ON "LocationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LocationEvent_updatedAt_idx" ON "LocationEvent"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cancellation_trip_key" ON "Cancellation"("trip");

-- CreateIndex
CREATE INDEX "Cancellation_createdAt_idx" ON "Cancellation"("createdAt");

-- CreateIndex
CREATE INDEX "Cancellation_updatedAt_idx" ON "Cancellation"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyIncident_caseNumber_key" ON "SafetyIncident"("caseNumber");

-- CreateIndex
CREATE INDEX "SafetyIncident_trip_idx" ON "SafetyIncident"("trip");

-- CreateIndex
CREATE INDEX "SafetyIncident_reportedBy_idx" ON "SafetyIncident"("reportedBy");

-- CreateIndex
CREATE INDEX "SafetyIncident_assignedTo_idx" ON "SafetyIncident"("assignedTo");

-- CreateIndex
CREATE INDEX "SafetyIncident_createdAt_idx" ON "SafetyIncident"("createdAt");

-- CreateIndex
CREATE INDEX "SafetyIncident_updatedAt_idx" ON "SafetyIncident"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportCase_caseNumber_key" ON "SupportCase"("caseNumber");

-- CreateIndex
CREATE INDEX "SupportCase_trip_idx" ON "SupportCase"("trip");

-- CreateIndex
CREATE INDEX "SupportCase_requester_idx" ON "SupportCase"("requester");

-- CreateIndex
CREATE INDEX "SupportCase_assignedTo_idx" ON "SupportCase"("assignedTo");

-- CreateIndex
CREATE INDEX "SupportCase_createdAt_idx" ON "SupportCase"("createdAt");

-- CreateIndex
CREATE INDEX "SupportCase_updatedAt_idx" ON "SupportCase"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_trip_key" ON "Conversation"("trip");

-- CreateIndex
CREATE INDEX "Conversation_createdAt_idx" ON "Conversation"("createdAt");

-- CreateIndex
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");

-- CreateIndex
CREATE INDEX "Message_conversation_idx" ON "Message"("conversation");

-- CreateIndex
CREATE INDEX "Message_sender_idx" ON "Message"("sender");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "Message_updatedAt_idx" ON "Message"("updatedAt");

-- CreateIndex
CREATE INDEX "Review_trip_idx" ON "Review"("trip");

-- CreateIndex
CREATE INDEX "Review_author_idx" ON "Review"("author");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- CreateIndex
CREATE INDEX "Review_updatedAt_idx" ON "Review"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_code_key" ON "PaymentProvider"("code");

-- CreateIndex
CREATE INDEX "PaymentProvider_createdAt_idx" ON "PaymentProvider"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentProvider_updatedAt_idx" ON "PaymentProvider"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_trip_idx" ON "Payment"("trip");

-- CreateIndex
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_updatedAt_idx" ON "Payment"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_payment_idx" ON "Refund"("payment");

-- CreateIndex
CREATE INDEX "Refund_provider_idx" ON "Refund"("provider");

-- CreateIndex
CREATE INDEX "Refund_createdAt_idx" ON "Refund"("createdAt");

-- CreateIndex
CREATE INDEX "Refund_updatedAt_idx" ON "Refund"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_entryKey_key" ON "LedgerEntry"("entryKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_trip_idx" ON "LedgerEntry"("trip");

-- CreateIndex
CREATE INDEX "LedgerEntry_payment_idx" ON "LedgerEntry"("payment");

-- CreateIndex
CREATE INDEX "LedgerEntry_payout_idx" ON "LedgerEntry"("payout");

-- CreateIndex
CREATE INDEX "LedgerEntry_createdAt_idx" ON "LedgerEntry"("createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_updatedAt_idx" ON "LedgerEntry"("updatedAt");

-- CreateIndex
CREATE INDEX "Payout_driver_idx" ON "Payout"("driver");

-- CreateIndex
CREATE INDEX "Payout_provider_idx" ON "Payout"("provider");

-- CreateIndex
CREATE INDEX "Payout_createdAt_idx" ON "Payout"("createdAt");

-- CreateIndex
CREATE INDEX "Payout_updatedAt_idx" ON "Payout"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Notification_trip_idx" ON "Notification"("trip");

-- CreateIndex
CREATE INDEX "Notification_recipient_idx" ON "Notification"("recipient");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_updatedAt_idx" ON "Notification"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceRegistration_sourceId_key" ON "MarketplaceRegistration"("sourceId");

-- CreateIndex
CREATE INDEX "MarketplaceRegistration_createdAt_idx" ON "MarketplaceRegistration"("createdAt");

-- CreateIndex
CREATE INDEX "MarketplaceRegistration_updatedAt_idx" ON "MarketplaceRegistration"("updatedAt");

-- CreateIndex
ALTER TABLE "_DriverProfile_vehicles" ADD CONSTRAINT "_DriverProfile_vehicles_AB_pkey" PRIMARY KEY ("A", "B");

-- CreateIndex
CREATE INDEX "_DriverProfile_vehicles_B_index" ON "_DriverProfile_vehicles"("B");

-- CreateIndex
ALTER TABLE "_RideService_serviceAreas" ADD CONSTRAINT "_RideService_serviceAreas_AB_pkey" PRIMARY KEY ("A", "B");

-- CreateIndex
CREATE INDEX "_RideService_serviceAreas_B_index" ON "_RideService_serviceAreas"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Role_createdAt_idx" ON "Role"("createdAt");

-- CreateIndex
CREATE INDEX "Role_updatedAt_idx" ON "Role"("updatedAt");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_updatedAt_idx" ON "User"("updatedAt");

-- AddForeignKey
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_marketplaceRegistration_fkey" FOREIGN KEY ("marketplaceRegistration") REFERENCES "MarketplaceRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMembership" ADD CONSTRAINT "FleetMembership_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetMembership" ADD CONSTRAINT "FleetMembership_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiderProfile" ADD CONSTRAINT "RiderProfile_homeFleet_fkey" FOREIGN KEY ("homeFleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_driver_fkey" FOREIGN KEY ("driver") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDocument" ADD CONSTRAINT "ComplianceDocument_reviewer_fkey" FOREIGN KEY ("reviewer") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyEvaluation" ADD CONSTRAINT "PolicyEvaluation_policy_fkey" FOREIGN KEY ("policy") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyEvaluation" ADD CONSTRAINT "PolicyEvaluation_driver_fkey" FOREIGN KEY ("driver") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyEvaluation" ADD CONSTRAINT "PolicyEvaluation_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyEvaluation" ADD CONSTRAINT "PolicyEvaluation_evaluator_fkey" FOREIGN KEY ("evaluator") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderConnection" ADD CONSTRAINT "ProviderConnection_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideService" ADD CONSTRAINT "RideService_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_driver_fkey" FOREIGN KEY ("driver") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_driver_fkey" FOREIGN KEY ("driver") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FareRule" ADD CONSTRAINT "FareRule_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FareRule" ADD CONSTRAINT "FareRule_service_fkey" FOREIGN KEY ("service") REFERENCES "RideService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FareRule" ADD CONSTRAINT "FareRule_serviceArea_fkey" FOREIGN KEY ("serviceArea") REFERENCES "ServiceArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideQuote" ADD CONSTRAINT "RideQuote_service_fkey" FOREIGN KEY ("service") REFERENCES "RideService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideQuote" ADD CONSTRAINT "RideQuote_fareRule_fkey" FOREIGN KEY ("fareRule") REFERENCES "FareRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideQuote" ADD CONSTRAINT "RideQuote_rider_fkey" FOREIGN KEY ("rider") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideQuote" ADD CONSTRAINT "RideQuote_request_fkey" FOREIGN KEY ("request") REFERENCES "RideRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_rider_fkey" FOREIGN KEY ("rider") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchOffer" ADD CONSTRAINT "MatchOffer_request_fkey" FOREIGN KEY ("request") REFERENCES "RideRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchOffer" ADD CONSTRAINT "MatchOffer_driver_fkey" FOREIGN KEY ("driver") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchOffer" ADD CONSTRAINT "MatchOffer_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_fleet_fkey" FOREIGN KEY ("fleet") REFERENCES "Fleet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_rider_fkey" FOREIGN KEY ("rider") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driver_fkey" FOREIGN KEY ("driver") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicle_fkey" FOREIGN KEY ("vehicle") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripEvent" ADD CONSTRAINT "TripEvent_actorUser_fkey" FOREIGN KEY ("actorUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationEvent" ADD CONSTRAINT "LocationEvent_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cancellation" ADD CONSTRAINT "Cancellation_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyIncident" ADD CONSTRAINT "SafetyIncident_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_requester_fkey" FOREIGN KEY ("requester") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversation_fkey" FOREIGN KEY ("conversation") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sender_fkey" FOREIGN KEY ("sender") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_provider_fkey" FOREIGN KEY ("provider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_provider_fkey" FOREIGN KEY ("provider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payout_fkey" FOREIGN KEY ("payout") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_driver_fkey" FOREIGN KEY ("driver") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_provider_fkey" FOREIGN KEY ("provider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_trip_fkey" FOREIGN KEY ("trip") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipient_fkey" FOREIGN KEY ("recipient") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DriverProfile_vehicles" ADD CONSTRAINT "_DriverProfile_vehicles_A_fkey" FOREIGN KEY ("A") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DriverProfile_vehicles" ADD CONSTRAINT "_DriverProfile_vehicles_B_fkey" FOREIGN KEY ("B") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RideService_serviceAreas" ADD CONSTRAINT "_RideService_serviceAreas_A_fkey" FOREIGN KEY ("A") REFERENCES "RideService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RideService_serviceAreas" ADD CONSTRAINT "_RideService_serviceAreas_B_fkey" FOREIGN KEY ("B") REFERENCES "ServiceArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
