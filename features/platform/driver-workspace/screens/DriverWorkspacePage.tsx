import { CommandRecovery } from '@/features/platform/components/CommandRecovery'
import Link from 'next/link'
import { OperationalRefresh } from '@/features/platform/components/OperationalRefresh'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { CarFront, Clock, Users } from 'lucide-react'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { PlatformEmpty, PlatformHeader, PlatformSection } from '@/features/platform/components/PlatformPage'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { RouteLine } from '@/features/platform/components/RouteLine'
import { TripStageRail } from '@/features/platform/components/TripStageRail'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'
import { OnlineTrack } from '@/features/platform/drivers/components/DriverSetupActions'
import { DriverOfferActions, DriverResponseRecovery, DriverTripActions, OfferCountdown } from '../components/DriverActions'

type DriverWorkspaceData = {
  actorId: string
  driver: { id: string; publicName: string; status: string | null; dispatchStatus: string | null } | null
  offersNextCursor: string | null
  tripsNextCursor: string | null
  actionsEnabled: boolean
  actionsBlockedReason: string | null
  offers: Array<{
    id: string
    status: string
    offeredAt: string | null
    expiresAt: string
    request: { id: string; requestNumber: string; requestedFor: string | null; passengerCount: number | null; pickupLabel: string | null; dropoffLabel: string | null } | null
    vehicle: { id: string; label: string; color: string | null; plateMasked: string | null } | null
  }>
  trips: Array<{
    id: string
    acceptedOfferId: string
    confirmationCode: string
    status: string
    scheduledFor: string | null
    pickupLabel: string | null
    dropoffLabel: string | null
    vehicle: { id: string; label: string; plateMasked: string | null } | null
  }>
}

type DriverWorkspaceResponse = { myDriverWorkspace: DriverWorkspaceData }

export async function DriverWorkspacePage({ searchParams }: { searchParams?: Promise<{ offersCursor?: string; tripsCursor?: string }> } = {}) {
  const params = searchParams ? await searchParams : {}
  const pageHref = (offersCursor?: string | null, tripsCursor?: string | null) => { const q = new URLSearchParams(); if (offersCursor) q.set('offersCursor', offersCursor); if (tripsCursor) q.set('tripsCursor', tripsCursor); return `?${q}` }
  const response = await keystoneClient<DriverWorkspaceResponse>(`query Workspace($offersCursor: String, $tripsCursor: String) { myDriverWorkspace(offersCursor: $offersCursor, tripsCursor: $tripsCursor) { actorId offersNextCursor tripsNextCursor  driver { id publicName status dispatchStatus } actionsEnabled actionsBlockedReason offers { id status offeredAt expiresAt request { id requestNumber requestedFor passengerCount pickupLabel dropoffLabel } vehicle { id label color plateMasked } } trips { id acceptedOfferId confirmationCode status scheduledFor pickupLabel dropoffLabel vehicle { id label plateMasked } } } }`, { offersCursor: params.offersCursor || null, tripsCursor: params.tripsCursor || null })
  const workspace = response.success ? response.data?.myDriverWorkspace : null
  const driver = workspace?.driver
  const pager = 'inline-flex h-9 items-center rounded-[4px] border bg-background px-3 text-sm font-medium hover:bg-muted'
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'page', label: 'Platform' }, { type: 'page', label: 'My driving' }]} />
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
      <PlatformHeader
        title={driver ? <StatusTitle as="span" tone={statusTone(driver.dispatchStatus)} pulse={driver.dispatchStatus === 'available'} status={statusLabel(driver.dispatchStatus)}>{driver.publicName}</StatusTitle> : 'My driving'}
        meta={driver ? <><span className="inline-flex items-center gap-1.5"><StatusDot tone={statusTone(driver.status)} />Profile {statusLabel(driver.status).toLowerCase()}</span>{workspace && <span className="tabular-nums">{workspace.offers.length} offers · {workspace.trips.length} trips</span>}</> : null}
        actions={<>{driver?.status === 'active' && <OnlineTrack dispatchStatus={driver.dispatchStatus} />}<OperationalRefresh revision={new Date().toISOString()} /></>}
      />
      {!response.success && <p role="alert" className="rounded-[6px] border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Driver workspace unavailable. Refresh to try again.</p>}
      {response.success && !driver && <PlatformEmpty>This account has no driver profile</PlatformEmpty>}
      {response.success && workspace && driver && <>
        {!workspace.actionsEnabled && <p role="status" className="rounded-[6px] border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">{workspace.actionsBlockedReason || 'Driver actions are off'}</p>}
        <CommandRecovery actorId={workspace.actorId} />
        <DriverResponseRecovery enabled={workspace.actionsEnabled && driver.status === 'active'} />
        <PlatformSection id="offers" title="Ride offers" meta={workspace.offers.length || undefined}>
          {workspace.offers.length ? <ul className="space-y-3">{workspace.offers.map(offer => <li key={offer.id} className="space-y-4 rounded-[6px] border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <StatusTitle tone="amber" pulse status="New offer" className="font-mono text-sm font-semibold">{offer.request?.requestNumber || 'Offer'}</StatusTitle>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] bg-muted px-2.5 py-1 text-sm font-semibold"><Clock className="size-3.5" aria-hidden="true" /><OfferCountdown expiresAt={offer.expiresAt} /></span>
            </div>
            {offer.request && offer.vehicle ? <>
              <RouteLine pickup={offer.request.pickupLabel} dropoff={offer.request.dropoffLabel} className="text-base" />
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden="true" />{offer.request.passengerCount || 1}</span>
                <span className="inline-flex items-center gap-1"><CarFront className="size-3.5" aria-hidden="true" />{offer.vehicle.label}{offer.vehicle.plateMasked ? ` · ${offer.vehicle.plateMasked}` : ''}</span>
                <span>{offer.request.requestedFor ? formatWhen(offer.request.requestedFor) : 'Now'}</span>
              </p>
              {workspace.actionsEnabled ? <DriverOfferActions offerId={offer.id} expiresAt={offer.expiresAt} canAccept={driver.status === 'active'} /> : <p role="status" className="text-xs text-muted-foreground">Responses are off</p>}
            </> : <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">Offer details incomplete; no action available</p>}
          </li>)}</ul> : <PlatformEmpty>No offers right now</PlatformEmpty>}
          {(params.offersCursor || workspace.offersNextCursor) && <nav aria-label="Offer pages" className="flex flex-wrap gap-2">{params.offersCursor && <Link className={pager} href={pageHref(null, params.tripsCursor)}>Newest offers</Link>}{workspace.offersNextCursor && <Link className={pager} href={pageHref(workspace.offersNextCursor, params.tripsCursor)}>More offers</Link>}</nav>}
        </PlatformSection>
        <PlatformSection id="trips" title="Your trips" meta={workspace.trips.length || undefined}>
          {workspace.trips.length ? <ul className="space-y-3">{workspace.trips.map(trip => <li key={trip.id} className="space-y-4 rounded-[6px] border bg-card p-4">
            <StatusTitle tone={statusTone(trip.status)} status={statusLabel(trip.status)} pulse={['driver_en_route', 'in_progress'].includes(trip.status)} className="font-mono text-sm font-semibold">{trip.confirmationCode}</StatusTitle>
            <TripStageRail status={trip.status} />
            <RouteLine pickup={trip.pickupLabel} dropoff={trip.dropoffLabel} className="text-base" />
            <p className="text-xs text-muted-foreground">{trip.scheduledFor ? formatWhen(trip.scheduledFor) : 'On demand'}{trip.vehicle?.label ? ` · ${trip.vehicle.label}` : ''}{trip.vehicle?.plateMasked ? ` · ${trip.vehicle.plateMasked}` : ''}</p>
            {workspace.actionsEnabled ? <DriverTripActions tripId={trip.id} status={trip.status} actorId={workspace.actorId} acceptedOfferId={trip.acceptedOfferId} /> : <p role="status" className="text-xs text-muted-foreground">Trip updates are off</p>}
          </li>)}</ul> : <PlatformEmpty>No assigned trips</PlatformEmpty>}
          {(params.tripsCursor || workspace.tripsNextCursor) && <nav aria-label="Trip pages" className="flex flex-wrap gap-2">{params.tripsCursor && <Link className={pager} href={pageHref(params.offersCursor, null)}>Current trips</Link>}{workspace.tripsNextCursor && <Link className={pager} href={pageHref(params.offersCursor, workspace.tripsNextCursor)}>More trips</Link>}</nav>}
        </PlatformSection>
      </>}
    </div>
  </>
}
export default DriverWorkspacePage
