import type { NotificationAdapter } from './types'

export const consoleNotificationAdapter: NotificationAdapter = {
  async deliver(intent) {
    if (process.env.NODE_ENV === 'production') throw new Error('Console notifications are disabled in production.')
    console.info('[rideshare notification intent]', { channel: intent.channel, templateKey: intent.templateKey, idempotencyKey: intent.idempotencyKey })
    return { status: 'simulated', evidence: { adapter: 'console', authoritativeDeliveryReceipt: false, observedAt: new Date().toISOString() } }
  },
}
