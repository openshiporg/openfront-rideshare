-- On-demand by default (Uber/Lyft): riders request for Now; a book-ahead lead time only bounds the optional scheduler.
-- Data-only: the seeded demo fleet's services drop their 30/120-minute lead. Operators can set a lead time again
-- in Services. No schema, rows or other settings change.
UPDATE "RideService" SET "advanceBookingMinutes" = 0
WHERE "advanceBookingMinutes" > 0
  AND "fleet" IN (SELECT "id" FROM "Fleet" WHERE "slug" LIKE 'harbor-mobility-%');
