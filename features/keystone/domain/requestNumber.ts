/** YYYYMMDD of `at` on the fleet's own calendar (UTC when the zone is missing or unknown). */
export function fleetDateStamp(at: Date, timezone?: string | null) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
    const part = (type: string) => parts.find(item => item.type === type)?.value || ''
    return `${part('year')}${part('month')}${part('day')}`
  } catch {
    return at.toISOString().slice(0, 10).replaceAll('-', '')
  }
}

/** RIDE-<fleet-local date>-<suffix>: the date a rider sees matches the day they booked. */
export function rideRequestNumber(at: Date, timezone: string | null | undefined, suffix: string) {
  return `RIDE-${fleetDateStamp(at, timezone)}-${suffix}`
}
