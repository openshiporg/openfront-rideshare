type Rule = {
  dayOfWeek?: number | null
  startTime?: string | null
  endTime?: string | null
  timezone?: string | null
  status?: string | null
  effectiveFrom?: string | Date | null
  effectiveUntil?: string | Date | null
}
type Exception = { startsAt: string | Date; endsAt: string | Date; kind: string }

function localParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(value.weekday)
  return day < 0 ? null : { day, minutes: Number(value.hour) * 60 + Number(value.minute) }
}

function parseTime(value?: string | null) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '')
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour < 24 && minute < 60 ? hour * 60 + minute : null
}

export function isDriverAvailableAt(rules: Rule[], exceptions: Exception[], at: Date) {
  if (!Number.isFinite(at.getTime())) return false
  const covering = exceptions.filter(item => {
    const start = new Date(item.startsAt).getTime()
    const end = new Date(item.endsAt).getTime()
    return Number.isFinite(start) && Number.isFinite(end) && start <= at.getTime() && end > at.getTime()
  })
  if (covering.some(item => item.kind === 'blocked')) return false
  if (covering.some(item => item.kind === 'available')) return true

  return rules.some(rule => {
    if (rule.status !== 'active') return false
    const effectiveFrom = rule.effectiveFrom ? new Date(rule.effectiveFrom).getTime() : Number.NEGATIVE_INFINITY
    const effectiveUntil = rule.effectiveUntil ? new Date(rule.effectiveUntil).getTime() : Number.POSITIVE_INFINITY
    if ((rule.effectiveFrom && !Number.isFinite(effectiveFrom)) || (rule.effectiveUntil && !Number.isFinite(effectiveUntil)) || at.getTime() < effectiveFrom || at.getTime() >= effectiveUntil) return false
    const timezone = rule.timezone || 'UTC'
    let local: ReturnType<typeof localParts>
    try { local = localParts(at, timezone) } catch { return false }
    if (!local) return false
    const start = parseTime(rule.startTime)
    const end = parseTime(rule.endTime)
    if (rule.dayOfWeek === null || rule.dayOfWeek === undefined || start === null || end === null || start === end) return false
    if (start < end) return rule.dayOfWeek === local.day && local.minutes >= start && local.minutes < end
    const previousDay = (local.day + 6) % 7
    return (rule.dayOfWeek === local.day && local.minutes >= start) || (rule.dayOfWeek === previousDay && local.minutes < end)
  })
}
