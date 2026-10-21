import { isDriverAvailableAt } from './availability'

/** Bound applicable data, not an arbitrary first page of historical exceptions.
 * An oversized required set is explicitly incomplete and fails closed. */
export async function isCurrentlyAvailableAt(db: any, driverId: string, at: Date) {
  const [rules, exceptions] = await Promise.all([
    db.availabilityRule.findMany({ where: { driverId, status: 'active', AND: [{ OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }] }, { OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: at } }] }] }, orderBy: { id: 'asc' }, take: 1001 }),
    db.availabilityException.findMany({ where: { driverId, startsAt: { lte: at }, endsAt: { gt: at } }, orderBy: { id: 'asc' }, take: 1001 }),
  ])
  if (rules.length > 1000 || exceptions.length > 1000) throw new Error('Applicable driver availability is incomplete; reconcile the schedule before dispatch.')
  return isDriverAvailableAt(rules, exceptions, at)
}
