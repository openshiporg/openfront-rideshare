# Rideshare: full redesign, 2026-10-25

- **Brief:** `~/Code/Euler/state/briefs/batches-2-6-full-redesign-2026-10-25.md`
- **Live:** https://openfront-rideshare-production.up.railway.app
- **Commits on master (auto-deployed):**
  - `2078bed`: redesign
  - `77eeb43`: finish-review fixes
  - `3707f0f`: design record
  - the commit that adds this report

## What changed

### Operator pages (`features/platform/**`): the "licence plate" world
- **Shared kit** (`PillTabs.tsx`, `PlatformPage.tsx`, `OperationsBoard.tsx`, `StatusTitle.tsx`, `fleet.css`):
  - The recessed pill tracks are now flat underline status tabs. The current tab is marked with a deeper yellow rule.
  - Command buttons are square (4px). Cab yellow fills only the primary action, and Search is now a secondary button.
  - Status marks are square.
  - Empty queues show one line, with no "0 requests" footer.
  - The live refresh control is flat.
- **Dispatch:**
  - A ruled supply strip shows Waiting, Oldest wait, Available, Offered, Assigned and On trip, plus "Available now" with driver names.
  - Each request shows how long it has waited.
  - A dispatcher can see supply against demand without leaving the page.
- **Vehicles:**
  - Registrations are set as plates.
  - "Retire vehicle" is a separate red action, and its confirmation says what it does.
- **Settings:** pausing the fleet, turning dispatch off and closing rider accounts each ask first, and say what stops.
- **Copy fixes:**
  - "1 payment" (singular).
  - Driver checks read as their outcome; the "Check:" prefix is gone.

### Rider pages (`features/storefront/**`)
- Square kerb-stone choices, with a signal-yellow edge on the chosen option.
- Square command buttons with no glow.
- Square cards and fields.
- Labels in sentence case instead of tracked capitals.
- A square accessibility switch.
- Booking integrity is unchanged: quote binding, expiry, fees before Request, and recovery.

### What stayed
- Every route, state and workflow.
- The shared dashboard shell.
- Onboarding, setup and seed files.

## Skills used, and what each changed
- **impeccable:**
  - `init` wrote PRODUCT.md (inferred).
  - `critique`, dual-agent (`CRITIQUE.md`).
  - `concept-seed` for operator (operate) and rider (persuade). Both seeds were verified by the reviewer with `--check-seed`.
  - Craft floor.
  - One finish-reviewer round, disposition **fix**. Applied in `77eeb43`: plates, single primary, empty footers, confirm-first settings, rider labels, square switch.
  - The documenter wrote DESIGN.md and `.impeccable/design.json`.
- **design-taste-frontend / frontend-design / hallmark:**
  - Removed the glow and the pill clone kit.
  - Applied honest copy: no invented service area, hours or claims.
- **emil-design-eng / apple-design:** colour-only transitions, press feedback, and reduced motion respected.
- **industrial-brutalist-ui / minimalist-ui:** their ruled and flat discipline shaped the supply strip; their terminal costume was declined.
- **high-end-visual-design / gpt-taste:** read and declined.

## Gates
- `tsc --noEmit` through heavy-exec: child exit 0, 0 errors.
- `npm test`: 4/4. Family security and shared dashboard: 22/22.
- Parity: drift 0, missing 0.
- After the redesign deploy, live screenshots were taken from the deployed site.

## Open items
- **Boards are still card rows, not tables.** The reviewer asked for real tables with column heads and a status column on Trips, Drivers and Finance. That means rewriting each board's renderer, so it is the next step.
- **Finance has no period money summary.**
- **The rider site has no local identity line** (service area, hours, phone). The fleet data has no such fields, and inventing them is out of bounds.
- **Thin demo data:** there are no trips, reviews or payments, so the screenshots are mostly empty states.
- **Onboarding** keeps rounded cards. The brief forbids touching onboarding files.

## Screenshots
- `design/2026-10-25-full/before/` and `after/`: live, WebKit, desktop 1440 and phone 390, full page.
- The rider home and `/book` render the same page, so the final after set captures it once, as `/`.
