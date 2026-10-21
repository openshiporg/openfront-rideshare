/**
 * Dispatch reservations use a fixed two-hour model window. This is a capacity
 * reservation, not an estimate of route duration.
 */
export const FIXED_DISPATCH_RESERVATION_WINDOW_MS = 2 * 60 * 60 * 1000

function timeOf(value: Date | string | null | undefined) {
  if (value == null) return Number.NaN
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

export function isFutureScheduledRequest(requestedFor: Date | string | null | undefined, now: Date) {
  const scheduledAt = timeOf(requestedFor)
  const nowAt = now.getTime()
  return Number.isFinite(scheduledAt) && Number.isFinite(nowAt) && scheduledAt > nowAt
}

/** Immediate requests have no scheduled lead-time requirement. Invalid scheduled
 * times or invalid service lead-time configuration fail closed. */
export function meetsAdvanceBookingWindow(
  requestedFor: Date | string | null | undefined,
  advanceBookingMinutes: number | null | undefined,
  now: Date,
) {
  if (requestedFor == null) return true
  if (!isFutureScheduledRequest(requestedFor, now)) return false

  const leadMinutes = advanceBookingMinutes ?? 0
  if (!Number.isSafeInteger(leadMinutes) || leadMinutes < 0) return false

  const earliestAllowed = now.getTime() + leadMinutes * 60 * 1000
  const scheduledAt = timeOf(requestedFor)
  return Number.isFinite(earliestAllowed) && scheduledAt >= earliestAllowed
}

/**
 * Check two half-open fixed reservation windows. Unknown/invalid existing
 * reservation times fail closed so callers cannot treat them as free capacity.
 */
export function overlapsFixedDispatchWindow(
  proposedStart: Date | string,
  existingStart: Date | string | null | undefined,
  windowMs = FIXED_DISPATCH_RESERVATION_WINDOW_MS,
) {
  const proposedAt = timeOf(proposedStart)
  const existingAt = timeOf(existingStart)
  if (!Number.isFinite(proposedAt) || !Number.isFinite(existingAt) || !Number.isFinite(windowMs) || windowMs <= 0) return true

  const proposedEnd = proposedAt + windowMs
  const existingEnd = existingAt + windowMs
  if (!Number.isFinite(proposedEnd) || !Number.isFinite(existingEnd)) return true
  return proposedAt < existingEnd && existingAt < proposedEnd
}
