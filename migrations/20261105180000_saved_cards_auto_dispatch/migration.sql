-- Saved rider cards (Stripe), saved-card charge attempts, driver position for auto-dispatch.
-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "lastLocationAt" TIMESTAMP(3),
ADD COLUMN     "lastLocationLat" DOUBLE PRECISION,
ADD COLUMN     "lastLocationLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "attempts" INTEGER DEFAULT 0,
ADD COLUMN     "failureCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "failureMessage" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "purpose" TEXT DEFAULT 'fare';

-- AlterTable
ALTER TABLE "RiderProfile" ADD COLUMN     "cardBrand" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cardExpMonth" INTEGER,
ADD COLUMN     "cardExpYear" INTEGER,
ADD COLUMN     "cardLast4" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cardPaymentMethodId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cardSavedAt" TIMESTAMP(3),
ADD COLUMN     "stripeCustomerId" TEXT NOT NULL DEFAULT '';

