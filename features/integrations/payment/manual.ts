type Input = { trip: any; amount: number; currency: string; paymentId?: string; idempotencyKey?: string }

export async function createPaymentFunction({ trip, amount, currency, idempotencyKey }: Input) {
  return { status: 'pending', externalId: `manual:${trip.id}:${idempotencyKey || 'unkeyed'}`, amount, currency, disclosure: 'Manual adapter records an obligation; it does not authorize or move money.' }
}
export async function capturePaymentFunction({ paymentId, amount, currency }: Input) {
  return { status: 'pending', externalId: paymentId, amount, currency, disclosure: 'Manual adapter cannot capture or claim receipt of funds.' }
}
export async function refundPaymentFunction({ paymentId, amount, currency }: Input) {
  return { status: 'processing', externalId: paymentId, amount, currency, disclosure: 'Manual adapter cannot issue or claim a refund.' }
}
export async function getPaymentStatusFunction({ paymentId }: Input) { return { status: 'pending', externalId: paymentId, disclosure: 'Manual adapter has no external payment status.' } }
export async function handleWebhookFunction() { throw new Error('The manual adapter does not accept webhooks.') }
