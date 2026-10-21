BEGIN;

-- Preflight existing data before moving the one-to-one request/trip foreign key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "MatchOffer"
    WHERE "status" = 'accepted' AND "request" IS NOT NULL
    GROUP BY "request" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Rideshare migration blocked: a request has multiple accepted offers; reconcile them before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "MatchOffer" mo
    WHERE mo."status" = 'accepted'
      AND (mo."request" IS NULL OR mo."driver" IS NULL OR NOT EXISTS (
        SELECT 1 FROM "RideRequest" r
        JOIN "Trip" t ON t."id" = r."trip"
        WHERE r."id" = mo."request" AND t."driver" = mo."driver"
      ))
  ) THEN
    RAISE EXCEPTION 'Rideshare migration blocked: an accepted offer has no matching request/trip/driver; reconcile it before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Trip" t
    WHERE t."status" IN ('driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress', 'completed', 'no_show')
      AND (t."driver" IS NULL OR NOT EXISTS (
        SELECT 1 FROM "RideRequest" r
        JOIN "MatchOffer" mo ON mo."request" = r."id" AND mo."driver" = t."driver" AND mo."status" = 'accepted'
        WHERE r."trip" = t."id"
      ))
  ) THEN
    RAISE EXCEPTION 'Rideshare migration blocked: a non-cancelled trip has no matching accepted offer; reconcile it before retrying.';
  END IF;
END $$;

ALTER TABLE "Trip"
  ADD COLUMN "request" TEXT,
  ADD COLUMN "acceptedOffer" TEXT;

-- Preserve the old RideRequest.trip links while moving the FK onto Trip.request.
UPDATE "Trip" t
SET "request" = r."id"
FROM "RideRequest" r
WHERE r."trip" = t."id";

-- Bind historical trips to the unique accepted offer for their request and driver.
UPDATE "Trip" t
SET "acceptedOffer" = mo."id"
FROM "RideRequest" r, "MatchOffer" mo
WHERE r."trip" = t."id"
  AND mo."request" = r."id"
  AND mo."driver" = t."driver"
  AND mo."status" = 'accepted';

-- A cancelled assignment cannot retain live offers. Keep old cancellation records,
-- but close its request so no stale offer can be accepted after this migration.
UPDATE "MatchOffer" mo
SET "status" = 'withdrawn', "respondedAt" = COALESCE(mo."respondedAt", NOW())
FROM "RideRequest" r, "Trip" t
WHERE r."trip" = t."id"
  AND mo."request" = r."id"
  AND mo."status" IN ('offered', 'accepted')
  AND t."status" = 'cancelled';

UPDATE "RideRequest" r
SET "status" = 'cancelled'
FROM "Trip" t
WHERE r."trip" = t."id"
  AND t."status" = 'cancelled'
  AND r."status" = 'matched';

ALTER TABLE "RideRequest" DROP CONSTRAINT "RideRequest_trip_fkey";
DROP INDEX "RideRequest_trip_key";
ALTER TABLE "RideRequest" DROP COLUMN "trip";

DROP INDEX "Cancellation_trip_key";
CREATE INDEX "Cancellation_trip_idx" ON "Cancellation"("trip");

CREATE UNIQUE INDEX "Trip_request_key" ON "Trip"("request");
CREATE UNIQUE INDEX "Trip_acceptedOffer_key" ON "Trip"("acceptedOffer");
CREATE UNIQUE INDEX "MatchOffer_one_accepted_per_request_key"
  ON "MatchOffer"("request")
  WHERE "status" = 'accepted' AND "request" IS NOT NULL;

ALTER TABLE "Trip"
  ADD CONSTRAINT "Trip_request_fkey" FOREIGN KEY ("request") REFERENCES "RideRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Trip_acceptedOffer_fkey" FOREIGN KEY ("acceptedOffer") REFERENCES "MatchOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION rideshare_assert_trip_acceptance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  offer_request TEXT;
  offer_driver TEXT;
  offer_status TEXT;
BEGIN
  IF NEW."status" IN ('driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress', 'completed', 'no_show')
     AND (NEW."request" IS NULL OR NEW."acceptedOffer" IS NULL OR NEW."driver" IS NULL) THEN
    RAISE EXCEPTION 'Active trip requires a request, accepted offer, and assigned driver.' USING ERRCODE = '23514';
  END IF;

  IF NEW."acceptedOffer" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT mo."request", mo."driver", mo."status"
    INTO offer_request, offer_driver, offer_status
    FROM "MatchOffer" mo WHERE mo."id" = NEW."acceptedOffer";
  IF NOT FOUND OR offer_request IS DISTINCT FROM NEW."request" OR offer_driver IS DISTINCT FROM NEW."driver" THEN
    RAISE EXCEPTION 'Trip request/driver must match its accepted offer.' USING ERRCODE = '23514';
  END IF;
  IF NEW."status" = 'cancelled' THEN
    IF offer_status = 'accepted' THEN
      RAISE EXCEPTION 'Cancelled trip must invalidate its accepted offer in the same transaction.' USING ERRCODE = '23514';
    END IF;
  ELSIF offer_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Non-cancelled trip must reference an accepted offer.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rideshare_assert_accepted_offer_trip() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM 'accepted' THEN
    RETURN NEW;
  END IF;
  IF NEW."request" IS NULL OR NEW."driver" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "Trip" t
    WHERE t."acceptedOffer" = NEW."id"
      AND t."request" = NEW."request"
      AND t."driver" = NEW."driver"
      AND t."status" <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Accepted offer must be linked to its request and assigned driver on a non-cancelled trip.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION rideshare_assert_matched_request_trip() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'matched' AND NOT EXISTS (
    SELECT 1 FROM "Trip" t WHERE t."request" = NEW."id" AND t."status" <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Matched request must have exactly one non-cancelled trip.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER rideshare_trip_acceptance_consistency
AFTER INSERT OR UPDATE OF "request", "acceptedOffer", "driver", "status" ON "Trip"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rideshare_assert_trip_acceptance();

CREATE CONSTRAINT TRIGGER rideshare_accepted_offer_trip_consistency
AFTER INSERT OR UPDATE OF "request", "driver", "status" ON "MatchOffer"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rideshare_assert_accepted_offer_trip();

CREATE CONSTRAINT TRIGGER rideshare_matched_request_trip_consistency
AFTER INSERT OR UPDATE OF "status" ON "RideRequest"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rideshare_assert_matched_request_trip();

COMMIT;
