# Impeccable critique: Openfront Rideshare (before), 2026-10-25

Method: dual-agent. A was a design review of the before screenshots and the source. B was `impeccable detect` over `features/platform`, `features/storefront` and the rider routes.

## Detector (B)
- 0 findings in every scope. The detector works on .tsx (a planted test file did fire), but it has no rule for heavy rounding.
- 118 `rounded-(full|xl|2xl|3xl)` lines across 43 files. They come from the custom pill primitives:
  - `features/platform/components/PillTabs.tsx` (operator)
  - `features/storefront/components/RiderPills.tsx` (rider)
  - rounded cards in `RiderHomePage`, `RiderShell` and `TripDetailPage`.

## Scores (A)
- Platform: 18/40 (poor).
- Storefront: 25/40 (acceptable).

## Priority issues
1. **[P1] Dispatch is a filtered list, not a dispatch console.** It shows no driver supply, no wait aging and no fleet mode.
2. **[P1] Every board uses pill tabs:** 5–8 equal pills per page, plus the rider pills and rounded cards.
3. **[P1] Retiring a vehicle is presented as a segmented toggle** next to Maintenance. A destructive, fleet-reducing action looks like a view switch.
4. **[P2] Finance has no money summary.** It is a payment list with "1 payments" grammar.
5. **[P2] The rider site has no local identity.**
   - "Harbor City" appears as a grey word.
   - The operator name repeats on every service row.
   - No hours or phone.
   - Both services read "from $8.50".

## Persona red flags
- **Dispatcher:** can't see who is online, has no sorting by wait, and search needs a button.
- **Fleet manager:** no totals, the placeholder model "Example Hybrid Sedan", and jargon ("Check: Eligible").
- **Rider on a phone:** the brand truncates, the booking card is long, and the sticky "See price" may cover fields.

## Minor
- "1 trips" / "1 payments".
- Duplicate empty messages.
- Inconsistent page widths.
- "Book 120 min ahead" here vs "2 h" elsewhere.
- The History pill reads as disabled.
