/**
 * One vehicle illustration per ride category, from one free set (Iconoven, MIT; see
 * public/vehicles/LICENSE.txt). Every ride type uses the same side view, grid and stroke, both on the
 * rider's ride tiles and on the admin Services page, so uploaded photos never sit beside drawings.
 */
const BY_CATEGORY: Record<string, string> = {
  standard: 'hatchback',
  comfort: 'sedan',
  xl: 'suv-car',
  accessible: 'minivan',
  pet_friendly: 'jeep',
  scheduled: 'car-side',
}

export function vehicleArt(category: string | null | undefined, options: { seats?: number; wheelchair?: boolean } = {}): string {
  if (options.wheelchair) return '/vehicles/minivan.svg'
  const file = BY_CATEGORY[category || ''] || ((options.seats || 0) > 4 ? 'suv-car' : 'hatchback')
  return `/vehicles/${file}.svg`
}
