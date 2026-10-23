import { GraphQLError } from 'graphql'

/** Server-owned readiness. A fleet takes live rides only after its operator turns on manual
 * dispatch (Fleet.operationsMode = 'manual'): operators assign drivers by hand, fares come from
 * the fleet's fare rules over the built-in route estimate, and payment is recorded through the
 * manual adapter. Development installs stay open so the workflows can be exercised locally. */
export const OPERATIONS_MODES = ['off', 'manual'] as const
export type OperationsMode = typeof OPERATIONS_MODES[number]

export function operationsEnabled(mode: string | null | undefined) {
  return mode === 'manual' || process.env.NODE_ENV !== 'production'
}

export function rideReadiness(mode?: string | null) {
  const enabled = operationsEnabled(mode)
  return {
    bookingEnabled: enabled,
    mode: mode === 'manual' ? 'manual' : enabled ? 'preview' : 'unavailable',
    reason: mode === 'manual' ? 'An operator assigns your driver.' : enabled ? 'Preview: routes and fares are estimated.' : 'Online booking is not open yet.',
  }
}

export const OPERATIONS_OFF_MESSAGE = 'Manual dispatch is off for this fleet. Turn it on in Platform → Settings → Operations.'

/** Throws unless the fleet's operator has turned on manual dispatch. */
export async function requireFleetOperations(db: any, fleetId: string | null | undefined) {
  const fleet = fleetId ? await db.fleet.findUnique({ where: { id: fleetId }, select: { operationsMode: true } }) : null
  // A GraphQLError so Yoga passes the reason through instead of masking it as "Unexpected error."
  if (!fleet || !operationsEnabled(fleet.operationsMode)) throw new GraphQLError(OPERATIONS_OFF_MESSAGE, { extensions: { code: 'RIDESHARE_OPERATIONS_OFF' } })
}
