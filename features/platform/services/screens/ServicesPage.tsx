import { Accessibility, Clock, MapPin, Users } from 'lucide-react'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { PlatformEmpty, PlatformHeader, PlatformSection } from '@/features/platform/components/PlatformPage'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { formatMoney } from '@/features/lib/currency'
import { AddAreaSheet, AddFareSheet, AddServiceSheet, AreaStatusTrack, ServiceStatusTrack } from '../components/ServiceSetupActions'

const SERVICES_QUERY = `query FleetServices {
  fleets(orderBy: { name: asc }, take: 25) {
    id name currencyCode
    serviceAreas(orderBy: [{ name: asc }], take: 50) { id name publicRegionLabel status }
    services(orderBy: [{ name: asc }], take: 50) {
      id name description category status passengerCapacity wheelchairAccessible advanceBookingMinutes
      serviceAreas(take: 50) { id name }
      fareRules(orderBy: [{ version: desc }], take: 10) { id name version status currencyCode distanceUnit baseFareMinor perDistanceUnitMinor perMinuteMinor minimumFareMinor bookingFeeMinor cancellationFeeMinor noShowFeeMinor serviceArea { id name } }
    }
  }
}`

const tone = (status: string) => status === 'active' ? 'green' : status === 'paused' ? 'orange' : status === 'retired' ? 'zinc' : 'amber'
const label = (status: string) => status === 'active' ? 'Active' : status === 'paused' ? 'Paused' : status === 'retired' ? 'Retired' : 'Draft'

export async function ServicesPage() {
  const response = await keystoneClient(SERVICES_QUERY)
  const fleets: any[] = response.success && Array.isArray(response.data?.fleets) ? response.data.fleets : []
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'page', label: 'Platform' }, { type: 'page', label: 'Services & fares' }]} />
    <div className="mx-auto w-full max-w-5xl space-y-10 p-4 md:p-6">
      <PlatformHeader title="Services & fares" meta={response.success ? <span className="tabular-nums">{fleets.reduce((sum, fleet) => sum + fleet.services.length, 0)} services</span> : null} />
      {!response.success && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Services unavailable for your access.</p>}
      {response.success && !fleets.length && <PlatformEmpty>No fleets yet. Create one in Settings → Operations.</PlatformEmpty>}
      {fleets.map(fleet => {
        const areas = fleet.serviceAreas
        const activeAreas = areas.filter((area: any) => area.status === 'active')
        return <section key={fleet.id} aria-labelledby={`fleet-${fleet.id}`} className="space-y-8">
          {fleets.length > 1 && <h2 id={`fleet-${fleet.id}`} className="text-lg font-semibold tracking-tight">{fleet.name}</h2>}
          <PlatformSection id={`areas-${fleet.id}`} title="Service areas" meta={areas.length || undefined} actions={<AddAreaSheet fleetId={fleet.id} />}>
            {areas.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">{areas.map((area: any) => <li key={area.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0"><StatusTitle as="p" tone={tone(area.status)} status={label(area.status)} className="text-sm font-medium">{area.name}</StatusTitle><p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" aria-hidden="true" />{area.publicRegionLabel}</p></div>
              <AreaStatusTrack id={area.id} status={area.status} />
            </li>)}</ul> : <PlatformEmpty>Add the area you drive in first</PlatformEmpty>}
          </PlatformSection>

          <PlatformSection id={`services-${fleet.id}`} title="Ride services" meta={fleet.services.length || undefined} actions={activeAreas.length ? <AddServiceSheet fleetId={fleet.id} areas={areas} /> : undefined}>
            {fleet.services.length ? <ul className="space-y-3">{fleet.services.map((service: any) => {
              const activeFares = service.fareRules.filter((fare: any) => fare.status === 'active')
              const bookable = service.status === 'active' && activeFares.length > 0 && service.serviceAreas.some((area: any) => activeAreas.some((item: any) => item.id === area.id))
              return <li key={service.id} className="space-y-4 rounded-xl border bg-card p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <StatusTitle as="h3" tone={bookable ? 'green' : tone(service.status === 'active' ? 'draft' : service.status)} status={bookable ? 'Bookable' : service.status !== 'active' ? label(service.status) : !activeFares.length ? 'Needs a fare' : 'Needs an active area'} className="font-semibold">{service.name}</StatusTitle>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="capitalize">{service.category.replaceAll('_', ' ')}</span>
                      <span className="inline-flex items-center gap-1"><Users className="size-3" aria-hidden="true" />{service.passengerCapacity}</span>
                      {service.wheelchairAccessible && <span className="inline-flex items-center gap-1"><Accessibility className="size-3" aria-hidden="true" />Accessible</span>}
                      {service.advanceBookingMinutes > 0 && <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden="true" />Book {service.advanceBookingMinutes} min ahead</span>}
                      <span>{service.serviceAreas.map((area: any) => area.name).join(', ') || 'No area'}</span>
                    </p>
                  </div>
                  <ServiceStatusTrack id={service.id} status={service.status} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">Fares</p>{service.serviceAreas.length > 0 && <AddFareSheet serviceId={service.id} serviceName={service.name} currency={fleet.currencyCode || 'USD'} areas={service.serviceAreas} />}</div>
                  {service.fareRules.length ? <ul className="divide-y overflow-hidden rounded-lg border">{service.fareRules.map((fare: any) => <li key={fare.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <StatusTitle as="span" tone={tone(fare.status)} status={`v${fare.version} · ${label(fare.status)}`}>{fare.serviceArea?.name || fare.name}</StatusTitle>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(fare.baseFareMinor, fare.currencyCode)} + {formatMoney(fare.perDistanceUnitMinor, fare.currencyCode)}/{fare.distanceUnit === 'kilometer' ? 'km' : 'mi'} + {formatMoney(fare.perMinuteMinor, fare.currencyCode)}/min · min {formatMoney(fare.minimumFareMinor, fare.currencyCode)}</span>
                  </li>)}</ul> : <PlatformEmpty className="py-5">No fares yet</PlatformEmpty>}
                </div>
              </li>
            })}</ul> : <PlatformEmpty>{activeAreas.length ? 'No ride services yet' : 'Activate a service area to add services'}</PlatformEmpty>}
          </PlatformSection>
        </section>
      })}
    </div>
  </>
}

export default ServicesPage
