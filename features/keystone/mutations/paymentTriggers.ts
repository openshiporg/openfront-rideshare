import type { PrismaClient } from '@prisma/client'
import { moneySnapshot } from './finance'
import { chargeDue } from './savedCards'
import { advanceAutoDispatch, advanceFleetAutoDispatch } from './autoDispatch'
import { runMaintenance } from './maintenance'

// What happens after a ride command commits: auto-dispatch moves to the next driver, and money due on a saved card
// is charged. Each runs after the original command has committed and never changes its answer; a failure here
// is visible on the dispatch board (no offer) or the trip page (a failed charge to retry).

type Resolver<A = any, R = any> = (root: unknown, args: A, context: any) => Promise<R>

/** Waits for the side effect, but no longer than `ms`; past that it carries on in the background. */
function bounded(work: Promise<unknown>, ms = 4000) {
  return Promise.race([work.catch(() => {}), new Promise(resolve => setTimeout(resolve, ms))])
}

async function fleetOfDriver(prisma: PrismaClient, driverId?: string | null, userId?: string | null) {
  const driver = driverId ? await prisma.driverProfile.findUnique({ where: { id: driverId }, select: { fleetId: true } })
    : userId ? await prisma.driverProfile.findFirst({ where: { userId }, select: { fleetId: true } }) : null
  return driver?.fleetId || null
}

export function autoDispatchAfter<R>(resolver: Resolver<any, R>, kind: 'request' | 'response' | 'online'): Resolver<any, R> {
  return async (root, args, context) => {
    const result: any = await resolver(root, args, context)
    const prisma = context.prisma as PrismaClient
    if (kind === 'request' && result?.requestId && result.replayed === false) await bounded(advanceAutoDispatch(prisma, result.requestId))
    if (kind === 'response' && result && result.accepted === false && result.requestId) await bounded((async () => {
      await advanceAutoDispatch(prisma, result.requestId)
      await advanceFleetAutoDispatch(prisma, await fleetOfDriver(prisma, null, context.session?.itemId))
    })())
    if (kind === 'online' && args?.online && result?.dispatchStatus === 'available') await bounded(advanceFleetAutoDispatch(prisma, await fleetOfDriver(prisma, result.id)))
    return result
  }
}

/** The rider's status poll doubles as the dispatch clock: an offer that ran out moves to the next driver. */
export function dispatchOnPoll<R>(resolver: Resolver<any, R>): Resolver<any, R> {
  return async (root, args, context) => {
    const result: any = await resolver(root, args, context)
    runMaintenance(context.prisma)
    if (result?.requestId && ['requested', 'matching'].includes(result.status)) void advanceAutoDispatch(context.prisma, result.requestId, { throttleMs: 4000 })
    return result
  }
}

/** Any driver's workspace refresh also moves the fleet's waiting rides on, so dispatch never depends on the rider's tab. */
export function dispatchOnDriverRead<R>(resolver: Resolver<any, R>): Resolver<any, R> {
  return async (root, args, context) => {
    const result: any = await resolver(root, args, context)
    runMaintenance(context.prisma)
    if (result?.driver?.id && result.driver.status === 'active') void fleetOfDriver(context.prisma, result.driver.id).then(fleetId => advanceFleetAutoDispatch(context.prisma, fleetId, { throttleMs: 5000 }))
    return result
  }
}

export function chargeAfterTransition<R>(resolver: Resolver<any, R>): Resolver<any, R> {
  return async (root, args, context) => {
    const result: any = await resolver(root, args, context)
    const prisma = context.prisma as PrismaClient
    if (!result?.id || !['completed', 'no_show'].includes(result.status)) return result
    await bounded((async () => {
      const trip = await prisma.trip.findUnique({ where: { id: result.id }, select: { id: true, status: true, bookingSnapshot: true, fleetId: true, cancellations: { where: { reasonCode: 'rider_no_show' }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, feeMinor: true, currencyCode: true } } } })
      if (trip?.status === 'completed') {
        let money: { amount: number; currency: string } | null = null
        try { money = moneySnapshot(trip.bookingSnapshot) } catch { /* no payable fare */ }
        if (money) await chargeDue(prisma, { tripId: trip.id, purpose: 'fare', amountMinor: money.amount, currencyCode: money.currency, key: `saved-card:fare:${trip.id}` })
      }
      const fee = trip?.status === 'no_show' ? trip.cancellations[0] : null
      if (fee) await chargeDue(prisma, { tripId: trip!.id, purpose: 'no_show_fee', amountMinor: fee.feeMinor || 0, currencyCode: fee.currencyCode, key: `saved-card:no-show:${fee.id}` })
      await advanceFleetAutoDispatch(prisma, trip?.fleetId)
    })(), 15_000)
    return result
  }
}

/** A rider who cancels after a driver is on the way owes the cancellation fee quoted with the ride. */
export function chargeAfterCancel<R>(resolver: Resolver<any, R>): Resolver<any, R> {
  return async (root, args, context) => {
    const result: any = await resolver(root, args, context)
    const prisma = context.prisma as PrismaClient
    if (!result?.id || !result.tripId) return result
    await bounded((async () => {
      if (result.actorType === 'rider' && result.feeMinor > 0) await chargeDue(prisma, { tripId: result.tripId, purpose: 'cancellation_fee', amountMinor: result.feeMinor, currencyCode: result.currencyCode, key: `saved-card:cancel:${result.id}` })
      const trip = await prisma.trip.findUnique({ where: { id: result.tripId }, select: { fleetId: true, requestId: true } })
      if (args?.reassign && trip?.requestId) await advanceAutoDispatch(prisma, trip.requestId)
      await advanceFleetAutoDispatch(prisma, trip?.fleetId)
    })(), 15_000)
    return result
  }
}
