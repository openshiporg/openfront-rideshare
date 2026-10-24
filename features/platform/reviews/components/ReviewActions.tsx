'use client'

import { TransitionTrack } from '@/features/platform/components/SetupSheet'
import { ops } from '@/features/platform/setup/setupMutations'

export function ReviewModeration({ reviewId, status }: { reviewId: string; status: string }) {
  const actions = [
    ...(status !== 'published' ? [{ label: 'Publish', tone: 'primary' as const, run: () => ops.review(reviewId, 'published') }] : []),
    ...(status !== 'hidden' ? [{ label: 'Hide', run: () => ops.review(reviewId, 'hidden') }] : []),
    ...(status !== 'removed' ? [{ label: 'Remove', tone: 'quiet' as const, run: () => ops.review(reviewId, 'removed'), confirm: 'Remove this review?' }] : []),
  ]
  return <TransitionTrack label="Review moderation" actions={actions} />
}
