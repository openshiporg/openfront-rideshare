/** Public photos and the driver rating riders see. Pure helpers plus one URL resolver over Keystone image storage. */

export const DRIVER_RATING_MIN_REVIEWS = 5

type ReviewRow = { direction?: string | null; rating?: number | null; status?: string | null }

/** Average of published rider_to_driver ratings, or null below the minimum count. Never rounds a thin sample up into a score. */
export function driverRating(reviews: ReviewRow[] | null | undefined, minimum = DRIVER_RATING_MIN_REVIEWS) {
  const ratings = (reviews || [])
    .filter(review => review?.status === 'published' && review.direction === 'rider_to_driver')
    .map(review => review.rating)
    .filter((rating): rating is number => Number.isInteger(rating) && rating! >= 1 && rating! <= 5)
  if (ratings.length < minimum) return null
  const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
  return { average: Math.round(average * 100) / 100, count: ratings.length }
}

/** Prisma select for the stored image columns of a field named `prefix`. */
export function imageSelect(prefix: string) {
  return { [`${prefix}_id`]: true, [`${prefix}_extension`]: true } as Record<string, true>
}

const EXTENSIONS = new Set(['jpg', 'png', 'webp', 'gif'])

/** Signed URL for a stored image, or null when there is none or storage is unavailable (the UI falls back to its drawing or map). */
export async function imageUrl(context: any, row: Record<string, any> | null | undefined, prefix: string): Promise<string | null> {
  const id = row?.[`${prefix}_id`]
  const extension = row?.[`${prefix}_extension`]
  if (typeof id !== 'string' || !id || !EXTENSIONS.has(extension)) return null
  try {
    return await context.images('my_images').getUrl(id, extension)
  } catch {
    return null
  }
}
