import Link from 'next/link'
import { CarFront, Users } from 'lucide-react'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { PillLink, PillTrack } from '@/features/platform/components/PillTabs'
import { PlatformEmpty, PlatformHeader } from '@/features/platform/components/PlatformPage'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { AddDocumentSheet, DocumentReviewTrack, VehicleReviewTrack } from '@/features/platform/drivers/components/DriverSetupActions'
import { AddFleetVehicleSheet } from '../components/VehicleActions'

const STATUSES = [{ key: 'all', label: 'All' }, { key: 'pending_review', label: 'In review' }, { key: 'active', label: 'Active' }, { key: 'maintenance', label: 'Maintenance' }, { key: 'suspended', label: 'Suspended' }, { key: 'retired', label: 'Retired' }]
const REQUIRED = ['vehicle_registration', 'inspection']
const TONE: Record<string, 'amber' | 'green' | 'orange' | 'red' | 'zinc'> = { pending_review: 'amber', active: 'green', maintenance: 'orange', suspended: 'red', retired: 'zinc' }

const VEHICLES_QUERY = `query FleetVehicles($where: VehicleWhereInput!) {
  vehicles(where: $where, orderBy: [{ label: asc }], take: 100) {
    id label make model year color plateMasked capacity wheelchairAccessible status fleet { id name }
    drivers(take: 10) { id publicName status }
    documents(take: 25) { id kind status expiresAt }
  }
  fleets(orderBy: { name: asc }, take: 25) { id name }
  driverProfiles(where: { status: { notIn: ["offboarded", "ineligible"] } }, orderBy: [{ publicName: asc }], take: 200) { id publicName fleet { id } }
}`

export async function VehiclesPage({ searchParams }: { searchParams?: Promise<{ status?: string | string[] }> } = {}) {
  const params = searchParams ? await searchParams : {}
  const status = typeof params.status === 'string' && STATUSES.some(item => item.key === params.status) ? params.status : 'all'
  const response = await keystoneClient(VEHICLES_QUERY, { where: status === 'all' ? {} : { status: { equals: status } } })
  const vehicles: any[] = response.success && Array.isArray(response.data?.vehicles) ? response.data.vehicles : []
  const fleets = response.success && Array.isArray(response.data?.fleets) ? response.data.fleets : []
  const drivers = response.success && Array.isArray(response.data?.driverProfiles) ? response.data.driverProfiles.map((driver: any) => ({ id: driver.id, publicName: driver.publicName, fleetId: driver.fleet?.id })) : []
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'page', label: 'Platform' }, { type: 'page', label: 'Vehicles' }]} />
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <PlatformHeader title="Vehicles" meta={response.success ? <span className="tabular-nums">{vehicles.length}{vehicles.length === 100 ? '+' : ''} {vehicles.length === 1 ? 'vehicle' : 'vehicles'}</span> : null} actions={<AddFleetVehicleSheet fleets={fleets} drivers={drivers} />} />
      <PillTrack label="Vehicle status">{STATUSES.map(item => <PillLink key={item.key} href={`?status=${item.key}`} active={status === item.key}>{item.label}</PillLink>)}</PillTrack>
      {!response.success ? <p role="alert" className="rounded-[6px] border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Vehicles unavailable for your access.</p>
        : vehicles.length ? <ul className="divide-y overflow-hidden rounded-[6px] border bg-card">{vehicles.map(vehicle => {
          const missing = REQUIRED.filter(kind => !vehicle.documents.some((document: any) => document.kind === kind && document.status === 'accepted_evidence' && (!document.expiresAt || Date.parse(document.expiresAt) > Date.now())))
          return <li key={vehicle.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5">
            <div className="min-w-0 space-y-1">
              <StatusTitle tone={TONE[vehicle.status] || 'zinc'} status={STATUSES.find(item => item.key === vehicle.status)?.label || vehicle.status} className="font-semibold">{vehicle.label}</StatusTitle>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><CarFront className="size-3.5" aria-hidden="true" />{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'No make or model'}</span>
                {vehicle.plateMasked && <span className="font-mono">{vehicle.plateMasked}</span>}
                <span>{vehicle.capacity} seats</span>
                {vehicle.wheelchairAccessible && <span>Wheelchair accessible</span>}
                {fleets.length > 1 && <span>{vehicle.fleet?.name}</span>}
                <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden="true" />{vehicle.drivers.length ? vehicle.drivers.map((driver: any, index: number) => <span key={driver.id}>{index > 0 && ', '}<Link href={`/dashboard/platform/drivers/${driver.id}`} className="hover:underline">{driver.publicName}</Link></span>) : 'No driver'}</span>
              </p>
              {missing.length > 0 && <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Needs {missing.map(kind => kind.replaceAll('_', ' ')).join(' and ')}</p>}
              {vehicle.documents.filter((document: any) => ['submitted', 'under_review'].includes(document.status)).map((document: any) => <div key={document.id} className="flex flex-wrap items-center gap-2 pt-1 text-xs"><span className="font-medium capitalize">{document.kind.replaceAll('_', ' ')} submitted</span><DocumentReviewTrack documentId={document.id} status={document.status} /></div>)}
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">{missing.length > 0 && <AddDocumentSheet vehicleId={vehicle.id} kinds={REQUIRED} />}<VehicleReviewTrack vehicleId={vehicle.id} status={vehicle.status} /></div>
          </li>
        })}</ul> : <PlatformEmpty>{status === 'all' ? 'No vehicles yet' : 'No vehicles with this status'}</PlatformEmpty>}
    </div>
  </>
}

export default VehiclesPage
