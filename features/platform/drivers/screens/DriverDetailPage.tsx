import Link from 'next/link'
import { ArrowUpRight, CarFront, ChevronLeft } from 'lucide-react'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { PlatformEmpty, PlatformHeader, PlatformSection } from '@/features/platform/components/PlatformPage'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'
import { AddDocumentSheet, AddVehicleSheet, AvailabilityEditor, DocumentReviewTrack, DriverReviewTrack, OnlineTrack, RemoveTimeOffTrack, AddTimeOffSheet, VehicleReviewTrack } from '../components/DriverSetupActions'

const DRIVER_QUERY = `query DriverDetail($id: ID!, $now: DateTime!) {
  driverProfile(where: { id: $id }) {
    id publicName publicBio status dispatchStatus acceptsScheduled
    user { id email }
    fleet { id name timezone }
    documents(orderBy: [{ createdAt: desc }], take: 25) { id kind status issuer referenceMasked expiresAt }
    vehicles(take: 20) { id label make model year color plateMasked capacity wheelchairAccessible status documents(orderBy: [{ createdAt: desc }], take: 25) { id kind status issuer referenceMasked expiresAt } }
    availabilityRules(where: { status: { equals: "active" } }, orderBy: [{ dayOfWeek: asc }], take: 21) { dayOfWeek startTime endTime timezone }
    availabilityExceptions(where: { endsAt: { gt: $now } }, orderBy: [{ startsAt: asc }], take: 20) { id startsAt endsAt kind reason }
    policyEvaluations(orderBy: [{ evaluatedAt: desc }], take: 5) { id outcome evaluatedAt expiresAt policy { kind } }
    trips(orderBy: [{ createdAt: desc }], take: 10) { id confirmationCode status createdAt }
  }
}`

const DRIVER_DOCUMENTS = ['driver_license', 'insurance']
const VEHICLE_DOCUMENTS = ['vehicle_registration', 'inspection']
type Document = { id: string; kind: string; status: string; issuer: string | null; referenceMasked: string | null; expiresAt: string | null }
const missing = (documents: Document[], required: string[]) => required.filter(kind => !documents.some(document => document.kind === kind && document.status === 'accepted_evidence' && (!document.expiresAt || Date.parse(document.expiresAt) > Date.now())))
const kindLabel = (kind: string) => ({ driver_license: 'Driver licence', insurance: 'Insurance', vehicle_registration: 'Vehicle registration', inspection: 'Inspection', background_check: 'Background check', business_license: 'Business licence' } as Record<string, string>)[kind] || 'Other'
const documentTone = (status: string) => status === 'accepted_evidence' ? 'green' : status === 'rejected_evidence' || status === 'revoked' || status === 'expired' ? 'red' : 'amber'
const documentStatus = (status: string) => ({ submitted: 'Submitted', under_review: 'In review', accepted_evidence: 'Accepted', rejected_evidence: 'Rejected', expired: 'Expired', revoked: 'Revoked' } as Record<string, string>)[status] || status

function DocumentList({ documents, required }: { documents: Document[]; required: string[] }) {
  const gaps = missing(documents, required)
  return <div className="space-y-2">
    {gaps.length > 0 && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Needs {gaps.map(kindLabel).join(' and ').toLowerCase()}</p>}
    {documents.length ? <ul className="divide-y overflow-hidden rounded-[6px] border bg-card">{documents.map(document => <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <StatusTitle as="p" tone={documentTone(document.status)} status={documentStatus(document.status)} className="text-sm font-medium">{kindLabel(document.kind)}</StatusTitle>
        <p className="text-xs text-muted-foreground">{[document.issuer, document.referenceMasked && `···${document.referenceMasked}`, document.expiresAt && `Expires ${formatWhen(document.expiresAt)}`].filter(Boolean).join(' · ') || 'No details'}</p>
      </div>
      <DocumentReviewTrack documentId={document.id} status={document.status} />
    </li>)}</ul> : <PlatformEmpty className="py-5">No documents</PlatformEmpty>}
  </div>
}

export async function DriverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const response = await keystoneClient(DRIVER_QUERY, { id, now: new Date().toISOString() })
  const driver = response.success ? response.data?.driverProfile : null
  const fleetDocuments: Document[] = driver?.documents || []
  const driverGaps = driver ? missing(fleetDocuments, DRIVER_DOCUMENTS) : []
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'link', label: 'Drivers', href: '/platform/drivers' }, { type: 'page', label: driver?.publicName || 'Driver' }]} />
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 md:p-6">
      <Link href="/dashboard/platform/drivers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden="true" />Drivers</Link>
      {!driver ? <p role="alert" className="rounded-[6px] border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Driver not found or outside your access.</p> : <>
        <PlatformHeader
          title={<StatusTitle as="span" tone={statusTone(driver.status)} status={statusLabel(driver.status)}>{driver.publicName}</StatusTitle>}
          meta={<><span className="inline-flex items-center gap-1.5"><StatusDot tone={statusTone(driver.dispatchStatus)} />{statusLabel(driver.dispatchStatus)}</span><span>{driver.fleet?.name}</span>{driver.user?.email && <span>{driver.user.email}</span>}{driver.acceptsScheduled && <span>Takes scheduled rides</span>}</>}
          actions={<>{driver.status === 'active' && <OnlineTrack driverId={driver.id} dispatchStatus={driver.dispatchStatus} />}<DriverReviewTrack driverId={driver.id} status={driver.status} /></>}
        />
        {driver.status !== 'active' && driverGaps.length > 0 && <p role="status" className="rounded-[6px] border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">To approve: accept {driverGaps.map(kindLabel).join(' and ').toLowerCase()}.</p>}

        <PlatformSection id="documents" title="Documents" meta={fleetDocuments.length || undefined} actions={<AddDocumentSheet driverId={driver.id} kinds={[...DRIVER_DOCUMENTS, 'background_check']} />}>
          <DocumentList documents={fleetDocuments} required={DRIVER_DOCUMENTS} />
        </PlatformSection>

        <PlatformSection id="vehicles" title="Vehicles" meta={driver.vehicles.length || undefined} actions={driver.fleet && <AddVehicleSheet fleetId={driver.fleet.id} driverId={driver.id} />}>
          {driver.vehicles.length ? <ul className="space-y-3">{driver.vehicles.map((vehicle: any) => <li key={vehicle.id} className="space-y-4 rounded-[6px] border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <StatusTitle as="h3" tone={statusTone(vehicle.status === 'pending_review' ? 'pending_review' : vehicle.status === 'maintenance' ? 'paused' : vehicle.status)} status={vehicle.status === 'maintenance' ? 'Maintenance' : statusLabel(vehicle.status)} className="font-semibold">{vehicle.label}</StatusTitle>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><CarFront className="size-3.5" aria-hidden="true" />{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'No make or model'}</span>{vehicle.color && <span>{vehicle.color}</span>}{vehicle.plateMasked && <span className="font-mono">{vehicle.plateMasked}</span>}<span>{vehicle.capacity} seats</span>{vehicle.wheelchairAccessible && <span>Wheelchair accessible</span>}</p>
              </div>
              <VehicleReviewTrack vehicleId={vehicle.id} status={vehicle.status} />
            </div>
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">Vehicle documents</p><AddDocumentSheet vehicleId={vehicle.id} kinds={[...VEHICLE_DOCUMENTS, 'insurance']} /></div>
            <DocumentList documents={vehicle.documents} required={VEHICLE_DOCUMENTS} />
          </li>)}</ul> : <PlatformEmpty>No vehicles</PlatformEmpty>}
        </PlatformSection>

        <PlatformSection id="hours" title="Hours">
          <AvailabilityEditor driverId={driver.id} timezone={driver.availabilityRules[0]?.timezone || driver.fleet?.timezone || 'UTC'} rules={driver.availabilityRules} />
        </PlatformSection>

        <PlatformSection id="time-off" title="Time off" meta={driver.availabilityExceptions.length || undefined} actions={<AddTimeOffSheet driverId={driver.id} />}>
          {driver.availabilityExceptions.length ? <ul className="divide-y overflow-hidden rounded-[6px] border bg-card">{driver.availabilityExceptions.map((exception: any) => <li key={exception.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"><StatusTitle as="span" tone={exception.kind === 'available' ? 'green' : 'orange'} status={exception.kind === 'available' ? 'Extra hours' : 'Off'}>{formatWhen(exception.startsAt)} – {formatWhen(exception.endsAt)}</StatusTitle><span className="flex items-center gap-2 text-xs text-muted-foreground">{exception.reason}<RemoveTimeOffTrack exceptionId={exception.id} /></span></li>)}</ul> : <PlatformEmpty className="py-5">No upcoming time off</PlatformEmpty>}
        </PlatformSection>

        <div className="grid gap-8 lg:grid-cols-2">
          <PlatformSection id="checks" title="Eligibility checks">
            {driver.policyEvaluations.length ? <ul className="divide-y overflow-hidden rounded-[6px] border bg-card">{driver.policyEvaluations.map((evaluation: any) => <li key={evaluation.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><StatusTitle as="span" tone={evaluation.outcome === 'eligible' ? 'green' : evaluation.outcome === 'ineligible' ? 'red' : 'amber'} status={statusLabel(evaluation.outcome)}>{formatWhen(evaluation.evaluatedAt)}</StatusTitle><span className="text-xs text-muted-foreground">{evaluation.expiresAt ? `Until ${formatWhen(evaluation.expiresAt)}` : 'No expiry'}</span></li>)}</ul> : <PlatformEmpty>Not reviewed yet</PlatformEmpty>}
          </PlatformSection>
          <PlatformSection id="trips" title="Recent trips">
            {driver.trips.length ? <ul className="divide-y overflow-hidden rounded-[6px] border bg-card">{driver.trips.map((trip: any) => <li key={trip.id}><Link href={`/dashboard/platform/trips?q=${encodeURIComponent(trip.confirmationCode)}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/60"><StatusTitle as="span" tone={statusTone(trip.status)} status={statusLabel(trip.status)} className="font-mono">{trip.confirmationCode}</StatusTitle><span className="flex items-center gap-1 text-xs text-muted-foreground">{formatWhen(trip.createdAt)}<ArrowUpRight className="size-3.5" aria-hidden="true" /></span></Link></li>)}</ul> : <PlatformEmpty>No trips yet</PlatformEmpty>}
          </PlatformSection>
        </div>
      </>}
    </div>
  </>
}

export default DriverDetailPage
