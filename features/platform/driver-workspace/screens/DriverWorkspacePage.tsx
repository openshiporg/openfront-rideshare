import { CommandRecovery } from '@/features/platform/components/CommandRecovery'
import Link from 'next/link'
import { OperationalRefresh } from '@/features/platform/components/OperationalRefresh'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DriverOfferActions, DriverResponseRecovery, DriverTripActions } from '../components/DriverActions'

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
  return <PageContainer title="Driver workspace" header={<div><h1 className="text-2xl font-semibold">Driver workspace</h1><p className="text-sm text-muted-foreground">Review offers and update assigned-trip progress. Rider contact and incident details are not shown here.</p></div>} breadcrumbs={[{ type: 'link', label: 'Dashboard', href: '/dashboard' }, { type: 'page', label: 'My driving' }]}>
    <div className="space-y-6 p-4 md:p-6"><OperationalRefresh revision={new Date().toISOString()} />
      {!response.success && <div role="alert" className="rounded-xl border border-amber-500/40 p-5 text-sm text-amber-800 dark:text-amber-200">Driver workspace could not be loaded. This is not an empty offers list.</div>}
      {response.success && !workspace?.driver && <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Your account is not linked to a driver profile. Contact your fleet operator.</div>}
      {response.success && workspace?.driver && <>
        <div className="flex flex-wrap gap-2"><Badge>{workspace.driver.publicName}</Badge><Badge variant="outline">{workspace.driver.dispatchStatus || 'status unavailable'}</Badge></div>
        {!workspace.actionsEnabled && <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">{workspace.actionsBlockedReason || 'Driver actions are disabled in this deployment.'}</div>}
        <CommandRecovery actorId={workspace.actorId} /><DriverResponseRecovery enabled={workspace.actionsEnabled && workspace.driver.status === 'active'} />
        <section><h2 className="mb-3 font-semibold">Ride offers</h2><div className="grid gap-3">
          {workspace.offers.length ? workspace.offers.map(offer => <Card key={offer.id}><CardHeader><CardTitle className="flex flex-wrap justify-between gap-2 text-base"><span>{offer.request?.requestNumber || 'Offer details unavailable'}</span><span className="text-xs font-normal text-muted-foreground">Expires {new Date(offer.expiresAt).toLocaleTimeString()}</span></CardTitle></CardHeader><CardContent>{offer.request && offer.vehicle ? <><p>{offer.request.pickupLabel} → {offer.request.dropoffLabel}</p><p className="mt-2 text-xs text-muted-foreground">{offer.request.passengerCount || 1} passenger(s) · {offer.vehicle.label}{offer.request.requestedFor ? ` · ${new Date(offer.request.requestedFor).toLocaleString()}` : ' · Ride now'}</p><p className="mt-3 text-xs text-muted-foreground">Acceptance rechecks current eligibility and vehicle fit. The development instance does not contact a rider or provider.</p>{workspace.actionsEnabled ? <DriverOfferActions offerId={offer.id} expiresAt={offer.expiresAt} canAccept={workspace.driver?.status === 'active'}/> : <p role="status" className="mt-3 text-xs text-amber-800 dark:text-amber-200">Accept and decline are disabled in this deployment.</p>}</> : <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">This offer is missing its safe request or vehicle projection; no action is available.</p>}</CardContent></Card>) : <p className="text-sm text-muted-foreground">No unexpired offers are available.</p>}
        </div><nav className="mt-3 flex flex-wrap gap-3 text-sm">{params.offersCursor && <Link className="underline" href={pageHref(null, params.tripsCursor)}>Newest offers</Link>}{workspace.offersNextCursor && <Link className="underline" href={pageHref(workspace.offersNextCursor, params.tripsCursor)}>More offers</Link>}</nav></section>
        <section><h2 className="mb-3 font-semibold">Assigned trips</h2><div className="grid gap-3">
          {workspace.trips.length ? workspace.trips.map(trip => <Card key={trip.id}><CardContent className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{trip.confirmationCode}</p><p className="mt-1 text-sm">{trip.pickupLabel} → {trip.dropoffLabel}</p><p className="mt-1 text-xs text-muted-foreground">{trip.scheduledFor ? new Date(trip.scheduledFor).toLocaleString() : 'On demand'}{trip.vehicle?.label ? ` · ${trip.vehicle.label}` : ''}</p></div><Badge variant="secondary">{trip.status.replaceAll('_', ' ')}</Badge></div>{workspace.actionsEnabled ? <DriverTripActions tripId={trip.id} status={trip.status} actorId={workspace.actorId} acceptedOfferId={trip.acceptedOfferId}/> : <p role="status" className="mt-3 text-xs text-amber-800 dark:text-amber-200">Trip transitions are disabled in this deployment.</p>}</CardContent></Card>) : <p className="text-sm text-muted-foreground">No active assigned trips.</p>}
        </div><nav className="mt-3 flex flex-wrap gap-3 text-sm">{params.tripsCursor && <Link className="underline" href={pageHref(params.offersCursor, null)}>Current trips</Link>}{workspace.tripsNextCursor && <Link className="underline" href={pageHref(params.offersCursor, workspace.tripsNextCursor)}>More trips</Link>}</nav></section>
      </>}
    </div>
  </PageContainer>
}
export default DriverWorkspacePage
