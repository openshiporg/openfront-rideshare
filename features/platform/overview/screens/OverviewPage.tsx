import Link from 'next/link'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, CarFront, RadioTower, ShieldAlert, Users } from 'lucide-react'

export async function OverviewPage() {
  const capabilityResponse = await keystoneClient<{ rideshareCapabilities: Record<string, boolean> }>(`query OverviewCapabilities { rideshareCapabilities }`)
  const capabilities = capabilityResponse.success ? capabilityResponse.data?.rideshareCapabilities : null
  const specifications = [
    { title: 'Waiting requests', capability: 'operations', field: 'rideRequestsCount', where: 'status:{in:["requested","matching"]}', href: '/dashboard/platform/dispatch', Icon: RadioTower },
    { title: 'Active trips', capability: 'operations', field: 'tripsCount', where: 'status:{in:["driver_assigned","driver_en_route","driver_arrived","in_progress"]}', href: '/dashboard/platform/trips', Icon: CarFront },
    { title: 'Active drivers', capability: 'drivers', field: 'driverProfilesCount', where: 'status:{equals:"active"}', href: '/dashboard/platform/drivers', Icon: Users },
    { title: 'Open incidents', capability: 'safety', field: 'safetyIncidentsCount', where: 'status:{in:["open","triage","investigating"]}', href: '/dashboard/platform/safety', Icon: ShieldAlert },
  ]
  const cards = await Promise.all(specifications.filter(card => capabilities?.[card.capability] === true).map(async card => {
    const response = await keystoneClient(`query OverviewCount { ${card.field}(where:{${card.where}}) }`)
    const count = response.success ? response.data?.[card.field] : undefined
    return { ...card, count: Number.isSafeInteger(count) && count >= 0 ? count : null }
  }))
  return <PageContainer title="Operations" header={<div><h1 className="text-2xl font-semibold tracking-tight">Rideshare operations</h1><p className="text-sm text-muted-foreground">Manage your fleet’s current work.</p></div>} breadcrumbs={[{ type: 'page', label: 'Dashboard' }]}>
    <div className="space-y-4 p-4 md:p-6">
      {!capabilities && <div role="alert" className="rounded-[6px] border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">Operations counts are unavailable; zero is not being reported as a valid result.</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ title, count, href, Icon }) => <Link href={href} key={title}><Card className="h-full hover:bg-muted/40"><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle><Icon className="size-4" /></CardHeader><CardContent><p className="text-4xl font-semibold">{count ?? '—'}</p>{count === null && <p role="status" className="text-xs text-muted-foreground">Count unavailable</p>}<span className="mt-4 flex items-center text-xs text-muted-foreground">Open workflow <ArrowRight className="ml-1 size-3" /></span></CardContent></Card></Link>)}</div>
      <nav className="flex flex-wrap gap-4 text-sm">{capabilities?.finance && <Link className="underline" href="/dashboard/platform/finance">Finance</Link>}{capabilities?.fleetAdmin && <Link className="underline" href="/dashboard/platform/settings">Fleet settings</Link>}<Link className="underline" href="/dashboard/platform/my-driving">My driving</Link></nav>
      {capabilities && !cards.length && <p className="text-sm text-muted-foreground">No operations queues are available to this account.</p>}
    </div>
  </PageContainer>
}
export default OverviewPage
