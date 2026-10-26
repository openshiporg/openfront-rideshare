import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { PlatformHeader, PlatformSection } from '@/features/platform/components/PlatformPage'
import { FleetBrandingSettings } from '../branding/FleetBrandingSettings'
import { FleetOperationsSettings } from '../operations/FleetOperationsSettings'

const records = [
  ['Fleets', 'fleets'], ['Ride services', 'ride-services'], ['Fare rules', 'fare-rules'], ['Policies', 'policies'], ['Provider connections', 'provider-connections'], ['Marketplace registrations', 'marketplace-registrations'],
]

export function SettingsPage() {
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'page', label: 'Platform' }, { type: 'page', label: 'Settings' }]} />
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 md:p-6">
      <PlatformHeader title="Settings" />
      <FleetOperationsSettings />
      <FleetBrandingSettings />
      <PlatformSection id="records" title="Configuration records">
        <ul className="grid overflow-hidden rounded-[6px] border bg-card sm:grid-cols-2 [&>li]:border-b sm:[&>li:nth-child(odd)]:border-r [&>li:last-child]:border-b-0 sm:[&>li:nth-last-child(2):nth-child(odd)]:border-b-0">
          {records.map(([title, path]) => <li key={path}><Link href={`/dashboard/${path}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60">{title}<ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" /></Link></li>)}
        </ul>
      </PlatformSection>
    </div>
  </>
}
export default SettingsPage
