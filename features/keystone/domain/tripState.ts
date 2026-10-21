export const tripTransitions = {
  start_en_route: { from: ['driver_assigned'], to: 'driver_en_route' },
  arrive: { from: ['driver_en_route'], to: 'driver_arrived' },
  start_trip: { from: ['driver_arrived'], to: 'in_progress' },
  complete: { from: ['in_progress'], to: 'completed' },
  cancel: { from: ['driver_assigned', 'driver_en_route', 'driver_arrived'], to: 'cancelled' },
  no_show: { from: ['driver_arrived'], to: 'no_show' },
} as const

export type TripAction = keyof typeof tripTransitions

export function nextTripStatus(current: string, action: string) {
  const transition = tripTransitions[action as TripAction]
  if (!transition || !(transition.from as readonly string[]).includes(current)) throw new Error(`Trip cannot transition from ${current} via ${action}.`)
  return transition.to
}

export function timestampFieldForStatus(status: string) {
  return ({ driver_en_route: 'enRouteAt', driver_arrived: 'arrivedAt', in_progress: 'startedAt', completed: 'completedAt', cancelled: 'cancelledAt' } as Record<string, string>)[status]
}
