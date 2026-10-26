---
name: Openfront Rideshare
description: Self-hostable ride booking and fleet operations; operator pages set like a licence plate, rider pages like a meter slip on the kerb.
colors:
  cab-yellow: "oklch(0.86 0.165 92)"
  cab-yellow-hover: "oklch(0.81 0.165 88)"
  cab-yellow-dark: "oklch(0.84 0.16 92)"
  plate-black: "oklch(0.18 0.01 90)"
  tab-rule: "oklch(0.7 0.15 88)"
  plate-white: "oklch(0.975 0.01 95)"
  plate-line: "oklch(0.86 0.03 95)"
  plate-white-dark: "oklch(0.24 0.01 95)"
  plate-line-dark: "oklch(0.36 0.02 95)"
  signal: "#ffd23f"
  signal-hover: "#ffdb63"
  asphalt: "#0b0d10"
  kerb: "#14171c"
  lane: "#1c2027"
  lane-hover: "#232831"
  kerb-edge: "#272c34"
  field-edge: "#2d333c"
  slip-ink: "#121212"
  chalk: "#f3f2ee"
  kerb-grey: "#9aa0aa"
  brake-red: "#ff6b5e"
  brake-red-text: "#ff8a7f"
typography:
  rider-display:
    fontFamily: "Archivo, Geist, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 6vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 125"
  rider-fare:
    fontFamily: "Archivo, Geist, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 800
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 115"
  operator-headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  figure:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    fontFeature: "'tnum', 'zero'"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
  identifier:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 600
  plate:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.025em"
    fontFeature: "'tnum', 'zero'"
rounded:
  mark: "1px"
  slip-control: "3px"
  plate: "3px"
  control: "4px"
  panel: "6px"
spacing:
  track-gap: "6px"
  rider-track-gap: "8px"
  row: "16px"
  row-wide: "20px"
  section: "20px"
  tab-gap: "20px"
components:
  track-button-primary:
    backgroundColor: "{colors.cab-yellow}"
    textColor: "{colors.plate-black}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  track-button-primary-hover:
    backgroundColor: "{colors.cab-yellow-hover}"
  plate:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.plate-black}"
    typography: "{typography.plate}"
    rounded: "{rounded.plate}"
    padding: "0 6px"
    height: "20px"
  rider-button-signal:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.slip-ink}"
    rounded: "{rounded.slip-control}"
    padding: "0 24px"
    height: "52px"
  rider-button-signal-hover:
    backgroundColor: "{colors.signal-hover}"
  rider-button-raised:
    backgroundColor: "{colors.lane}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.slip-control}"
    padding: "0 16px"
    height: "40px"
  rider-button-raised-hover:
    backgroundColor: "{colors.lane-hover}"
  rider-option:
    backgroundColor: "{colors.asphalt}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.panel}"
    padding: "12px"
  rider-option-chosen:
    backgroundColor: "{colors.lane}"
  rider-booking-panel:
    backgroundColor: "{colors.kerb}"
    rounded: "{rounded.panel}"
    padding: "20px"
  rider-quote-slip:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.slip-ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  rider-field:
    backgroundColor: "{colors.asphalt}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.panel}"
    padding: "0 16px"
    height: "48px"
---

# Design System: Openfront Rideshare

## Overview

**Creative North Star: "The Cab's Papers and the Meter Slip"**

Two surfaces share one yellow and nothing else ornamental. The operator pages (`features/platform/**`) read like a licensed cab's papers: identifiers set like plates, counts in tabular slashed-zero figures, every trip's stage on a five-segment rail, flat underline tabs whose current tab burns with a deeper yellow rule. The rider pages (`features/storefront/**`) read like getting a meter slip on the kerb at night: asphalt ground, kerb-stone panels, the fare in big wide figures on a signal-yellow slip, and one signal-yellow action.

Both worlds are square and dense. Corners stay between 1px and 6px; the yellow is a spot colour reserved for the one action that moves work forward, the current tab or chosen option, and (rider side) the quote slip. Operator pages follow the shared dashboard shell's light and dark neutrals and add their own plate tokens; rider pages are always dark (`.rs.dark` scope). The shared dashboard shell (`features/dashboard/**`) is not part of this system and keeps its own tokens.

**Key Characteristics:**
- Spot yellow only: cab yellow on operator pages, signal yellow on rider pages, never as decoration.
- Square geometry: 1px status marks, 3px plates and rider controls, 4px operator controls, 6px panels and rows.
- Figures are instruments: tabular, slashed-zero counts and times; wide Archivo for rider fares and headings.
- Routes drawn as two stops on a rail: ring for pickup, solid square for drop-off.
- Flat operator surfaces; the rider booking panel alone lifts off the asphalt.

## Colors

A neutral working ground on each surface with a single warm yellow carrying every decision.

### Primary
- **Cab Yellow** (`cab-yellow`; `cab-yellow-dark` in dark mode): fill of the operator primary action (TrackButton `primary`) only. Plate-black text on it. Hover deepens to `cab-yellow-hover` (light mode).
- **Tab Rule** (`tab-rule`): the 2px underline under the current operator tab and the edge of the primary action. In dark mode it equals the dark cab yellow.
- **Signal Yellow** (`signal`): rider primary action fill ("See price", "Request ride", "Track ride"), the quote slip ground, the chosen service's icon tile, the chosen option's 2px ring, the destination stop square, completed segments of the rider trip rail, focus rings and text selection. Hover lightens to `signal-hover`.

### Neutral
- **Plate White / Plate Line** (`plate-white`, `plate-line`; dark: `plate-white-dark`, `plate-line-dark`): ground and ruled edge of the vehicle registration plate only.
- **Plate Black** (`plate-black`): text on cab yellow.
- **Asphalt** (`asphalt`): rider page ground, input wells, unchosen service options, the sticky header at 85% with blur.
- **Kerb** (`kerb`): rider panels (booking panel, account and status sections, nav segment).
- **Lane** (`lane`; hover `lane-hover`): raised rider buttons, chosen pill/option ground, unfilled rail segments, fee chips.
- **Kerb Edge / Field Edge** (`kerb-edge`, `field-edge`): rider borders and input strokes; inner rings use white at 10-15%, rising to 35% on hover.
- **Chalk** (`chalk`) and **Kerb Grey** (`kerb-grey`): rider foreground and muted text.
- **Slip Ink** (`slip-ink`): text on signal yellow; secondary slip text uses zinc-800.
- Operator neutrals come from the shared shell's `--background`, `--foreground`, `--muted`, `--border`, `--card` tokens in `app/globals.css`; they are not redefined here.

### Semantic
- **Brake Red** (`brake-red`, text `brake-red-text`): rider destructive and error states, on lane with a 30% red ring.
- **Status tones** (operator): Tailwind 500-step hues (blue, indigo, emerald, amber, orange, green, zinc, red, rose, teal) mapped per trip/request status, only ever as a square status mark, never as a fill behind text.
- Rider cautions use amber-300 text.

### Named Rules
**The One Yellow Rule.** On any screen, yellow marks only the forward action, the current tab or chosen option, and (rider) the quote slip. A second yellow button on the same screen is wrong; use `default`/`raised`.

**The Plate Rule.** Plate white exists only to set a vehicle registration as a plate. It does not become a card, header or table ground.

## Typography

**Display Font:** Archivo with the `wdth` axis (rider pages only), falling back to Geist and system-ui
**Body Font:** Geist (with system-ui)
**Label/Mono Font:** Geist Mono for identifiers: request numbers, confirmation codes, plates

**Character:** Operator pages stay in one sans at modest sizes, ranked by weight and rule, not scale. Rider pages add wide, extra-bold Archivo, stretched to 115-125%, for the one headline and the fare.

### Hierarchy
- **Rider Display** (800, 2.6rem rising to 3.75rem/4.5rem, line-height 0.95, -0.03em, width 125%): the rider page headline ("Where to?", "Sign in"), one per page. Smaller instances (text-2xl, width 120%) head empty and unavailable states.
- **Rider Fare** (800, 2.25rem, width 115%, tabular): the bound price on the quote slip.
- **Operator Headline** (600, 1.5rem rising to 1.875rem, tight tracking): the platform page title.
- **Title** (600, 1rem, tight tracking): platform section titles; count beside it in tabular muted text.
- **Figure** (600, 1.25rem, tabular slashed-zero): the dispatch supply strip readings (Waiting, Oldest, Available, Offered, Assigned, On trip).
- **Body** (400, 0.875rem): rows, meta lines, rider form text (rider inputs go to 1rem, 500).
- **Label** (500, 0.75rem): supply-strip terms, status labels after a status title, meta.
- **Identifier** (Geist Mono 600, 0.875rem operator rows; 1rem to 3rem rider status): request numbers and confirmation codes.
- **Plate** (Geist Mono 600, 11px, uppercase, 0.025em, tabular slashed-zero): vehicle registrations.

### Named Rules
**The Counted Figure Rule.** Every count, time, wait and fare sets tabular figures; operator figures also slash the zero (`.rf-figures`).

**The Wide Voice Rule.** Archivo appears only on rider pages, and only for the page headline, the fare, the fleet name and the account monogram. Operator pages never use it.

## Layout

Both surfaces centre a 72rem (`max-w-6xl`) column. Operator pages pad 16px, 24px from `md`, and stack header, optional strip, tab row with search (side by side from `lg`), then a single bordered list of rows with 1px dividers; rows pad 16px, 20px horizontally from `md`. Sections space 20px apart; section heads sit 12px above content. The dispatch board puts a ruled supply strip (border top and bottom, 12px vertical) above the tabs: six readings in a 3- then 6-column grid with the available drivers line beside it. Request rows split into a fluid left column and a 22rem control column from `md`.

Rider pages pad 16px, 24px from `sm`, with a 64px sticky header and a footer holding the staff entrance. The home page runs a headline column beside a 27rem booking panel from `lg` (gap 56px); on phones the panel follows the headline and the primary action sticks 12px above the bottom edge. Operator tab rows scroll sideways instead of wrapping; command groups (ActionTrack, RiderTrack) wrap.

## Elevation & Depth

Operator pages are flat: depth is borders, 1px dividers and the shell's muted grounds. Rider pages layer tonally (asphalt below kerb below lane) with inner white rings at 10-15%, and lift exactly one thing, the booking or confirmation panel, with a long, low ambient shadow that reads as a slip held above the street.

### Shadow Vocabulary
- **Kerb lift** (`box-shadow: 0 30px 80px -40px rgba(0,0,0,0.9)`): the rider booking panel and the request confirmation panel only.

### Named Rules
**The Flat Papers Rule.** Operator surfaces carry no shadows; separate with rules and borders.

## Shapes

Square-cornered throughout. Status marks and route stops are 1-2px squares (the pickup a hollow square ring, drop-off a solid square). Plates and rider controls (pills, buttons, toggle) are 3px. Operator controls, search input, nav segments, chips and monograms are 4px. Panels, list containers, rider fields and service options are 6px. Trip rails are 6px-tall segments at 4px. Rider routes join the two stops with a dashed 1px kerb-grey line; operator routes with a solid 1px border-colour rail.

## Components

### Buttons
- **Operator (TrackButton):** square (4px), 1px border, 14px medium; heights 32/40/48px. `primary` is cab yellow with plate-black semibold text and a tab-rule edge; `default` is background with input border, hover muted; `quiet` is borderless muted text; `danger` is destructive text with a 40% destructive border. Focus shows a 2px ring.
- **Rider (RiderButton):** square (3px), semibold; heights 32/40/52px. `signal` is the one forward action; `raised` is lane with a 20% white ring (35% on hover); `quiet` is text only; `danger` is lane with brake-red text and ring. Disabled drops to 45% opacity.

### Chips
- **Operator tabs (PillTrack/PillLink/PillButton):** flat underline tabs 20px apart on a 1px bottom border; the current tab is foreground medium with a 2px tab-rule underline; others muted, with a border-colour underline on hover. Optional tabular count after the label.
- **Rider choices (RiderPill):** square 3px, 40px tall, white 15% border; chosen has a signal border on lane, semibold.
- **Fee chips:** 4px lane chips, 12px text, signal icon.

### Cards / Containers
- **Operator rows:** one 6px bordered card-ground list, rows divided by 1px rules; errors as a 6px destructive-tinted panel; empty states are a quiet line under a top rule, not a card.
- **Rider panels:** kerb ground, 6px, kerb-edge border, 20px padding (16px on phones).

### Inputs / Fields
- **Operator search:** 40px, 4px, 1px border, leading search icon; 2px ring on focus.
- **Rider fields:** 48px, 6px, asphalt well with an inset 10% white ring; focus becomes a 2px signal ring. The pickup/destination pair shares one well joined by the dashed route line.
- **Rider toggle:** 3px track, asphalt with 15% ring; on, the track turns signal and the 2px-cornered knob turns slip ink.

### Navigation
- **Rider header:** brand left in wide Archivo; a 4px kerb segment holds "My rides" and a lane account button. Header is asphalt at 85% with blur.
- **Operator:** inherits the shared shell; page-level navigation is the underline tab track.

### Plate (signature)
Vehicle registration as a plate: 20px tall, plate-white ground, plate-line edge, 3px, Geist Mono 11px semibold uppercase with slashed zeros.

### Status Title and Trip Rail (signature)
A heading led by a square status mark on its first line, then the status label in 12px muted. Live states pulse the mark (disabled under reduced motion). Trips show a five-segment rail (requested to completed), filled segments foreground (operator) or signal (rider), with the stage name and `n/5`; cancelled and no-show collapse to "Ended · status".

### Service Option and Quote Slip (rider signature)
Service options are 6px asphalt rows with a 44px kerb icon tile; chosen turns lane with a 2px signal ring and a signal icon tile. The quote slip is a signal-yellow 6px slip: fare in wide Archivo, expiry chip at 10% ink, and a three-column ruled reading of fees, all tabular.

## Do's and Don'ts

### Do:
- **Do** keep yellow to the one forward action, the current tab or chosen option, and the rider quote slip.
- **Do** set every count, time and fare in tabular figures; on operator pages use `.rf-figures` for slashed zeros.
- **Do** keep corners at 1-6px: 3px plates and rider controls, 4px operator controls, 6px panels.
- **Do** draw routes as pickup ring and drop-off square on a rail (`RouteLine` on operator pages).
- **Do** show status as a square mark beside the heading, and trip progress on the five-segment rail.
- **Do** use underline tabs (PillTrack) for operator status views and wrap commands in ActionTrack/RiderTrack.

### Don't:
- **Don't** use rounded-full pills, round status dots, or radii above 6px on either surface.
- **Don't** put a second yellow button beside a primary one.
- **Don't** add shadows to operator surfaces; the rider kerb lift belongs only to the booking and confirmation panels.
- **Don't** use Archivo on operator pages or plate white outside the Plate.
- **Don't** borrow or restyle the shared dashboard shell's tokens; platform tokens live in `fleet.css`, rider tokens under `.rs`.
