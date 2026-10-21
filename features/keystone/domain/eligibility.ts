export type EligibilityKind = 'driver_eligibility' | 'vehicle_eligibility'
export type EligibilityEvidence = {
  outcome?: string | null; expiresAt?: Date | string | null
  policy?: { id?: string; status?: string | null; kind?: string | null; fleetId?: string | null; fleet?: { id: string } | null; version?: string | null } | null
}

export function isCurrentEligibility(evaluation: EligibilityEvidence | undefined | null, kind: EligibilityKind, fleetId: string, now: Date) {
  if (!evaluation || evaluation.outcome !== 'eligible' || evaluation.policy?.status !== 'active' || evaluation.policy.kind !== kind || (evaluation.policy.fleetId ?? evaluation.policy.fleet?.id) !== fleetId) return false
  if (!Number.isFinite(now.getTime())) return false
  return !evaluation.expiresAt || new Date(evaluation.expiresAt).getTime() > now.getTime()
}

/** Until an explicit combination policy exists, multiple active admission
 * policies are ambiguous and remain closed. Never pick the latest PASSED row. */
export async function loadCurrentEligibility(db: any, subject: 'driver' | 'vehicle', subjectId: string, fleetId: string, now: Date) {
  const kind: EligibilityKind = `${subject}_eligibility`
  const policies = await db.policy.findMany({ where: { fleetId, kind, status: 'active' }, orderBy: { id: 'asc' }, take: 2, select: { id: true, version: true } })
  if (policies.length !== 1) return false
  const evaluation = await db.policyEvaluation.findFirst({
    where: { policyId: policies[0].id, [`${subject}Id`]: subjectId, [subject === 'driver' ? 'vehicleId' : 'driverId']: null },
    orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }], include: { policy: true },
  })
  const recordedVersion = evaluation?.evidenceSnapshot && !Array.isArray(evaluation.evidenceSnapshot) ? evaluation.evidenceSnapshot.policyVersion : null
  return recordedVersion === policies[0].version && isCurrentEligibility(evaluation, kind, fleetId, now) ? evaluation : null
}
