import type { Prisma } from '@prisma/client'

export const permissionNames = [
  'canAccessDashboard', 'canManagePeople', 'canManageRoles', 'canManageFleet', 'canDispatchRides',
  'canManageDrivers', 'canManageFinance', 'canManageSafety', 'canManageIntegrations', 'canManageOnboarding',
] as const

export type PermissionName = (typeof permissionNames)[number]
export type FleetCapability = 'operations' | 'drivers' | 'finance' | 'safety' | 'fleetAdmin'
export type Session = {
  itemId: string
  listKey: string
  data?: { name?: string; email?: string; role?: { id?: string; name?: string } & Partial<Record<PermissionName, boolean>> }
  apiKeyScopes?: string[]
}
export type AuthorityReader = Pick<Prisma.TransactionClient, 'user' | 'role' | 'fleet' | 'fleetMembership'>
export type AuthorityContext = { prisma: AuthorityReader }
export type AccessArgs = { context: AuthorityContext; session?: Session }

/** Scope hints are not credential authentication, and never union with human
 * role power. Only the configured native human User session is admitted here. */
export function humanSessionId(session?: Session): string | null {
  if (session?.listKey !== 'User' || typeof session.itemId !== 'string' || !session.itemId) return null
  if (['apiKeyId', 'apiKeyScopes', 'oauthScopes', 'customerToken'].some(key => Object.prototype.hasOwnProperty.call(session, key)) ||
    Object.prototype.hasOwnProperty.call(session.data || {}, 'machine')) return null
  return session.itemId
}

export async function currentHumanActor(db: AuthorityReader, session?: Session) {
  const actorId = humanSessionId(session)
  if (!actorId) return null
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { id: true, roleId: true } })
  return actor?.id === actorId ? actor : null
}

export async function hasPermission(permission: PermissionName, { context, session }: AccessArgs) {
  const actor = await currentHumanActor(context.prisma, session)
  if (!actor?.roleId) return false
  // One native relational predicate checks BOTH the persisted permission and
  // current inverse assignment, not the cookie flag or a detached old Role.
  const role = await context.prisma.role.findFirst({
    where: { id: actor.roleId, [permission]: true, assignedTo: { some: { id: actor.id } } },
    select: { id: true },
  })
  return role?.id === actor.roleId
}

export const permissions = Object.fromEntries(permissionNames.map(name => [name, (args: AccessArgs) => hasPermission(name, args)])) as Record<PermissionName, (args: AccessArgs) => Promise<boolean>>
export const isSignedIn = async ({ context, session }: AccessArgs) => Boolean(await currentHumanActor(context.prisma, session))
export const isGlobalAdministrator = (args: AccessArgs) => permissions.canManageRoles(args)

const membershipRoles: Record<FleetCapability, string[]> = {
  operations: ['owner', 'dispatcher'],
  drivers: ['owner', 'dispatcher'],
  finance: ['owner', 'finance'],
  safety: ['owner', 'support'],
  fleetAdmin: ['owner'],
}

const fleetWhereByList: Record<string, (ids: string[]) => Record<string, unknown>> = {
  Fleet: ids => ({ id: { in: ids } }),
  FleetMembership: ids => ({ fleet: { id: { in: ids } } }),
  FleetBrandingChange: ids => ({ fleet: { id: { in: ids } } }),
  DriverProfile: ids => ({ fleet: { id: { in: ids } } }),
  Vehicle: ids => ({ fleet: { id: { in: ids } } }),
  RiderProfile: ids => ({ homeFleet: { id: { in: ids } } }),
  ServiceArea: ids => ({ fleet: { id: { in: ids } } }),
  RideService: ids => ({ fleet: { id: { in: ids } } }),
  AvailabilityRule: ids => ({ driver: { fleet: { id: { in: ids } } } }),
  AvailabilityException: ids => ({ driver: { fleet: { id: { in: ids } } } }),
  FareRule: ids => ({ fleet: { id: { in: ids } } }),
  ComplianceDocument: ids => ({ OR: [
    { driver: { fleet: { id: { in: ids } } } },
    { vehicle: { fleet: { id: { in: ids } } } },
  ] }),
  Policy: ids => ({ fleet: { id: { in: ids } } }),
  PolicyEvaluation: ids => ({ OR: [
    { driver: { fleet: { id: { in: ids } } } },
    { vehicle: { fleet: { id: { in: ids } } } },
    { policy: { fleet: { id: { in: ids } } } },
  ] }),
  ProviderConnection: ids => ({ fleet: { id: { in: ids } } }),
  MarketplaceRegistration: ids => ({ fleet: { id: { in: ids } } }),
  Notification: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  RideQuote: ids => ({ service: { fleet: { id: { in: ids } } } }),
  RideRequest: ids => ({ fleet: { id: { in: ids } } }),
  MatchOffer: ids => ({ OR: [
    { request: { fleet: { id: { in: ids } } } },
    { driver: { fleet: { id: { in: ids } } } },
  ] }),
  Trip: ids => ({ fleet: { id: { in: ids } } }),
  TripEvent: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  LocationEvent: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  Cancellation: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  SafetyIncident: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  SupportCase: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  Conversation: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  Message: ids => ({ conversation: { trip: { fleet: { id: { in: ids } } } } }),
  Review: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  Payment: ids => ({ trip: { fleet: { id: { in: ids } } } }),
  Refund: ids => ({ payment: { trip: { fleet: { id: { in: ids } } } } }),
  PaymentObservation: ids => ({ payment: { trip: { fleet: { id: { in: ids } } } } }),
  LedgerEntry: ids => ({ OR: [
    { trip: { fleet: { id: { in: ids } } } },
    { payment: { trip: { fleet: { id: { in: ids } } } } },
    { payout: { driver: { fleet: { id: { in: ids } } } } },
  ] }),
  Payout: ids => ({ driver: { fleet: { id: { in: ids } } } }),
}

function membershipWhere(actorId: string, capability: FleetCapability): Prisma.FleetMembershipWhereInput {
  return { userId: actorId, user: { is: { id: actorId } }, fleet: { isNot: null }, status: 'active', role: { in: membershipRoles[capability] } }
}

export async function fleetIdsFor(context: AuthorityContext, session: Session | undefined, capability: FleetCapability): Promise<string[]> {
  const actor = await currentHumanActor(context.prisma, session)
  if (!actor) return []
  const ids = new Set<string>()
  let after: string | undefined
  // Bounded header pages, without the old first-500 membership authority ceiling.
  for (;;) {
    const memberships = await context.prisma.fleetMembership.findMany({
      where: { ...membershipWhere(actor.id, capability), ...(after ? { id: { gt: after } } : {}) },
      orderBy: { id: 'asc' }, take: 200, select: { id: true, fleetId: true },
    })
    for (const membership of memberships) if (membership.fleetId) ids.add(membership.fleetId)
    if (memberships.length < 200) return [...ids]
    const last = memberships[memberships.length - 1].id
    if (last === after) throw new Error('Fleet authority continuation did not advance.')
    after = last
  }
}

export async function canAccessFleet(context: AuthorityContext, session: Session | undefined, fleetId: string | null | undefined, capability: FleetCapability): Promise<boolean> {
  if (!fleetId || !humanSessionId(session)) return false
  const fleet = await context.prisma.fleet.findUnique({ where: { id: fleetId }, select: { id: true } })
  if (fleet?.id !== fleetId) return false
  if (await isGlobalAdministrator({ context, session })) return true
  const actor = await currentHumanActor(context.prisma, session)
  if (!actor) return false
  const membership = await context.prisma.fleetMembership.findFirst({
    where: { ...membershipWhere(actor.id, capability), fleetId }, select: { id: true },
  })
  return Boolean(membership)
}

async function fleetScopeWhere({ context, session, listKey }: AccessArgs & { listKey: string }, capability: FleetCapability) {
  if (!humanSessionId(session)) return false
  if (await isGlobalAdministrator({ context, session })) return true
  const ids = await fleetIdsFor(context, session, capability)
  if (!ids.length) return false
  const filter = fleetWhereByList[listKey]
  return filter ? filter(ids) : false
}

export async function hasAnyFleetScope(context: AuthorityContext, session: Session | undefined, capability: FleetCapability) {
  if (!humanSessionId(session)) return false
  if (await isGlobalAdministrator({ context, session })) return true
  const actor = await currentHumanActor(context.prisma, session)
  if (!actor) return false
  return Boolean(await context.prisma.fleetMembership.findFirst({ where: membershipWhere(actor.id, capability), select: { id: true } }))
}

export function fleetScopedAccess(capability: FleetCapability) {
  return {
    operation: {
      query: ({ context, session }: AccessArgs) => hasAnyFleetScope(context, session, capability),
      // Tenant relationships are immutable at the field boundary. Generic
      // creates cannot establish a legitimate parent; semantic setup owns them.
      create: () => false,
      update: ({ context, session }: AccessArgs) => hasAnyFleetScope(context, session, capability),
      // Mutable parents are archived/paused, never severed from history by CRUD.
      delete: () => false,
    },
    filter: {
      query: (args: AccessArgs & { listKey: string }) => fleetScopeWhere(args, capability),
      update: (args: AccessArgs & { listKey: string }) => fleetScopeWhere(args, capability),
      delete: (args: AccessArgs & { listKey: string }) => fleetScopeWhere(args, 'fleetAdmin'),
    },
  }
}

export const isOperator = async ({ context, session }: AccessArgs) => hasAnyFleetScope(context, session, 'operations')
export const operatorAccess = fleetScopedAccess('operations')
export function lockedFleetAccess(capability: FleetCapability) {
  return {
    ...fleetScopedAccess(capability),
    operation: { query: ({ context, session }: AccessArgs) => hasAnyFleetScope(context, session, capability), create: () => false, update: () => false, delete: () => false },
  }
}
export const lockedOperationalAccess = lockedFleetAccess('operations')
export const financeAccess = {
  ...fleetScopedAccess('finance'),
  operation: { query: ({ context, session }: AccessArgs) => hasAnyFleetScope(context, session, 'finance'), create: () => false, update: () => false, delete: () => false },
}
export const safetyAccess = fleetScopedAccess('safety')
