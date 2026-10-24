import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { PlatformEmpty, PlatformHeader, PlatformSection } from '@/features/platform/components/PlatformPage'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { AddMemberSheet, MemberActions } from '../components/TeamActions'

const TEAM_QUERY = `query FleetTeam {
  authenticatedItem { ... on User { id } }
  fleets(orderBy: { name: asc }, take: 25) { id name memberships(take: 200) { id role status acceptedAt user { id name email } } }
}`

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', dispatcher: 'Dispatcher', support: 'Support', finance: 'Finance', viewer: 'Viewer' }
const ROLE_ORDER = ['owner', 'dispatcher', 'finance', 'support', 'viewer']
const initials = (name: unknown) => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') || '?'

export async function TeamPage() {
  const response = await keystoneClient(TEAM_QUERY)
  const fleets: any[] = response.success && Array.isArray(response.data?.fleets) ? response.data.fleets : []
  const me = response.success ? response.data?.authenticatedItem?.id : null
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'page', label: 'Platform' }, { type: 'page', label: 'Team' }]} />
    <div className="mx-auto w-full max-w-4xl space-y-8 p-4 md:p-6">
      <PlatformHeader title="Team" />
      {!response.success && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Team unavailable for your access.</p>}
      {response.success && !fleets.length && <PlatformEmpty>No fleets you own</PlatformEmpty>}
      {fleets.map(fleet => {
        const members = [...fleet.memberships].sort((a: any, b: any) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || String(a.user?.name).localeCompare(String(b.user?.name)))
        return <PlatformSection key={fleet.id} id={`team-${fleet.id}`} title={fleets.length > 1 ? fleet.name : 'Members'} meta={members.length} actions={<AddMemberSheet fleetId={fleet.id} />}>
          {members.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">{members.map((member: any) => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase" aria-hidden="true">{initials(member.user?.name)}</span>
              <div className="min-w-0">
                <StatusTitle as="p" tone={member.status === 'active' ? 'green' : member.status === 'suspended' ? 'red' : 'amber'} status={`${ROLE_LABEL[member.role] || member.role}${member.status !== 'active' ? ` · ${member.status}` : ''}`} className="text-sm font-medium">{member.user?.name || 'Unknown account'}{member.user?.id === me ? ' (you)' : ''}</StatusTitle>
                <p className="truncate text-xs text-muted-foreground">{member.user?.email}</p>
              </div>
            </div>
            {member.user?.id !== me && <MemberActions membershipId={member.id} role={member.role} status={member.status} />}
          </li>)}</ul> : <PlatformEmpty>No members</PlatformEmpty>}
        </PlatformSection>
      })}
    </div>
  </>
}

export default TeamPage
