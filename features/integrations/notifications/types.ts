export type NotificationIntent = { channel: 'email' | 'sms' | 'push' | 'webhook'; recipientReference: string; templateKey: string; payload: Record<string, unknown>; idempotencyKey: string }
export type NotificationResult = { status: 'simulated' | 'unconfigured' | 'accepted' | 'delivered' | 'unknown' | 'failed'; providerReference?: string; evidence: Record<string, unknown> }
export interface NotificationAdapter { deliver(intent: NotificationIntent): Promise<NotificationResult> }
