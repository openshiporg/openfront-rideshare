export type OnboardingBootstrapResult = {
  fleetId: string
  created: boolean
  summary: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Accept only a successful HTTP response with the complete expected GraphQL result shape. */
export function requireOnboardingBootstrapResult(
  httpOk: boolean,
  httpStatus: number,
  payload: unknown,
): OnboardingBootstrapResult {
  if (!httpOk) throw new Error(`Demo setup could not be confirmed (HTTP ${httpStatus}).`)

  const response = asRecord(payload)
  if (!response) throw new Error('Demo setup returned an invalid response; success was not confirmed.')
  if (response.errors !== undefined && response.errors !== null) {
    if (!Array.isArray(response.errors)) throw new Error('Demo setup returned malformed GraphQL errors; success was not confirmed.')
    if (response.errors.length > 0) {
      throw new Error('Setup outcome is unconfirmed. Reconcile the original setup before starting another.')
    }
  }

  const data = asRecord(response.data)
  const result = asRecord(data?.bootstrapRideshare)
  const summary = asRecord(result?.summary)
  if (typeof result?.fleetId !== 'string' || !result.fleetId.trim()
    || typeof result.created !== 'boolean' || !summary) {
    throw new Error('Demo setup returned an incomplete result; success was not confirmed.')
  }

  const setupComplete = summary.setupComplete
  const onboardingStatus = summary.onboardingStatus
  const missing = summary.missing
  if (typeof setupComplete !== 'boolean'
    || onboardingStatus !== (setupComplete ? 'completed' : 'in_progress')
    || !Array.isArray(missing)
    || missing.some(item => typeof item !== 'string')
    || setupComplete !== (missing.length === 0)) {
    throw new Error('Setup result is incomplete or inconsistent; completion was not confirmed.')
  }

  return { fleetId: result.fleetId, created: result.created, summary }
}
