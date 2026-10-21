export type PublishedReviewProjection = {
  direction: string | null
  rating: number | null
  body: string | null
  status: 'published'
  submittedAt: Date | string | null
}

type ReviewRow = {
  direction?: string | null
  rating?: number | null
  body?: string | null
  status?: string | null
  submittedAt?: Date | string | null
}

/** Public trip views include only explicitly published, bounded review fields. */
export function projectPublishedReviews(reviews: ReviewRow[] | null | undefined): PublishedReviewProjection[] {
  return (reviews || []).filter(review => review?.status === 'published').map(review => ({
    direction: review.direction ?? null,
    rating: review.rating ?? null,
    body: review.body ?? null,
    status: 'published',
    submittedAt: review.submittedAt ?? null,
  }))
}
