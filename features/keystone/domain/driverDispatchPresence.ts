import type { Prisma } from '@prisma/client'

const ACTIVE_TRIP_STATUSES = ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress']
const IN_PROGRESS_TRIP_STATUSES = ['driver_en_route', 'driver_arrived', 'in_progress']
const PRESENT_DISPATCH_STATUSES = ['available', 'offered', 'assigned', 'on_trip']

/** Rebuilds present occupancy only; future scheduled offers/trips do not make a driver busy now. */
export async function refreshDriverPresentDispatchStatus(tx: Prisma.TransactionClient, driverId: string, now = new Date()) {
  const [presentTrip, immediateOffer] = await Promise.all([
    tx.trip.findFirst({
      where: {
        driverId,
        status: { in: ACTIVE_TRIP_STATUSES },
        OR: [
          { scheduledFor: null },
          { scheduledFor: { lte: now } },
          { status: { in: IN_PROGRESS_TRIP_STATUSES } },
        ],
      },
      orderBy: { acceptedAt: 'desc' },
      select: { status: true },
    }),
    tx.matchOffer.findFirst({
      where: {
        driverId,
        status: 'offered',
        expiresAt: { gt: now },
        reservationReleasedAt: null,
        request: { requestedFor: null },
      },
      select: { id: true },
    }),
  ])

  const dispatchStatus = presentTrip
    ? IN_PROGRESS_TRIP_STATUSES.includes(presentTrip.status || '') ? 'on_trip' : 'assigned'
    : immediateOffer ? 'offered' : 'available'

  await tx.driverProfile.updateMany({
    where: { id: driverId, status: 'active', dispatchStatus: { in: PRESENT_DISPATCH_STATUSES } },
    data: { dispatchStatus },
  })
}
