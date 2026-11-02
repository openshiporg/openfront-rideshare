/**
 * Public "popular places" for a fleet's rider home: destinations and pickups
 * that several different signed-in riders asked for. A place only one or two
 * riders used could be someone's home, so it never leaves the server, and
 * house-number street addresses are never shown publicly at all.
 */
export const POPULAR_PLACE_MIN_RIDERS = 3
export const POPULAR_PLACE_WINDOW_DAYS = 90

type RequestRow = { riderId: string | null; pickupLabel: string | null; dropoffLabel: string | null }

const tidy = (label: string) => label.trim().replace(/\s+/g, ' ')
const looksLikeStreetAddress = (label: string) => /^\d+[a-z]?\b/i.test(label) || /\b(apt|apartment|unit|suite|ste|#)\s*\w+/i.test(label)

export function popularPlaces(rows: RequestRow[], options: { exclude?: string[]; limit?: number; minRiders?: number } = {}): string[] {
  const minRiders = options.minRiders ?? POPULAR_PLACE_MIN_RIDERS
  const limit = options.limit ?? 3
  const excluded = new Set((options.exclude || []).map(label => tidy(label).toLowerCase()))
  const places = new Map<string, { label: string; riders: Set<string>; uses: number }>()
  for (const row of rows) {
    if (!row.riderId) continue
    for (const raw of [row.dropoffLabel, row.pickupLabel]) {
      const label = tidy(raw || '')
      if (label.length < 2 || label.length > 120 || looksLikeStreetAddress(label)) continue
      const key = label.toLowerCase()
      if (excluded.has(key)) continue
      const place = places.get(key) || { label, riders: new Set<string>(), uses: 0 }
      place.riders.add(row.riderId); place.uses++
      places.set(key, place)
    }
  }
  return [...places.values()]
    .filter(place => place.riders.size >= minRiders)
    .sort((a, b) => b.riders.size - a.riders.size || b.uses - a.uses || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(place => place.label)
}
