BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "MatchOffer"
  ADD COLUMN "reservationStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "reservationReleasedAt" TIMESTAMP(3);

UPDATE "MatchOffer" mo
SET "reservationStartAt" = COALESCE(r."requestedFor", mo."offeredAt"),
    "reservationReleasedAt" = CASE
      WHEN mo."status" IN ('declined', 'expired', 'withdrawn') THEN COALESCE(mo."respondedAt", mo."offeredAt")
      WHEN mo."status" = 'offered' AND mo."expiresAt" <= CURRENT_TIMESTAMP THEN mo."expiresAt"
      ELSE NULL
    END
FROM "RideRequest" r
WHERE r."id" = mo."request";

UPDATE "MatchOffer" mo
SET "reservationReleasedAt" = COALESCE(t."completedAt", t."cancelledAt", t."acceptedAt")
FROM "Trip" t
WHERE t."acceptedOffer" = mo."id"
  AND mo."status" = 'accepted'
  AND t."status" IN ('completed', 'cancelled', 'no_show');

CREATE OR REPLACE FUNCTION rideshare_offer_reservation_window(reservation_start TIMESTAMP)
RETURNS TSRANGE
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT tsrange(reservation_start, reservation_start + INTERVAL '2 hours', '[)')
$$;

CREATE OR REPLACE FUNCTION rideshare_trip_reservation_window(scheduled_at TIMESTAMP, accepted_at TIMESTAMP)
RETURNS TSRANGE
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN COALESCE(scheduled_at, accepted_at) IS NULL THEN tsrange(NULL, NULL, '[)')
    ELSE tsrange(COALESCE(scheduled_at, accepted_at), COALESCE(scheduled_at, accepted_at) + INTERVAL '2 hours', '[)')
  END
$$;

-- Refuse to install the invariant over already-conflicting live assignments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Trip" first_trip
    JOIN "Trip" second_trip
      ON first_trip."id" < second_trip."id"
     AND first_trip."driver" = second_trip."driver"
    WHERE first_trip."driver" IS NOT NULL
      AND first_trip."status" IN ('driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress')
      AND second_trip."status" IN ('driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress')
      AND rideshare_trip_reservation_window(first_trip."scheduledFor", first_trip."acceptedAt")
          && rideshare_trip_reservation_window(second_trip."scheduledFor", second_trip."acceptedAt")
  ) THEN
    RAISE EXCEPTION 'Rideshare schedule-capacity migration blocked: a driver has overlapping active reservation windows; reconcile them before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Trip" first_trip
    JOIN "Trip" second_trip
      ON first_trip."id" < second_trip."id"
     AND first_trip."vehicle" = second_trip."vehicle"
    WHERE first_trip."vehicle" IS NOT NULL
      AND first_trip."status" IN ('driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress')
      AND second_trip."status" IN ('driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress')
      AND rideshare_trip_reservation_window(first_trip."scheduledFor", first_trip."acceptedAt")
          && rideshare_trip_reservation_window(second_trip."scheduledFor", second_trip."acceptedAt")
  ) THEN
    RAISE EXCEPTION 'Rideshare schedule-capacity migration blocked: a vehicle has overlapping active reservation windows; reconcile them before retrying.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MatchOffer" first_offer
    JOIN "MatchOffer" second_offer
      ON first_offer."id" < second_offer."id"
     AND first_offer."driver" = second_offer."driver"
    WHERE first_offer."driver" IS NOT NULL
      AND first_offer."reservationReleasedAt" IS NULL
      AND second_offer."reservationReleasedAt" IS NULL
      AND first_offer."status" IN ('offered', 'accepted')
      AND second_offer."status" IN ('offered', 'accepted')
      AND rideshare_offer_reservation_window(first_offer."reservationStartAt")
          && rideshare_offer_reservation_window(second_offer."reservationStartAt")
  ) THEN
    RAISE EXCEPTION 'Rideshare schedule-capacity migration blocked: a driver has overlapping active offer windows; reconcile them before retrying.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "MatchOffer" first_offer
    JOIN "MatchOffer" second_offer
      ON first_offer."id" < second_offer."id"
     AND first_offer."vehicle" = second_offer."vehicle"
    WHERE first_offer."vehicle" IS NOT NULL
      AND first_offer."reservationReleasedAt" IS NULL
      AND second_offer."reservationReleasedAt" IS NULL
      AND first_offer."status" IN ('offered', 'accepted')
      AND second_offer."status" IN ('offered', 'accepted')
      AND rideshare_offer_reservation_window(first_offer."reservationStartAt")
          && rideshare_offer_reservation_window(second_offer."reservationStartAt")
  ) THEN
    RAISE EXCEPTION 'Rideshare schedule-capacity migration blocked: a vehicle has overlapping active offer windows; reconcile them before retrying.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION rideshare_assert_trip_reservation_start() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  requested_at TIMESTAMP;
  offer_start TIMESTAMP;
BEGIN
  IF NEW."acceptedOffer" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT r."requestedFor" INTO requested_at FROM "RideRequest" r WHERE r."id" = NEW."request";
  SELECT mo."reservationStartAt" INTO offer_start FROM "MatchOffer" mo WHERE mo."id" = NEW."acceptedOffer";
  IF requested_at IS DISTINCT FROM NEW."scheduledFor"
     OR offer_start IS DISTINCT FROM COALESCE(requested_at, NEW."acceptedAt") THEN
    RAISE EXCEPTION 'Trip reservation window must match its request and accepted offer.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER rideshare_trip_reservation_start_consistency
AFTER INSERT OR UPDATE OF "request", "acceptedOffer", "scheduledFor", "acceptedAt" ON "Trip"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rideshare_assert_trip_reservation_start();

CREATE OR REPLACE FUNCTION rideshare_assert_offer_reservation_start() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  requested_at TIMESTAMP;
BEGIN
  SELECT r."requestedFor" INTO requested_at FROM "RideRequest" r WHERE r."id" = NEW."request";
  IF requested_at IS NOT NULL AND NEW."reservationStartAt" IS DISTINCT FROM requested_at THEN
    RAISE EXCEPTION 'Scheduled offer reservation must match its request time.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER rideshare_offer_reservation_start_consistency
AFTER INSERT OR UPDATE OF "request", "reservationStartAt" ON "MatchOffer"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION rideshare_assert_offer_reservation_start();

ALTER TABLE "Trip"
  ADD CONSTRAINT "Trip_driver_no_overlapping_active_reservations"
  EXCLUDE USING gist (
    "driver" WITH =,
    (rideshare_trip_reservation_window("scheduledFor", "acceptedAt")) WITH &&
  )
  WHERE ("driver" IS NOT NULL AND "status" IN ('driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress'));

ALTER TABLE "Trip"
  ADD CONSTRAINT "Trip_vehicle_no_overlapping_active_reservations"
  EXCLUDE USING gist (
    "vehicle" WITH =,
    (rideshare_trip_reservation_window("scheduledFor", "acceptedAt")) WITH &&
  )
  WHERE ("vehicle" IS NOT NULL AND "status" IN ('driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress'));

ALTER TABLE "MatchOffer"
  ADD CONSTRAINT "MatchOffer_driver_no_overlapping_reservations"
  EXCLUDE USING gist (
    "driver" WITH =,
    (rideshare_offer_reservation_window("reservationStartAt")) WITH &&
  )
  WHERE ("driver" IS NOT NULL AND "reservationReleasedAt" IS NULL AND "status" IN ('offered', 'accepted'));

ALTER TABLE "MatchOffer"
  ADD CONSTRAINT "MatchOffer_vehicle_no_overlapping_reservations"
  EXCLUDE USING gist (
    "vehicle" WITH =,
    (rideshare_offer_reservation_window("reservationStartAt")) WITH &&
  )
  WHERE ("vehicle" IS NOT NULL AND "reservationReleasedAt" IS NULL AND "status" IN ('offered', 'accepted'));

COMMIT;
