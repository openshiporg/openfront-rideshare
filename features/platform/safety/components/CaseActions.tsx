'use client'

import { TransitionTrack } from '@/features/platform/components/SetupSheet'
import { ops } from '@/features/platform/setup/setupMutations'

const NEXT_INCIDENT: Record<string, Array<[string, string]>> = { open: [['triage', 'Triage'], ['investigating', 'Investigate']], triage: [['investigating', 'Investigate'], ['resolved', 'Resolve']], investigating: [['resolved', 'Resolve']], resolved: [['closed', 'Close'], ['investigating', 'Reopen']], closed: [] }
const NEXT_CASE: Record<string, Array<[string, string]>> = { open: [['waiting', 'Waiting on rider'], ['resolved', 'Resolve']], waiting: [['open', 'Reopen'], ['resolved', 'Resolve']], resolved: [['closed', 'Close'], ['open', 'Reopen']], closed: [] }

export function IncidentActions({ incidentId, status, assigned }: { incidentId: string; status: string; assigned?: boolean }) {
  const actions = [
    ...(NEXT_INCIDENT[status] || []).map(([next, label], index) => ({ label, tone: index === 0 ? 'primary' as const : 'default' as const, run: () => ops.incident(incidentId, { status: next }) })),
    ...(!assigned && status !== 'closed' ? [{ label: 'Assign to me', tone: 'quiet' as const, run: () => ops.incident(incidentId, { assignToMe: true }) }] : []),
  ]
  return actions.length ? <TransitionTrack label="Incident" actions={actions} /> : null
}

export function SupportCaseActions({ caseId, status, assigned }: { caseId: string; status: string; assigned?: boolean }) {
  const actions = [
    ...(NEXT_CASE[status] || []).map(([next, label], index) => ({ label, tone: index === 0 ? 'primary' as const : 'default' as const, run: () => ops.supportCase(caseId, { status: next }) })),
    ...(!assigned && status !== 'closed' ? [{ label: 'Assign to me', tone: 'quiet' as const, run: () => ops.supportCase(caseId, { assignToMe: true }) }] : []),
  ]
  return actions.length ? <TransitionTrack label="Support case" actions={actions} /> : null
}
