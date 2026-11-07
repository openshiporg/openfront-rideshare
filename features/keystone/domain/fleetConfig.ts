/** Settings the rest of the app reads without checking: the fleet's time zone (receipts, confirmations),
 * currency (fares, payments) and location retention (trip location writes). Only keys present are checked. */
export function fleetConfigProblems(data: Record<string, unknown>): string[] {
  const problems: string[] = []
  if (data.timezone !== undefined) {
    const zone = String(data.timezone ?? '')
    let valid = Boolean(zone)
    try { if (valid) new Intl.DateTimeFormat('en-US', { timeZone: zone }) } catch { valid = false }
    if (!valid) problems.push('Time zone must be a real IANA zone, such as America/New_York.')
  }
  if (data.currencyCode !== undefined && !/^[A-Z]{3}$/.test(String(data.currencyCode ?? ''))) problems.push('Currency must be a three-letter code in capitals, such as USD.')
  if (data.countryCode !== undefined && !/^[A-Z]{2}$/.test(String(data.countryCode ?? ''))) problems.push('Country must be a two-letter code in capitals, such as US.')
  if (data.preciseLocationRetentionDays !== undefined) {
    const raw = String(data.preciseLocationRetentionDays ?? '')
    const days = Number(raw)
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(days) || days < 1 || days > 3650) problems.push('Location retention must be a whole number of days from 1 to 3650.')
  }
  return problems
}
