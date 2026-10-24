export const demoSeedInspectionSelections = {
  fleet: `id slug status providers(where: { kind: { in: ["mapping", "notification", "identity", "background_check"] } }, orderBy: [{ id: asc }], take: 10) { kind adapter status } marketplaceRegistration { sourceId platform status manifestVersion }`,
  membership: 'id role status fleet { id } user { id }',
  serviceArea: 'id status fleet { id }',
  service: `id slug status passengerCapacity wheelchairAccessible fleet { id }
    serviceAreas(where: { status: { equals: "active" } }, orderBy: [{ id: asc }], take: 25) { id status fleet { id } }
    fareRules(where: { status: { equals: "active" } }, orderBy: [{ id: asc }], take: 25) {
      id status fleet { id } service { id fleet { id } } serviceArea { id status fleet { id } }
    }`,
  policy: `id name kind status fleet { id } evaluations(orderBy: [{ id: asc }], take: 50) {
    id policy { id status fleet { id } } driver { id status fleet { id } } vehicle { id status fleet { id } }
  }`,
  driver: `id status user { id } fleet { id }
    availabilityRules(where: { status: { equals: "active" } }, orderBy: [{ dayOfWeek: asc }, { id: asc }], take: 10) { id dayOfWeek status }`,
  vehicle: `id status capacity wheelchairAccessible fleet { id }
    drivers(where: { status: { equals: "active" } }, orderBy: [{ id: asc }], take: 25) { id status fleet { id } }`,
  document: 'kind driver { id fleet { id } } vehicle { id fleet { id } }',
  paymentProvider: 'id code isInstalled createPaymentFunction capturePaymentFunction refundPaymentFunction getPaymentStatusFunction handleWebhookFunction',
} as const

export type ExistingDemoSeedDiagnostic = {
  mode: string
  setupComplete: boolean
  onboardingStatus: 'completed' | 'in_progress'
  missing: string[]
  limitations: string[]
  message: string
}

type ReadResult = { rows: Record<string, any>[]; readable: boolean }

async function readRows(read: () => Promise<unknown>): Promise<ReadResult> {
  try {
    const rows = await read()
    return Array.isArray(rows)
      ? { rows: rows as Record<string, any>[], readable: true }
      : { rows: [], readable: false }
  } catch {
    return { rows: [], readable: false }
  }
}

const rowInFleet = (row: Record<string, any> | undefined, fleetId: string) => Boolean(row && row.fleet?.id === fleetId)
const activeInFleet = (row: Record<string, any> | undefined, fleetId: string) => row?.status === 'active' && rowInFleet(row, fleetId)

export async function inspectExistingDemoFleet(
  sudo: any,
  context: any,
  fleet: Record<string, any>,
  userId: string,
  mode: string,
): Promise<ExistingDemoSeedDiagnostic> {
  const limitations = [
    'These checks verify demo fixture structure only; policy-evaluation records are not evidence of approval, licensing, insurance, background clearance, or driver admission.',
    'Provider rows are configuration fixtures only; no provider connectivity, installation, payment, notification, or identity action was checked or performed.',
    'Structural completeness is not dispatch eligibility, operational readiness, or permission to carry real passengers.',
    'This existing-fleet diagnostic does not create or repair demo records.',
    'Document checks read only bounded kind and relationship metadata through normal driver List access; no file references, evidence contents, review notes, or approval state are projected.',
    'Required document kinds mirror the current demo seed policy only; an owner must validate any real onboarding evidence policy before operational use.',
  ]
  const missing: string[] = []
  const fleetId = typeof fleet.id === 'string' ? fleet.id : ''
  if (!fleetId) missing.push('The sample fleet could not be found')
  if (mode !== 'minimal' && mode !== 'full') {
    missing.push('supported demo seed mode (minimal or full)')
  }
  if (fleet.status !== 'active') missing.push('Fleet status set to Active')
  if (!fleetId || (mode !== 'minimal' && mode !== 'full')) {
    return makeDiagnostic(mode, missing, limitations)
  }

  const scopedSeed = typeof fleet.slug === 'string' && fleet.slug.startsWith('harbor-mobility-')
  const standardSlug = scopedSeed ? `${fleet.slug}-standard` : 'independent-standard'
  const accessibleSlug = scopedSeed ? `${fleet.slug}-accessible` : 'accessible-ride'
  const expectedServiceSlugs = mode === 'minimal' ? [standardSlug] : [standardSlug, accessibleSlug]

  const [memberships, areas, services, policies, drivers, vehicles, paymentProviders] = await Promise.all([
    readRows(() => sudo.query.FleetMembership.findMany({
      where: { fleet: { id: { equals: fleetId } }, user: { id: { equals: userId } }, role: { equals: 'owner' }, status: { equals: 'active' } },
      orderBy: [{ id: 'asc' }],
      take: 1,
      query: demoSeedInspectionSelections.membership,
    })),
    readRows(() => sudo.query.ServiceArea.findMany({
      where: { fleet: { id: { equals: fleetId } }, status: { equals: 'active' } },
      orderBy: [{ id: 'asc' }],
      take: 25,
      query: demoSeedInspectionSelections.serviceArea,
    })),
    readRows(() => sudo.query.RideService.findMany({
      where: { fleet: { id: { equals: fleetId } }, status: { equals: 'active' }, slug: { in: expectedServiceSlugs } },
      orderBy: [{ id: 'asc' }],
      take: expectedServiceSlugs.length,
      query: demoSeedInspectionSelections.service,
    })),
    readRows(() => sudo.query.Policy.findMany({
      where: { fleet: { id: { equals: fleetId } }, kind: { in: ['driver_eligibility', 'vehicle_eligibility'] }, status: { equals: 'active' } },
      orderBy: [{ id: 'asc' }],
      take: 2,
      query: demoSeedInspectionSelections.policy,
    })),
    readRows(() => sudo.query.DriverProfile.findMany({
      where: { fleet: { id: { equals: fleetId } }, user: { id: { equals: userId } }, status: { equals: 'active' } },
      orderBy: [{ id: 'asc' }],
      take: 1,
      query: demoSeedInspectionSelections.driver,
    })),
    readRows(() => sudo.query.Vehicle.findMany({
      where: { fleet: { id: { equals: fleetId } }, status: { equals: 'active' } },
      orderBy: [{ id: 'asc' }],
      take: 25,
      query: demoSeedInspectionSelections.vehicle,
    })),
    readRows(() => context.query.PaymentProvider.findMany({
      where: { code: { equals: 'pp_manual' } },
      orderBy: [{ id: 'asc' }],
      take: 1,
      query: demoSeedInspectionSelections.paymentProvider,
    })),
  ])

  const readNames = [
    ['owner membership', memberships],
    ['active service areas', areas],
    ['active services and linked fare/area rows', services],
    ['active demo policy and evaluation fixtures', policies],
    ['active owner-linked demo driver and availability', drivers],
    ['active vehicles and driver links', vehicles],
    ['manual payment-provider fixture under existing finance List access', paymentProviders],
  ] as const
  for (const [name, result] of readNames) {
    if (!result.readable) missing.push(`${name} could not be verified`)
  }

  const ownerMembership = memberships.rows.some(row => rowInFleet(row, fleetId)
    && row.user?.id === userId && row.role === 'owner' && row.status === 'active')
  if (memberships.readable && !ownerMembership) missing.push('You as an owner of the fleet')

  const activeAreas = areas.rows.filter(row => activeInFleet(row, fleetId) && typeof row.id === 'string')
  if (areas.readable && activeAreas.length === 0) missing.push('An active service area')
  const activeAreaIds = new Set(activeAreas.map(row => row.id))

  const activeServices = services.rows.filter(row => activeInFleet(row, fleetId) && expectedServiceSlugs.includes(row.slug))
  for (const slug of expectedServiceSlugs) {
    const service = activeServices.find(row => row.slug === slug)
    if (!services.readable || !service) {
      if (services.readable) missing.push(`Active service ${serviceLabel(slug)}`)
      continue
    }
    const linkedAreaIds = new Set((Array.isArray(service.serviceAreas) ? service.serviceAreas : [])
      .filter((area: Record<string, any>) => activeInFleet(area, fleetId) && activeAreaIds.has(area.id))
      .map((area: Record<string, any>) => area.id))
    if (linkedAreaIds.size === 0) missing.push(`Service area for ${serviceLabel(slug)}`)

    const hasMatchingFare = (Array.isArray(service.fareRules) ? service.fareRules : []).some((fare: Record<string, any>) =>
      fare.status === 'active'
      && rowInFleet(fare, fleetId)
      && fare.service?.id === service.id
      && rowInFleet(fare.service, fleetId)
      && linkedAreaIds.has(fare.serviceArea?.id)
      && activeInFleet(fare.serviceArea, fleetId))
    if (linkedAreaIds.size > 0 && !hasMatchingFare) {
      missing.push(`Active fare rule for ${serviceLabel(slug)}`)
    }
  }

  const demoPolicy = policies.rows.find(row => activeInFleet(row, fleetId)
    && row.name === 'Demo driver and vehicle evidence policy' && row.kind === 'driver_eligibility')
  if (policies.readable && !demoPolicy) missing.push('Active driver eligibility policy')

  const demoDriver = drivers.rows.find(row => activeInFleet(row, fleetId) && row.user?.id === userId)
  if (drivers.readable && !demoDriver) missing.push('Active sample driver linked to your account')
  const weekdayRules = Array.isArray(demoDriver?.availabilityRules) ? demoDriver.availabilityRules : []
  const missingDays = [1, 2, 3, 4, 5].filter(day => !weekdayRules.some((rule: Record<string, any>) => rule.status === 'active' && rule.dayOfWeek === day))
  if (demoDriver && missingDays.length) missing.push(`Sample driver hours (missing days ${missingDays.join(', ')})`)

  const activeVehicles = vehicles.rows.filter(row => activeInFleet(row, fleetId) && typeof row.id === 'string')
  if (vehicles.readable && activeVehicles.length === 0) missing.push('An active vehicle')
  const pairedVehicles = activeVehicles.filter(vehicle => Array.isArray(vehicle.drivers)
    && vehicle.drivers.some((driver: Record<string, any>) => activeInFleet(driver, fleetId) && driver.id === demoDriver?.id))
  if (demoDriver && vehicles.readable && pairedVehicles.length === 0) missing.push('A vehicle assigned to the sample driver')

  if (demoDriver) {
    const documentBranches = [
      { driver: { id: { equals: demoDriver.id } } },
      ...pairedVehicles.map(vehicle => ({ vehicle: { id: { equals: vehicle.id } } })),
    ]
    const documents = await readRows(() => context.query.ComplianceDocument.findMany({
      where: { OR: documentBranches },
      orderBy: [{ id: 'asc' }],
      take: 25,
      query: demoSeedInspectionSelections.document,
    }))
    if (!documents.readable) {
      missing.push('Driver and vehicle documents could not be checked with your access')
    } else {
      const driverDocuments = documents.rows.filter(row => row.kind && row.driver?.id === demoDriver.id && rowInFleet(row.driver, fleetId))
      for (const kind of ['driver_license', 'insurance']) {
        if (!driverDocuments.some(row => row.kind === kind)) {
          missing.push(`Sample driver: ${kind.replaceAll('_', ' ')} document`)
        }
      }
      for (const vehicle of pairedVehicles) {
        const vehicleDocuments = documents.rows.filter(row => row.kind && row.vehicle?.id === vehicle.id && rowInFleet(row.vehicle, fleetId))
        for (const kind of ['vehicle_registration', 'inspection']) {
          if (!vehicleDocuments.some(row => row.kind === kind)) {
            missing.push(`Sample vehicle: ${kind.replaceAll('_', ' ')} document`)
          }
        }
      }
    }
  }

  const policyEvaluations = demoPolicy && Array.isArray(demoPolicy.evaluations) ? demoPolicy.evaluations : []
  if (demoPolicy && demoDriver && !policyEvaluations.some((evaluation: Record<string, any>) =>
    evaluation.policy?.id === demoPolicy.id && rowInFleet(evaluation.policy, fleetId)
    && evaluation.driver?.id === demoDriver.id && activeInFleet(evaluation.driver, fleetId))) {
    missing.push('Eligibility check for the sample driver')
  }
  const vehiclePolicy = policies.rows.find(row => activeInFleet(row, fleetId) && row.kind === 'vehicle_eligibility')
  const vehicleEvaluations = Array.isArray(vehiclePolicy?.evaluations) ? vehiclePolicy.evaluations : []
  if (pairedVehicles.length && !pairedVehicles.some(vehicle => vehicleEvaluations.some((evaluation: Record<string, any>) =>
    evaluation.policy?.id === vehiclePolicy?.id && rowInFleet(evaluation.policy, fleetId)
    && evaluation.vehicle?.id === vehicle.id && activeInFleet(evaluation.vehicle, fleetId)))) {
    missing.push('Eligibility check for the sample vehicle')
  }

  if (mode === 'full') {
    const accessibleService = activeServices.find(row => row.slug === accessibleSlug && row.wheelchairAccessible === true)
    const accessibleVehicle = accessibleService && pairedVehicles.some(vehicle => vehicle.wheelchairAccessible === true
      && typeof vehicle.capacity === 'number'
      && typeof accessibleService.passengerCapacity === 'number'
      && vehicle.capacity >= accessibleService.passengerCapacity)
    if (accessibleService && !accessibleVehicle) missing.push('A wheelchair-accessible vehicle for the accessible service')
  }

  if (fleet && !hasExpectedProviderFixtures(fleet.providers)) {
    missing.push('Provider connections (mapping, notifications, identity, background check)')
  }
  const registration = fleet.marketplaceRegistration
  if (!registration || !['source-openfront-rideshare-local', `source-rideshare-${fleetId}`].includes(registration.sourceId)
    || registration.platform !== 'openfront-rideshare' || registration.status !== 'active' || registration.manifestVersion !== '1') {
    missing.push('Marketplace registration')
  }
  const manualProvider = paymentProviders.rows.find(row => row.code === 'pp_manual')
  if (paymentProviders.readable && !hasManualPaymentFixture(manualProvider)) {
    missing.push('Manual payment provider')
  }

  return makeDiagnostic(mode, [...new Set(missing)], limitations)
}

function hasExpectedProviderFixtures(value: unknown) {
  if (!Array.isArray(value)) return false
  const expected = [
    ['mapping', 'manual', 'sandbox'],
    ['notification', 'console', 'sandbox'],
    ['identity', 'manual', 'unconfigured'],
    ['background_check', 'manual', 'unconfigured'],
  ]
  return expected.every(([kind, adapter, status]) => value.some((row: Record<string, unknown>) =>
    row.kind === kind && row.adapter === adapter && row.status === status))
}

const serviceLabel = (slug: string) => slug.endsWith('-accessible') ? 'Accessible Ride' : slug.endsWith('-standard') ? 'Independent Standard' : slug

function hasManualPaymentFixture(row: Record<string, any> | undefined) {
  return row?.code === 'pp_manual' && row.isInstalled === 'yes'
    && row.createPaymentFunction === 'manual'
    && row.capturePaymentFunction === 'manual'
    && row.refundPaymentFunction === 'manual'
    && row.getPaymentStatusFunction === 'manual'
    && row.handleWebhookFunction === 'manual'
}

function makeDiagnostic(mode: string, missing: string[], limitations: string[]): ExistingDemoSeedDiagnostic {
  const setupComplete = missing.length === 0
  return {
    mode,
    setupComplete,
    onboardingStatus: setupComplete ? 'completed' : 'in_progress',
    missing,
    limitations,
    message: setupComplete
      ? 'Existing demo fixture structure passed bounded source checks; no operational readiness is implied.'
      : 'Existing demo fixture completeness is missing or unverified. Onboarding remains in progress; this check did not repair or create records.',
  }
}
