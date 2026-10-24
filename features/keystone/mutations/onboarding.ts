import { DEFAULT_STORE_LOGO_ICON, DEFAULT_STORE_LOGO_COLOR } from '../../platform/settings/branding/store-logo'
import { permissions, canAccessFleet } from '../access'
import { demoSeedInspectionSelections, inspectExistingDemoFleet } from '../domain/demoSeedCompleteness'
import { currentRiderId } from '../domain/requestAuthority'

// Same resolution as features/dashboard/lib/getBaseUrl, read from the Keystone request.
function requestBaseUrl(req?: { headers?: Record<string, string | string[] | undefined> }) {
  const header = (name: string) => String(req?.headers?.[name] || '').split(',')[0].trim()
  const host = header('x-forwarded-host') || header('host')
  return host ? `${header('x-forwarded-proto') || 'https'}://${host}` : ''
}

export async function dismissRideshareOnboarding(_root: unknown, _args: unknown, context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    const actorId = await currentRiderId(tx, context.session)
    if (!actorId) return false
    const user = await tx.user.findUnique({ where: { id: actorId }, select: { onboardingStatus: true } })
    if (!user || user.onboardingStatus === 'completed') return false
    if (user.onboardingStatus === 'dismissed') return true
    const result = await tx.user.updateMany({ where: { id: actorId, onboardingStatus: user.onboardingStatus }, data: { onboardingStatus: 'dismissed' } })
    return result.count === 1
  }, { isolationLevel: 'Serializable' })
}



export async function bootstrapRideshare(_root: unknown, args: { mode: string }, context: any) {
  if (!context.session?.itemId || !await permissions.canManageOnboarding({ context, session: context.session })) throw new Error('Onboarding permission is required.')
  if (args.mode !== 'minimal' && args.mode !== 'full') throw new Error('Demo setup mode must be minimal or full.')

  const userId = context.session.itemId
  const demoSlug = `harbor-mobility-${userId}`
  const demoFleetWhere = { OR: [{ slug: { equals: demoSlug } }, { slug: { equals: 'harbor-independent-mobility' }, memberships: { some: { user: { id: { equals: userId } }, role: { equals: 'owner' }, status: { equals: 'active' } } } }] }
  const sudo = context.sudo()
  const existing = await sudo.query.Fleet.findMany({ where: demoFleetWhere, take: 1, query: 'id' })
  if (existing[0]) {
    if (!await canAccessFleet(context, context.session, existing[0].id, 'fleetAdmin')) throw new Error('Fleet setup is unavailable.')
    existing[0] = await sudo.query.Fleet.findOne({ where: { id: existing[0].id }, query: demoSeedInspectionSelections.fleet })
    const diagnostic = await inspectExistingDemoFleet(sudo, context, existing[0], userId, args.mode)
    await sudo.query.User.updateOne({ where: { id: userId }, data: { onboardingStatus: diagnostic.onboardingStatus } })
    return { fleetId: existing[0].id, created: false, summary: diagnostic }
  }

  // Keep the progress marker outside the seed transaction so a failed seed cannot restore a stale completed state.
  await sudo.query.User.updateOne({ where: { id: userId }, data: { onboardingStatus: 'in_progress' } })

  return context.transaction(async (transactionContext: any) => {
    if (!await permissions.canManageOnboarding({ context: transactionContext, session: context.session })) throw new Error('Onboarding permission is required.')
    await transactionContext.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`setup:${userId}`}, 0))::text IS NOT NULL`
    const transactionSudo = transactionContext.sudo()
    // A concurrent bootstrap may have completed while the initial existence check ran.
    const racedFleet = await transactionSudo.query.Fleet.findMany({ where: demoFleetWhere, take: 1, query: 'id' })
    if (racedFleet[0]) {
      if (!await canAccessFleet(transactionContext, context.session, racedFleet[0].id, 'fleetAdmin')) throw new Error('Fleet setup is unavailable.')
      racedFleet[0] = await transactionSudo.query.Fleet.findOne({ where: { id: racedFleet[0].id }, query: demoSeedInspectionSelections.fleet })
      const diagnostic = await inspectExistingDemoFleet(transactionSudo, transactionContext, racedFleet[0], userId, args.mode)
      await transactionSudo.query.User.updateOne({ where: { id: userId }, data: { onboardingStatus: diagnostic.onboardingStatus } })
      return { fleetId: racedFleet[0].id, created: false, summary: diagnostic }
    }

    const full = args.mode === 'full'
    const fleet = await transactionSudo.query.Fleet.createOne({ data: { name: 'Harbor Independent Mobility', logoIcon: DEFAULT_STORE_LOGO_ICON, logoColor: DEFAULT_STORE_LOGO_COLOR, slug: demoSlug, status: 'active', operationsMode: 'manual', publicDescription: 'A driver-owned cooperative serving central neighborhoods with transparent source-owned pricing.', publicCity: 'Harbor City', countryCode: 'US', currencyCode: 'USD', timezone: 'America/New_York', supportEmail: 'support@example.invalid', preciseLocationRetentionDays: '30' }, query: 'id' })
    await transactionSudo.query.FleetMembership.createOne({ data: { fleet: { connect: { id: fleet.id } }, user: { connect: { id: userId } }, role: 'owner', status: 'active', acceptedAt: new Date() } })
    const area = await transactionSudo.query.ServiceArea.createOne({ data: { fleet: { connect: { id: fleet.id } }, name: 'Harbor City Core', publicRegionLabel: 'Harbor City central neighborhoods', countryCode: 'US', status: 'active', coarseBounds: { disclosure: 'Coarse public service region; exact driver locations are not published.' } }, query: 'id' })
    const service = await transactionSudo.query.RideService.createOne({ data: { fleet: { connect: { id: fleet.id } }, serviceAreas: { connect: [{ id: area.id }] }, name: 'Independent Standard', slug: `${demoSlug}-standard`, description: 'Everyday rides from locally operated independent drivers.', status: 'active', category: 'standard', passengerCapacity: 4, advanceBookingMinutes: 30 }, query: 'id' })
    const accessible = full ? await transactionSudo.query.RideService.createOne({ data: { fleet: { connect: { id: fleet.id } }, serviceAreas: { connect: [{ id: area.id }] }, name: 'Accessible Ride', slug: `${demoSlug}-accessible`, description: 'Wheelchair-accessible service when an eligible vehicle is available.', status: 'active', category: 'accessible', passengerCapacity: 4, wheelchairAccessible: true, advanceBookingMinutes: 120 }, query: 'id' }) : null

    for (const target of [service, accessible].filter(Boolean)) {
      await transactionSudo.query.FareRule.createOne({ data: { fleet: { connect: { id: fleet.id } }, service: { connect: { id: target.id } }, serviceArea: { connect: { id: area.id } }, name: `${target.id === service.id ? 'Standard' : 'Accessible'} transparent fare`, version: 1, status: 'active', currencyCode: 'USD', baseFareMinor: 350, perDistanceUnitMinor: 185, distanceUnit: 'mile', perMinuteMinor: 35, bookingFeeMinor: 100, minimumFareMinor: 850, cancellationFeeMinor: 500, noShowFeeMinor: 900, maximumMultiplierBasisPoints: 10000, rules: { dynamicPricingEnabled: false } } })
    }

    const policy = await transactionSudo.query.Policy.createOne({ data: { fleet: { connect: { id: fleet.id } }, name: 'Demo driver and vehicle evidence policy', version: '2026-demo-1', jurisdiction: 'Example only — deployer must replace', kind: 'driver_eligibility', status: 'active', requirements: { requiredEvidence: ['driver_license', 'insurance', 'vehicle_registration', 'inspection'], manualReviewRequired: true }, evidenceSources: [{ source: 'operator review', authoritative: false }], disclaimer: 'Demo evidence policy only. This does not establish legal eligibility, approval, insurance coverage, or background-check clearance.' }, query: 'id' })
    const vehiclePolicy = await transactionSudo.query.Policy.createOne({ data: { fleet: { connect: { id: fleet.id } }, name: 'Demonstration vehicle evidence policy', version: '2026-demo-1', kind: 'vehicle_eligibility', status: 'active', requirements: { demonstrationOnly: true }, evidenceSources: [{ authoritative: false }], disclaimer: 'Demonstration metadata; no inspection, insurance or legal approval.' }, query: 'id' })
    const driver = await transactionSudo.query.DriverProfile.createOne({ data: { fleet: { connect: { id: fleet.id } }, user: { connect: { id: userId } }, publicName: 'Maya R.', publicBio: 'Independent local driver and cooperative member.', status: 'active', dispatchStatus: 'available', acceptsScheduled: true, languages: ['English', 'Spanish'] }, query: 'id' })
    const vehicle = await transactionSudo.query.Vehicle.createOne({ data: { fleet: { connect: { id: fleet.id } }, drivers: { connect: [{ id: driver.id }] }, label: 'Blue 2022 Hybrid', make: 'Example', model: 'Hybrid Sedan', year: 2022, color: 'Blue', plateMasked: '••• 482', capacity: 4, wheelchairAccessible: full, status: 'active' }, query: 'id' })
    // Sample evidence for the demo driver and vehicle, so the starter fleet passes its own readiness check.
    const documentExpiry = new Date(Date.now() + 365 * 24 * 60 * 60_000)
    for (const document of [
      { owner: { driver: { connect: { id: driver.id } } }, kind: 'driver_license', issuer: 'Sample licensing office' },
      { owner: { driver: { connect: { id: driver.id } } }, kind: 'insurance', issuer: 'Sample insurer' },
      { owner: { vehicle: { connect: { id: vehicle.id } } }, kind: 'vehicle_registration', issuer: 'Sample registry' },
      { owner: { vehicle: { connect: { id: vehicle.id } } }, kind: 'inspection', issuer: 'Sample inspection station' },
    ]) {
      await transactionSudo.query.ComplianceDocument.createOne({ data: { ...document.owner, kind: document.kind, status: 'accepted_evidence', issuer: document.issuer, referenceMasked: 'SAMPLE', issuedAt: new Date(), expiresAt: documentExpiry, reviewedAt: new Date(), reviewer: { connect: { id: userId } }, reviewNotes: 'Sample document from starter setup.' } })
    }
    const evalExpiry = new Date(Date.now() + 90 * 24 * 60 * 60_000)
    await transactionSudo.query.PolicyEvaluation.createOne({ data: { policy: { connect: { id: policy.id } }, driver: { connect: { id: driver.id } }, outcome: 'eligible', reasons: ['Demo operator review recorded; not a legal determination.'], evidenceSnapshot: { policyVersion: '2026-demo-1', authoritative: false, kind: 'demonstration' }, evaluatedAt: new Date(), expiresAt: evalExpiry, evaluator: { connect: { id: userId } } } })
    await transactionSudo.query.PolicyEvaluation.createOne({ data: { policy: { connect: { id: vehiclePolicy.id } }, vehicle: { connect: { id: vehicle.id } }, outcome: 'eligible', reasons: ['Demo vehicle evidence review recorded; not an inspection certification.'], evidenceSnapshot: { policyVersion: '2026-demo-1', authoritative: false, kind: 'demonstration' }, evaluatedAt: new Date(), expiresAt: evalExpiry, evaluator: { connect: { id: userId } } } })

    for (const dayOfWeek of [0, 1, 2, 3, 4, 5, 6]) {
      await transactionSudo.query.AvailabilityRule.createOne({ data: { driver: { connect: { id: driver.id } }, dayOfWeek, startTime: '00:00', endTime: '23:59', timezone: 'America/New_York', status: 'active' } })
    }

    await transactionContext.prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'provider:pp_manual'}, 0))::text IS NOT NULL`
    const manualProvider = await transactionSudo.query.PaymentProvider.findOne({ where: { code: 'pp_manual' }, query: 'id' })
    if (!manualProvider) await transactionSudo.query.PaymentProvider.createOne({ data: { name: 'Manual payments', code: 'pp_manual', isInstalled: 'yes', createPaymentFunction: 'manual', capturePaymentFunction: 'manual', refundPaymentFunction: 'manual', getPaymentStatusFunction: 'manual', handleWebhookFunction: 'manual', metadata: { disclosure: 'Records payment evidence only; does not move money.' } } })
    for (const [name, kind, adapter] of [['Manual route estimate', 'mapping', 'manual'], ['Console notifications', 'notification', 'console'], ['Unconfigured identity evidence', 'identity', 'manual'], ['Unconfigured background-check evidence', 'background_check', 'manual']] as const) {
      await transactionSudo.query.ProviderConnection.createOne({ data: { fleet: { connect: { id: fleet.id } }, name, kind, adapter, status: kind === 'mapping' || kind === 'notification' ? 'sandbox' : 'unconfigured', capabilities: [], evidencePolicyUrl: 'https://example.invalid/provider-policy' } })
    }
    await transactionSudo.query.MarketplaceRegistration.createOne({ data: { fleet: { connect: { id: fleet.id } }, sourceId: `source-rideshare-${fleet.id}`, platform: 'openfront-rideshare', status: 'active', manifestVersion: '1', publicBaseUrl: requestBaseUrl(context.req), capabilities: ['marketplace.discovery', 'rideshare.quote', 'rideshare.request', 'rideshare.trip.view'], verificationEvidence: { localContractTestsRequired: true } } })
    const persistedFleet = await transactionSudo.query.Fleet.findOne({ where: { id: fleet.id }, query: demoSeedInspectionSelections.fleet })
    const diagnostic = await inspectExistingDemoFleet(transactionSudo, transactionContext, persistedFleet, userId, args.mode)
    await transactionSudo.query.User.updateOne({ where: { id: userId }, data: { onboardingStatus: diagnostic.onboardingStatus } })

    return { fleetId: fleet.id, created: true, summary: diagnostic }
  // The starter seed is a few dozen writes; Prisma's 5s interactive default is too tight for it.
  }, { maxWait: 10_000, timeout: 60_000 })
}
