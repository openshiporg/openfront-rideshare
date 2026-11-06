// Pure ranking for auto-dispatch, kept apart from the database so it can be tested.

export type LngLat = [number, number]
export type Candidate = { driverId: string; vehicleId: string; km: number | null }

/** A driver's position counts for ten minutes after it was reported. */
export const LOCATION_FRESH_MS = 10 * 60_000

export function distanceKm(a: LngLat, b: LngLat) {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function freshLocation(driver: { lastLocationLng: number | null; lastLocationLat: number | null; lastLocationAt: Date | null }, now: Date): LngLat | null {
  if (driver.lastLocationLng == null || driver.lastLocationLat == null || !driver.lastLocationAt) return null
  if (now.getTime() - driver.lastLocationAt.getTime() > LOCATION_FRESH_MS) return null
  return [driver.lastLocationLng, driver.lastLocationLat]
}

/** Nearest first. Drivers without a recent position come after every located one, in a stable order. */
export function rankDrivers(candidates: Candidate[]) {
  return [...candidates].sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.driverId.localeCompare(b.driverId))
}

/** Rounds a reported position to about 100 m before it is stored. */
export function coarsePoint(lng: unknown, lat: unknown): LngLat | null {
  if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null
  return [Math.round(lng * 1000) / 1000, Math.round(lat * 1000) / 1000]
}
