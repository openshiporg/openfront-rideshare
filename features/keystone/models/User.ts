import { list } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { password, relationship, select, text } from '@keystone-6/core/fields'
import { isSignedIn, permissions, type AccessArgs } from '../access'
import { trackingFields } from './trackingFields'

const selfOrPeople = async (args: AccessArgs) => await permissions.canManagePeople(args) || (await isSignedIn(args) ? { id: { equals: args.session!.itemId } } : false)
const selfField = async (args: AccessArgs & { item: { id: { toString(): string } } }) => await permissions.canManagePeople(args) || (await isSignedIn(args) && args.session!.itemId === String(args.item.id))

export const User = list({
  access: {
    operation: { query: isSignedIn, create: args => process.env.PUBLIC_SIGNUPS_ALLOWED === 'true' || permissions.canManagePeople(args), update: isSignedIn, delete: denyAll },
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
