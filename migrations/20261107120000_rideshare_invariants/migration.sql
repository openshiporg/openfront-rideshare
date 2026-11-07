-- Invariants the app relied on but only checked in application code (read-then-write).
-- Live data was checked read-only for every rule below before this migration: 0 violations.

-- One seat per person per fleet (addFleetMember checks first; two submits could both pass).
CREATE UNIQUE INDEX "FleetMembership_fleet_user_key" ON "FleetMembership"("fleet", "user") WHERE "fleet" IS NOT NULL AND "user" IS NOT NULL;

-- One live fare per service and area; quoting reads only the newest active one. Versions never repeat.
CREATE UNIQUE INDEX "FareRule_one_active_per_service_area" ON "FareRule"("service", "serviceArea") WHERE "status" = 'active';
CREATE UNIQUE INDEX "FareRule_service_area_version_key" ON "FareRule"("service", "serviceArea", "version") WHERE "service" IS NOT NULL AND "serviceArea" IS NOT NULL;

-- One live charge per trip and purpose (fare, cancellation fee, no-show fee): never charge a rider twice.
CREATE UNIQUE INDEX "Payment_one_active_per_trip_purpose" ON "Payment"("trip", "purpose") WHERE "status" IN ('pending', 'authorized', 'captured', 'partially_refunded') AND "trip" IS NOT NULL;

-- One review per trip, author and direction.
CREATE UNIQUE INDEX "Review_trip_author_direction_key" ON "Review"("trip", "author", "direction") WHERE "trip" IS NOT NULL AND "author" IS NOT NULL AND "direction" IS NOT NULL;

-- One active eligibility policy of a kind per fleet (document review refuses when there are two).
CREATE UNIQUE INDEX "Policy_one_active_per_fleet_kind" ON "Policy"("fleet", "kind") WHERE "status" = 'active' AND "fleet" IS NOT NULL;

-- Money is positive integer minor units in a real currency code.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" IS NOT NULL AND "amountMinor" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountMinor" IS NOT NULL AND "amountMinor" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_amount_non_negative" CHECK ("amountMinor" IS NOT NULL AND "amountMinor" >= 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "FareRule" ADD CONSTRAINT "FareRule_amounts_non_negative" CHECK (
  COALESCE("baseFareMinor", 0) >= 0 AND COALESCE("perDistanceUnitMinor", 0) >= 0 AND COALESCE("perMinuteMinor", 0) >= 0
  AND COALESCE("bookingFeeMinor", 0) >= 0 AND COALESCE("minimumFareMinor", 0) >= 0
  AND COALESCE("cancellationFeeMinor", 0) >= 0 AND COALESCE("noShowFeeMinor", 0) >= 0);
ALTER TABLE "FareRule" ADD CONSTRAINT "FareRule_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Fleet" ADD CONSTRAINT "Fleet_location_retention_days" CHECK (CASE WHEN "preciseLocationRetentionDays" ~ '^[0-9]{1,4}$' THEN "preciseLocationRetentionDays"::int BETWEEN 1 AND 3650 ELSE false END);

-- Refunds never exceed what was paid and are in the payment's currency. Counted the way the refund command
-- reserves: requested + processing + succeeded. The payment row is locked so concurrent refunds serialise.
CREATE OR REPLACE FUNCTION rideshare_refund_within_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  paid INT;
  paid_currency TEXT;
  reserved BIGINT;
BEGIN
  IF NEW."payment" IS NULL THEN RETURN NEW; END IF;
  SELECT "amountMinor", "currencyCode" INTO paid, paid_currency FROM "Payment" WHERE "id" = NEW."payment" FOR UPDATE;
  IF NEW."currencyCode" IS DISTINCT FROM paid_currency THEN
    RAISE EXCEPTION 'Refund_within_payment: refund currency % does not match the payment currency %.', NEW."currencyCode", paid_currency USING ERRCODE = '23514', CONSTRAINT = 'Refund_within_payment';
  END IF;
  SELECT COALESCE(SUM("amountMinor"), 0) INTO reserved FROM "Refund"
    WHERE "payment" = NEW."payment" AND "status" IN ('requested', 'processing', 'succeeded');
  IF reserved > COALESCE(paid, 0) THEN
    RAISE EXCEPTION 'Refund_within_payment: refunds (%) would exceed the payment (%).', reserved, paid USING ERRCODE = '23514', CONSTRAINT = 'Refund_within_payment';
  END IF;
  RETURN NEW;
END $$;

CREATE CONSTRAINT TRIGGER "Refund_within_payment" AFTER INSERT OR UPDATE OF "amountMinor", "status", "payment", "currencyCode" ON "Refund"
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION rideshare_refund_within_payment();

-- Retention sweep reads by expiry.
CREATE INDEX "LocationEvent_expiresAt_idx" ON "LocationEvent"("expiresAt") WHERE "expiresAt" IS NOT NULL;
