// Count-filter attack as anonymous and each limited role. Needs a scratch database:
// RELFILTER_TEST=1 DATABASE_URL=<scratch> SESSION_SECRET=... npx tsx --test tests/relation-filter-access.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '@prisma/client'
import config from '../keystone'

const enabled = process.env.RELFILTER_TEST === '1'
let ctx: any
const ids: Record<string, string> = {}

const emails: Record<string, string> = { admin: 'alice.admin@example.com', dispatcher: 'maya@example.com', finance: 'dan@example.com', support: 'priya@example.com', viewer: 'tomas@example.com', rider: 'rita.secret@example.com', driver: 'dora.secret@example.com' }
async function seed() {
  ctx = getContext(config, PrismaModule)
  const db = new (PrismaModule as any).PrismaClient()
  if (await db.role.findUnique({ where: { name: 'FltAdmin' } })) {
    for (const [k, e] of Object.entries(emails)) ids[k] = (await db.user.findUnique({ where: { email: e } })).id
    await db.$disconnect(); return
  }
  const role = (name: string, grants: Record<string, boolean> = {}) => db.role.create({ data: { name, ...grants } })
  const admin = await role('FltAdmin', { canAccessDashboard: true, canManagePeople: true, canManageRoles: true, canManageFleet: true, canDispatchRides: true, canManageDrivers: true, canManageFinance: true, canManageSafety: true, canManageIntegrations: true, canManageOnboarding: true })
  const plain = await role('FltPlain')
  const mk = (key: string, name: string, email: string, r: any, phone = '') => db.user.create({ data: { name, email, phone, password: 'x'.repeat(12), role: { connect: { id: r.id } } } }).then((u: any) => (ids[key] = u.id, u))
  await mk('admin', 'Alice Admin', 'alice.admin@example.com', admin, '5550001')
  const dispatcher = await mk('dispatcher', 'Maya Dispatch', 'maya@example.com', plain)
  const finance = await mk('finance', 'Dan Finance', 'dan@example.com', plain)
  const support = await mk('support', 'Priya Support', 'priya@example.com', plain)
  await mk('viewer', 'Tomas Viewer', 'tomas@example.com', plain)
  const rider = await mk('rider', 'Rita Rider', 'rita.secret@example.com', plain, '5550002')
  const fleet = await db.fleet.create({ data: { name: 'Acme Secretfleet', slug: 'acme' } })
  for (const [u, r] of [[dispatcher, 'dispatcher'], [finance, 'finance'], [support, 'support'], [ids.viewer, 'viewer']] as const)
    await db.fleetMembership.create({ data: { fleetId: fleet.id, userId: typeof u === 'string' ? u : u.id, role: r, status: 'active' } })
  await db.riderProfile.create({ data: { userId: rider.id, homeFleetId: fleet.id, displayName: 'Rita R', emergencyContactEncryptedRef: 'ecr-secret' } })
  const driverUser = await mk('driver', 'Dora Driver', 'dora.secret@example.com', plain)
  const driver = await db.driverProfile.create({ data: { userId: driverUser.id, fleetId: fleet.id, publicName: 'Dora D' } })
  await db.vehicle.create({ data: { fleetId: fleet.id, label: 'Car', plateMasked: 'AB-12' } })
  const request = await db.rideRequest.create({ data: { fleetId: fleet.id, riderId: rider.id, requestNumber: 'RIDE-1' } })
  const trip = await db.trip.create({ data: { fleetId: fleet.id, requestId: request.id, status: 'cancelled', riderId: rider.id, driverId: driver.id, confirmationCode: 'TRIP-1' } })
  const provider = await db.paymentProvider.create({ data: { name: 'Prov', code: 'prov-secret', createPaymentFunction: 'a', capturePaymentFunction: 'a', refundPaymentFunction: 'a', getPaymentStatusFunction: 'a', handleWebhookFunction: 'a' } })
  const payment = await db.payment.create({ data: { tripId: trip.id, providerId: provider.id, amountMinor: 1234, currencyCode: 'USD', providerReference: 'pi_secret' } })
  await db.ledgerEntry.create({ data: { tripId: trip.id, paymentId: payment.id, entryKey: 'k1', amountMinor: 1, currencyCode: 'USD', account: 'acct-secret' } })
  await db.safetyIncident.create({ data: { tripId: trip.id, caseNumber: 'CASE-1', summary: 'secret incident', reportedById: rider.id } })
  await db.tripEvent.create({ data: { tripId: trip.id, eventType: 'x', idempotencyKey: 'ev1' } })
}

const as = (who: string | null) => who ? ctx.withSession({ itemId: ids[who], listKey: 'User', data: {} }) : ctx.withSession(undefined)
// [list count field, where template with $V, value that exists, who may legitimately read the target]
const probes: Array<[string, string, string]> = [
  ['tripsCount', 'payments: { some: { providerReference: { startsWith: $V } } }', 'pi_'],
  ['tripsCount', 'payments: { some: { provider: { code: { startsWith: $V } } } }', 'prov'],
  ['tripsCount', 'ledgerEntries: { some: { account: { startsWith: $V } } }', 'acct'],
  ['tripsCount', 'incidents: { some: { summary: { startsWith: $V } } }', 'secret'],
  ['tripsCount', 'rider: { email: { startsWith: $V } }', 'rita'],
  ['tripsCount', 'rider: { riderProfile: { emergencyContactEncryptedRef: { startsWith: $V } } }', 'ecr'],
  ['tripsCount', 'driver: { user: { email: { startsWith: $V } } }', 'dora'],
  ['tripsCount', 'fleet: { name: { startsWith: $V } }', 'Acme'],
  ['rideRequestsCount', 'rider: { email: { startsWith: $V } }', 'rita'],
  ['rideRequestsCount', 'trip: { payments: { some: { providerReference: { startsWith: $V } } } }', 'pi_'],
  ['driverProfilesCount', 'user: { email: { startsWith: $V } }', 'dora'],
  ['driverProfilesCount', 'fleet: { name: { startsWith: $V } }', 'Acme'],
  ['driverProfilesCount', 'trips: { some: { payments: { some: { providerReference: { startsWith: $V } } } } }', 'pi_'],
  ['vehiclesCount', 'fleet: { name: { startsWith: $V } }', 'Acme'],
  ['vehiclesCount', 'drivers: { some: { user: { email: { startsWith: $V } } } }', 'dora'],
  ['paymentsCount', 'trip: { rider: { email: { startsWith: $V } } }', 'rita'],
  ['paymentsCount', 'trip: { incidents: { some: { summary: { startsWith: $V } } } }', 'secret'],
  ['paymentsCount', 'trip: { fleet: { name: { startsWith: $V } } }', 'Acme'],
  ['paymentsCount', 'provider: { code: { startsWith: $V } }', 'prov'],
  ['ledgerEntriesCount', 'trip: { rider: { email: { startsWith: $V } } }', 'rita'],
  ['riderProfilesCount', 'user: { email: { startsWith: $V } }', 'rita'],
  ['riderProfilesCount', 'emergencyContactEncryptedRef: { startsWith: $V }', 'ecr'],
  ['riderProfilesCount', 'homeFleet: { name: { startsWith: $V } }', 'Acme'],
  ['safetyIncidentsCount', 'trip: { payments: { some: { providerReference: { startsWith: $V } } } }', 'pi_'],
  ['safetyIncidentsCount', 'reportedBy: { email: { startsWith: $V } }', 'rita'],
  ['usersCount', 'riderProfile: { emergencyContactEncryptedRef: { startsWith: $V } }', 'ecr'],
  ['usersCount', 'driverProfile: { publicName: { startsWith: $V } }', 'Dora'],
  ['usersCount', 'fleetMemberships: { some: { role: { equals: $V } } }', 'finance'],
  ['usersCount', 'trips: { some: { payments: { some: { providerReference: { startsWith: $V } } } } }', 'pi_'],
  ['usersCount', 'requestedRides: { some: { requestNumber: { startsWith: $V } } }', 'RIDE'],
  ['fleetMembershipsCount', 'user: { email: { startsWith: $V } }', 'dan'],
  ['fleetsCount', 'trips: { some: { payments: { some: { providerReference: { startsWith: $V } } } } }', 'pi_'],
  ['fleetsCount', 'memberships: { some: { user: { email: { startsWith: $V } } } }', 'maya'],
  ['paymentProvidersCount', 'payments: { some: { providerReference: { startsWith: $V } } }', 'pi_'],
  ['rolesCount', 'assignedTo: { some: { email: { startsWith: $V } } }', 'rita'],
]
const roles = process.env.RELFILTER_ROLES ? process.env.RELFILTER_ROLES.split(',').filter(r => r !== 'admin').map(r => r === 'anonymous' ? null : r) : [null, 'rider', 'viewer', 'dispatcher', 'finance', 'support']

async function count(who: string | null, field: string, where: string, value: string): Promise<number | string> {
  const query = `query { ${field}(where: { ${where.replace('$V', JSON.stringify(value))} }) }`
  const res = await as(who).graphql.raw({ query })
  return res.errors?.length ? 'error' : (res.data as any)[field]
}

test('relation filter access', { skip: !enabled }, async tt => {
  await seed()
for (const who of roles) {
  await tt.test(`${who ?? 'anonymous'} gets the same answer for a value that exists and one that does not`, async () => {
    const leaks: string[] = []
    for (const [field, where, hit] of probes) {
      const a = await count(who, field, where, hit)
      const b = await count(who, field, where, 'zzzz-none')
      if (a !== b) leaks.push(`${field} ${where.replace('$V', hit)} -> ${a} vs ${b}`)
    }
    assert.deepEqual(leaks, [])
  })
}

if (!process.env.RELFILTER_ROLES || process.env.RELFILTER_ROLES.includes('admin')) await tt.test('admin keeps its real filters', async () => {
  assert.equal(await count('admin', 'tripsCount', 'payments: { some: { providerReference: { startsWith: $V } } }', 'pi_'), 1)
  assert.equal(await count('admin', 'tripsCount', 'payments: { some: { providerReference: { startsWith: $V } } }', 'zzzz-none'), 0)
  assert.equal(await count('admin', 'usersCount', 'riderProfile: { emergencyContactEncryptedRef: { startsWith: $V } }', 'ecr'), 1)
})

if (!process.env.RELFILTER_ROLES || process.env.RELFILTER_ROLES.includes('admin')) await tt.test('secrets are not filterable even for admin', async () => {
  const res = await as('admin').graphql.raw({ query: '{ vehiclesCount(where: { plateEncryptedRef: { startsWith: "a" } }) }' })
  assert.ok(res.errors?.length)
})
  await ctx.prisma.$disconnect()
})
