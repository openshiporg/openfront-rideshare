import Link from 'next/link'
import { Star } from 'lucide-react'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { PillLink, PillTrack } from '@/features/platform/components/PillTabs'
import { PlatformEmpty, PlatformHeader } from '@/features/platform/components/PlatformPage'
import { StatusTitle } from '@/features/platform/components/StatusTitle'
import { formatWhen } from '@/features/platform/lib/statusTone'
import { ReviewModeration } from '../components/ReviewActions'

const STATUSES = [{ key: 'pending', label: 'To review' }, { key: 'published', label: 'Published' }, { key: 'hidden', label: 'Hidden' }, { key: 'removed', label: 'Removed' }, { key: 'all', label: 'All' }]
const TONE: Record<string, 'amber' | 'green' | 'zinc' | 'red'> = { pending: 'amber', published: 'green', hidden: 'zinc', removed: 'red' }

const REVIEWS_QUERY = `query FleetReviews($where: ReviewWhereInput!) {
  reviews(where: $where, orderBy: [{ submittedAt: desc }], take: 100) { id rating body status direction submittedAt trip { id confirmationCode driver { id publicName } } }
  reviewsCount(where: { status: { equals: "published" } })
}`

export async function ReviewsPage({ searchParams }: { searchParams?: Promise<{ status?: string | string[] }> } = {}) {
  const params = searchParams ? await searchParams : {}
  const status = typeof params.status === 'string' && STATUSES.some(item => item.key === params.status) ? params.status : 'pending'
  const response = await keystoneClient(REVIEWS_QUERY, { where: status === 'all' ? {} : { status: { equals: status } } })
  const reviews: any[] = response.success && Array.isArray(response.data?.reviews) ? response.data.reviews : []
  const rated = reviews.filter(review => typeof review.rating === 'number')
  const average = rated.length ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length : null
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'page', label: 'Platform' }, { type: 'page', label: 'Reviews' }]} />
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-6">
      <PlatformHeader title="Reviews" meta={response.success ? <><span className="tabular-nums">{response.data?.reviewsCount ?? 0} published</span>{average !== null && <span className="inline-flex items-center gap-1 tabular-nums"><Star className="size-3.5 fill-current" aria-hidden="true" />{average.toFixed(1)} in this view</span>}</> : null} />
      <PillTrack label="Review status">{STATUSES.map(item => <PillLink key={item.key} href={`?status=${item.key}`} active={status === item.key}>{item.label}</PillLink>)}</PillTrack>
      {!response.success ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Reviews unavailable for your access.</p>
        : reviews.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">{reviews.map(review => <li key={review.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:px-5">
          <div className="min-w-0 space-y-1.5">
            <StatusTitle tone={TONE[review.status] || 'zinc'} status={STATUSES.find(item => item.key === review.status)?.label || review.status} className="text-sm font-semibold">
              {typeof review.rating === 'number' ? <span className="inline-flex gap-0.5" aria-label={`${review.rating} out of 5`}>{[1, 2, 3, 4, 5].map(star => <Star key={star} aria-hidden="true" className={`size-4 ${star <= review.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />)}</span> : 'No rating'}
            </StatusTitle>
            {review.body && <p className="whitespace-pre-wrap text-sm">{review.body}</p>}
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>{review.direction === 'driver_to_rider' ? 'Driver about rider' : 'Rider about driver'}</span>
              {review.trip?.driver && <Link href={`/dashboard/platform/drivers/${review.trip.driver.id}`} className="hover:underline">{review.trip.driver.publicName}</Link>}
              {review.trip && <Link href={`/dashboard/platform/trips/${review.trip.id}`} className="font-mono hover:underline">{review.trip.confirmationCode}</Link>}
              <span>{formatWhen(review.submittedAt)}</span>
            </p>
          </div>
          <ReviewModeration reviewId={review.id} status={review.status} />
        </li>)}</ul> : <PlatformEmpty>{status === 'pending' ? 'No reviews waiting' : 'No reviews'}</PlatformEmpty>}
    </div>
  </>
}

export default ReviewsPage
