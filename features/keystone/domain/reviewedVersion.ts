// A `DateTime!` argument reaches resolvers as a Date (Keystone's scalar parses it), while previews
// hand the client an ISO string. Compare and bind both as one canonical ISO string; otherwise a
// Date is never `===` the row's `updatedAt.toISOString()` and every reviewed command is refused.
export function reviewedIso(value: unknown): string | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function sameReviewedVersion(current: Date, reviewed: unknown): boolean {
  const iso = reviewedIso(reviewed)
  return iso !== null && current.toISOString() === iso
}
