import type { QuoteBinding } from './quoteBinding'
import { isQuoteResponse } from './quoteResponse'

export const receiptStorageKey = 'openfront-rideshare-receipt-v1'
export const pendingRequestStorageKey = 'openfront-rideshare-pending-request-v2'
export const archivedReceiptKey = (requestId: string) => `openfront-rideshare-receipt-history-v1:${requestId}`
export type RiderReceipt = { requestId: string; requestNumber: string; requestProof: string; status: string }

export function parseRiderReceipt(raw: string | null): RiderReceipt | null {
  if (!raw) return null
  if (raw.length > 16_384) throw new Error('Saved receipt is invalid.')
  const value = JSON.parse(raw)
  if (!value || ['requestId', 'requestNumber', 'requestProof', 'status'].some(key => typeof value[key] !== 'string' || !value[key] || value[key].length > 4096)) throw new Error('Saved receipt is invalid.')
  return { requestId: value.requestId, requestNumber: value.requestNumber, requestProof: value.requestProof, status: value.status }
}

export function parsePendingRequest<Q extends { quoteId: string; quoteProof: string; expiresAt: string }>(raw: string | null): QuoteBinding<Q> | null {
  if (!raw) return null
  if (raw.length > 32_768) throw new Error('Saved request intent is invalid.')
  const value = JSON.parse(raw)
  if (value?.version !== 2 || !value.binding?.quote || !value.binding.inputs) throw new Error('Saved request intent is invalid.')
  const { quote, inputs } = value.binding
  if (['quoteId', 'quoteProof', 'expiresAt'].some(key => typeof quote[key] !== 'string' || !quote[key] || quote[key].length > 4096) || !Number.isFinite(Date.parse(quote.expiresAt)) ||
    ['serviceId', 'pickupLabel', 'dropoffLabel', 'scheduledFor', 'passengerCount'].some(key => typeof inputs[key] !== 'string' || inputs[key].length > 200) || typeof inputs.wheelchairAccessible !== 'boolean') throw new Error('Saved request intent is invalid.')
  if (!isQuoteResponse(quote) || ['pickupLabel', 'dropoffLabel', 'estimateDisclosure'].some(key => typeof quote[key] !== 'string' || quote[key].length > 1000) ||
    !quote.fare || !/^[A-Z]{3}$/.test(quote.fare.currencyCode) || [quote.fare.totalMinor, quote.cancellationFeeMinor, quote.noShowFeeMinor].some(amount => !Number.isSafeInteger(amount) || amount < 0) ||
    (quote.scheduledFor !== null && (typeof quote.scheduledFor !== 'string' || !Number.isFinite(Date.parse(quote.scheduledFor)))) ||
    !inputs.serviceId || !inputs.pickupLabel || !inputs.dropoffLabel || !Number.isInteger(Number(inputs.passengerCount)) || Number(inputs.passengerCount) < 1 || Number(inputs.passengerCount) > 50 ||
    (inputs.scheduledFor && !Number.isFinite(Date.parse(inputs.scheduledFor)))) throw new Error('Saved request intent is invalid.')
  return value.binding
}

// Synchronous durable browser intent MUST succeed before the command crosses fetch.
// Recovery only reuses this exact quote/proof/passenger/accessibility intent.
export function persistPendingRequest(storage: Pick<Storage, 'setItem' | 'getItem'>, binding: QuoteBinding<{ expiresAt: string }>) {
  const serialized = JSON.stringify({ version: 2, binding })
  storage.setItem(pendingRequestStorageKey, serialized)
  if (storage.getItem(pendingRequestStorageKey) !== serialized) throw new Error('This browser cannot save the original request intent. No request was sent.')
}

export function riderStatusHref(confirmationCode: string, requestId: string) {
  return `/rides/${encodeURIComponent(confirmationCode)}?request=${encodeURIComponent(requestId)}`
}

export function archiveReceipt(storage: Pick<Storage, 'getItem' | 'setItem'>, receipt: RiderReceipt) {
  const serialized = JSON.stringify(receipt)
  const key = archivedReceiptKey(receipt.requestId)
  const existing = storage.getItem(key)
  if (existing && existing !== serialized) throw new Error('A different original receipt is already retained.')
  storage.setItem(key, serialized)
  if (storage.getItem(key) !== serialized) throw new Error('Original receipt could not be archived.')
}

export function storedReceipt(storage: Pick<Storage, 'getItem'>, requestId?: string): RiderReceipt | null {
  const current = parseRiderReceipt(storage.getItem(receiptStorageKey))
  if (!requestId || current?.requestId === requestId) return current
  const archived = parseRiderReceipt(storage.getItem(archivedReceiptKey(requestId)))
  return archived?.requestId === requestId ? archived : null
}
