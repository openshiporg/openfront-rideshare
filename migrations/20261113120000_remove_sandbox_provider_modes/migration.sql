-- The route is the real driving route (OSRM); the label-hash estimate and the console notification adapter are gone.
UPDATE "ProviderConnection" SET "name" = 'Open map routing', "adapter" = 'osm', "status" = 'active' WHERE "kind" = 'mapping' AND "adapter" = 'manual' AND "status" = 'sandbox';
UPDATE "ProviderConnection" SET "status" = 'disabled' WHERE "kind" = 'notification' AND "adapter" = 'console';
UPDATE "ProviderConnection" SET "status" = 'unconfigured' WHERE "status" = 'sandbox';
