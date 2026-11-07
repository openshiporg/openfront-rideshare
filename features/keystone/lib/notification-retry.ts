export const STALE_SENDING_MS = 10 * 60_000
export const MAX_NOTIFICATION_ATTEMPTS = 4

/** A notification is claimed once by its unique key. If the first claim died mid-send (row stuck in `sending`) or the
 * provider said `failed`, the same row can be taken again, once at a time, until the attempt cap; then it is `failed`. */
export async function claimNotificationRetry(prisma: any, idempotencyKey: string, now = new Date()): Promise<{ id: string } | null> {
  const row = await prisma.notification.findUnique({ where: { idempotencyKey }, select: { id: true, status: true, attemptCount: true, updatedAt: true } })
  if (!row) return null
  const status = row.status || 'queued'
  const stale = !row.updatedAt || now.getTime() - new Date(row.updatedAt).getTime() > STALE_SENDING_MS
  const retryable = (status === 'sending' && stale) || (status === 'failed' && stale)
  if (!retryable) return null
  if ((row.attemptCount || 0) >= MAX_NOTIFICATION_ATTEMPTS) {
    if (status === 'sending') await prisma.notification.updateMany({ where: { id: row.id, status: 'sending', updatedAt: row.updatedAt }, data: { status: 'failed', lastError: 'gave_up_after_timeout' } })
    return null
  }
  const claimed = await prisma.notification.updateMany({ where: { id: row.id, status, updatedAt: row.updatedAt }, data: { status: 'sending', attemptCount: { increment: 1 } } })
  return claimed.count === 1 ? { id: row.id } : null
}
