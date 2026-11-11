# Rideshare: no timers, no outbox

- Never add cron, worker services, queues, outbox/retry machinery, texting/email notification machinery, or `setInterval`/`setTimeout` loops (including in `instrumentation.ts`).
- Time-based state is computed on read, advanced idempotently on the request that touches it, or advanced by a staff button. Here: ride-request expiry and location purge run on the rider status poll and driver workspace reads (`features/keystone/mutations/maintenance.ts`, compare-and-set); refund reconcile and all other steps run from the staff **Refresh** button on Dispatch and Finance (`refreshRideshareClocks`).
- External events go only through Openfront Commerce webhooks (`~/Code/openfronts/openfront/features/webhooks`). Reports are Export buttons; invites are copyable links.
- Request-time mail (password reset, the one-shot ride-request and trip receipt emails) is sent once from the request and is never retried in the background.
