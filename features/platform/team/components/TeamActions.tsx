'use client'

import { useRouter } from 'next/navigation'
import { SetupSheet, TransitionTrack } from '@/features/platform/components/SetupSheet'
import { ops } from '@/features/platform/setup/setupMutations'

export const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' }, { value: 'dispatcher', label: 'Dispatcher' }, { value: 'support', label: 'Support' }, { value: 'finance', label: 'Finance' }, { value: 'viewer', label: 'Viewer' },
]

export function AddMemberSheet({ fleetId }: { fleetId: string }) {
  return <SetupSheet trigger="Add member" title="Add team member" submitLabel="Add member" onSubmit={values => ops.addMember({ ...values, fleetId })} fields={[
    { name: 'email', label: 'Account email', type: 'email', required: true },
    { name: 'role', label: 'Role', type: 'select', required: true, defaultValue: 'dispatcher', options: ROLE_OPTIONS },
  ]} />
}

export function MemberActions({ membershipId, role, status }: { membershipId: string; role: string; status: string }) {
  const router = useRouter()
  return <div className="flex flex-wrap items-center gap-2">
    <label className="sr-only" htmlFor={`role-${membershipId}`}>Role</label>
    <select id={`role-${membershipId}`} defaultValue={role} onChange={async event => { try { await ops.updateMember(membershipId, { role: event.target.value }); router.refresh() } catch (reason) { window.alert(reason instanceof Error ? reason.message : 'Role did not save.'); event.target.value = role } }} className="h-8 rounded-[4px] border bg-background px-3 text-sm">
      {ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    <TransitionTrack label="Member status" actions={status === 'active'
      ? [{ label: 'Suspend', tone: 'quiet', run: () => ops.updateMember(membershipId, { status: 'suspended' }), confirm: 'Suspend this member? They lose access to the fleet.' }]
      : [{ label: 'Reactivate', tone: 'primary', run: () => ops.updateMember(membershipId, { status: 'active' }) }]} />
  </div>
}
