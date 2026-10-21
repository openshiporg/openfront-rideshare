export function isOfferLeaseActive(expiresAt: Date | string | null | undefined, now: Date) {
  if (expiresAt == null || !Number.isFinite(now.getTime())) return false
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime()
  return Number.isFinite(expiry) && expiry > now.getTime()
}
