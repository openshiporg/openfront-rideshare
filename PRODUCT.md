# Product

<!-- impeccable:product-schema 1 -->

> This file is inferred from the repository and from the owner's brief of 2026-10-25 (`batches-2-6-full-redesign-2026-10-25.md`). The brief ordered the work with no approval stage, so the facts below come from repository evidence, not from interview answers.

## Platform

web

## Users
- **Operators.** Dispatchers, fleet managers and finance staff at an independent ride service. They use the platform pages to:
  - see open requests and assign drivers;
  - follow trips through each stage;
  - keep drivers, vehicles, services and fares right;
  - handle safety records and support;
  - record manual payments.
- **Drivers.** They use "My driving" to see and work their own trips.
- **Riders.** They request a quote and a ride for a service, then follow trip status and their past rides, usually on a phone.

## Product Purpose
Openfront Rideshare is a self-hostable ride-booking and fleet-operations application for independent drivers and fleets.

## Operating Context
- **Trip stages.** A trip moves through requested, assigned, arriving, in progress and completed. It can also end cancelled or no-show.
- **Shared shell.** One Openfront dashboard shell wraps every platform page. It is identical across products and is not this product's to change.

## Capabilities and Constraints
- **Platform routes:**
  - dispatch
  - trips (with detail)
  - drivers
  - vehicles
  - services
  - finance
  - safety
  - reviews
  - my-driving
  - settings
  - team
- **Rider routes:**
  - `/`
  - `/book`
  - `/rides/*`
  - `/account/*`
- **Payments** are manual payment records. The product does not claim live card processing.

## Brand Commitments
- The service name, logo and contact details come from the operator's settings. The demo service is Harbor Independent Mobility.
- Openfront branding stays in the shared shell.

## Evidence on Hand
- Demo data (2026-10-25):
  - one fleet and one service area;
  - two services with fares;
  - one driver and one vehicle.
- Trips, reviews and finance are empty.
- No photography or rider testimonials are bundled. None may be invented.

## Product Principles
- Dispatch sees the oldest unassigned request first.
- A trip's stage is always visible.
- The rider gets a price and a pickup time before anything else.
