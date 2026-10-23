'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Check } from 'lucide-react'
import { PillButton, PillTrack } from '@/features/platform/components/PillTabs'
import { PlatformEmpty, PlatformSection } from '@/features/platform/components/PlatformPage'
import { StatusTitle } from '@/features/platform/components/StatusTitle'

type FleetRow = { id: string; name: string; status: string; operationsMode: string; servicesCount: number; serviceAreasCount: number; fareRulesCount: number; driversCount: number }

const FLEETS = `query FleetOperations { fleets(orderBy: { name: asc }, take: 25) { id name status operationsMode
  servicesCount(where: { status: { equals: "active" } }) serviceAreasCount(where: { status: { equals: "active" } })
  fareRulesCount(where: { status: { equals: "active" } }) driversCount(where: { status: { equals: "active" } }) } }`
const UPDATE = `mutation UpdateFleetOperations($id: ID!, $data: FleetUpdateInput!) { updateFleet(where: { id: $id }, data: $data) { id status operationsMode } }`

async function graphql(query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch('/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ query, variables }) })
  const payload = await response.json()
  if (!response.ok || payload.errors?.length || !payload.data) throw new Error('Request failed.')
  return payload.data
}

/** Per-fleet go-live controls: fleet status and manual dispatch, with what the storefront still needs. */
export function FleetOperationsSettings() {
  const [fleets, setFleets] = useState<FleetRow[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const flight = useRef(false)
  async function load() {
    try { const data = await graphql(FLEETS); setFleets(Array.isArray(data.fleets) ? data.fleets : []); setError('') }
    catch { setFleets([]); setError('Fleets unavailable for your access.') }
  }
  useEffect(() => { void load() }, [])
  async function update(fleet: FleetRow, data: Partial<Pick<FleetRow, 'status' | 'operationsMode'>>) {
    if (flight.current) return
    flight.current = true; setBusy(fleet.id); setError('')
    try {
      const row = (await graphql(UPDATE, { id: fleet.id, data })).updateFleet
      if (row?.id !== fleet.id) throw new Error('Update unconfirmed.')
      setFleets(current => current?.map(item => item.id === fleet.id ? { ...item, status: row.status, operationsMode: row.operationsMode } : item) ?? null)
    } catch { setError(`${fleet.name} could not be updated. Reload and try again.`) }
    finally { flight.current = false; setBusy('') }
  }
  return <PlatformSection id="operations" title="Operations" meta={fleets?.length || undefined}>
    {fleets === null ? <div className="h-28 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-label="Loading fleets" />
      : !fleets.length && !error ? <PlatformEmpty>No fleets yet. Run setup from the dashboard home to create one.</PlatformEmpty>
      : <ul className="space-y-3">{fleets.map(fleet => {
        const live = fleet.status === 'active' && fleet.operationsMode === 'manual'
        const checks = [
          { label: 'Active service', done: fleet.servicesCount > 0, href: '/dashboard/ride-services' },
          { label: 'Active service area', done: fleet.serviceAreasCount > 0, href: '/dashboard/service-areas' },
          { label: 'Active fare rule', done: fleet.fareRulesCount > 0, href: '/dashboard/fare-rules' },
          { label: 'Active driver', done: fleet.driversCount > 0, href: '/dashboard/driver-profiles' },
        ]
        return <li key={fleet.id} className="space-y-4 rounded-xl border bg-card p-4 md:p-5" data-command-pending={busy === fleet.id ? 'true' : undefined}>
          <StatusTitle as="h3" tone={live ? 'green' : 'amber'} pulse={live} status={live ? 'Taking rides' : fleet.status !== 'active' ? 'Fleet not active' : 'Manual dispatch off'} className="font-semibold">{fleet.name}</StatusTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Fleet status</p>
              <PillTrack label={`${fleet.name} status`}>{(['setup', 'active', 'paused'] as const).map(value => <PillButton key={value} active={fleet.status === value} disabled={Boolean(busy)} onClick={() => { if (fleet.status !== value) void update(fleet, { status: value }) }}>{value === 'setup' ? 'Setup' : value === 'active' ? 'Active' : 'Paused'}</PillButton>)}</PillTrack>
            </div>
            <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Dispatch</p>
              <PillTrack label={`${fleet.name} dispatch`}>{(['off', 'manual'] as const).map(value => <PillButton key={value} active={fleet.operationsMode === value} disabled={Boolean(busy)} onClick={() => { if (fleet.operationsMode !== value) void update(fleet, { operationsMode: value }) }}>{value === 'off' ? 'Off' : 'Manual dispatch'}</PillButton>)}</PillTrack>
            </div>
          </div>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label="Storefront requirements">{checks.map(check => <li key={check.label}><Link href={check.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"><span className={`grid size-5 shrink-0 place-items-center rounded-full ${check.done ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{check.done ? <Check className="size-3.5" aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-current" />}</span><span className={check.done ? '' : 'text-muted-foreground'}>{check.label}</span><span className="sr-only">{check.done ? 'done' : 'missing'}</span><ArrowUpRight className="ml-auto size-3.5 text-muted-foreground" aria-hidden="true" /></Link></li>)}</ul>
        </li>
      })}</ul>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </PlatformSection>
}
