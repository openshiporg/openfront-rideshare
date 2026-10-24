import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { password, relationship, select, text } from '@keystone-6/core/fields'
import { isSignedIn, permissionNames, permissions, type AccessArgs } from '../access'
import { trackingFields } from './trackingFields'
import { riderSignupsOpen } from '../domain/riderAccounts'

const selfOrPeople = async (args: AccessArgs) => await permissions.canManagePeople(args) || (await isSignedIn(args) ? { id: { equals: args.session!.itemId } } : false)
const selfField = async (args: AccessArgs & { item: { id: { toString(): string } } }) => await permissions.canManagePeople(args) || (await isSignedIn(args) && args.session!.itemId === String(args.item.id))

// The first user is the install's administrator. Their Admin role is upserted here, by name and with an
// explicitly read-back id, instead of through initFirstItem's nested `role.create`, which reached Prisma
// in production as `role.connect.id = undefined` and blocked setup.
async function firstUserAdminRole(context: { prisma: any }) {
  if (await context.prisma.user.count() > 0) return null
  const grants = Object.fromEntries(permissionNames.map(name => [name, true]))
  await context.prisma.role.upsert({ where: { name: 'Admin' }, create: { name: 'Admin', ...grants }, update: grants, select: { id: true } })
  const role = await context.prisma.role.findUnique({ where: { name: 'Admin' }, select: { id: true } })
  if (!role?.id) throw new Error('The Admin role could not be created.')
  return role.id as string
}

export const User = list({
  // The password is write-only (read: denyAll), so a list column would always read "not set".
  ui: { listView: { initialColumns: ['name', 'email', 'role', 'onboardingStatus'] } },
  hooks: {
    resolveInput: async ({ operation, resolvedData, context }) => {
      if (operation !== 'create' || resolvedData.role) return resolvedData
      const roleId = await firstUserAdminRole(context)
      return roleId ? { ...resolvedData, role: { connect: { id: roleId } } } : resolvedData
    },
  },
  access: {
    operation: { query: isSignedIn, create: async args => await riderSignupsOpen(args.context.prisma) || permissions.canManagePeople(args), update: isSignedIn, delete: denyAll },
    filter: { query: selfOrPeople, update: selfOrPeople },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    email: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    password: password({ validation: { isRequired: true, length: { min: 10 } }, access: { read: denyAll } }),
    phone: text({ access: { read: selfField, update: selfField } }),
    role: relationship({ ref: 'Role.assignedTo', access: { create: permissions.canManageRoles, update: permissions.canManageRoles } }),
    onboardingStatus: select({ options: [
      { label: 'Not started', value: 'not_started' }, { label: 'In progress', value: 'in_progress' },
      { label: 'Completed', value: 'completed' }, { label: 'Dismissed', value: 'dismissed' },
    ], defaultValue: 'not_started', access: { create: () => false, update: () => false } }),
    fleetMemberships: relationship({ ref: 'FleetMembership.user', many: true, access: { create: () => false, update: () => false } }),
    driverProfile: relationship({ ref: 'DriverProfile.user', access: { create: () => false, update: () => false } }),
    riderProfile: relationship({ ref: 'RiderProfile.user', access: { create: () => false, update: () => false } }),
    requestedRides: relationship({ ref: 'RideRequest.rider', many: true, access: { create: () => false, update: () => false } }),
    trips: relationship({ ref: 'Trip.rider', many: true, access: { create: () => false, update: () => false } }),
    reviews: relationship({ ref: 'Review.author', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})
