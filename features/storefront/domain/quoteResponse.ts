import { currencyDigits, validMinor } from '../../lib/currency'

export function isQuoteResponse(value: any): boolean {
  try {
    if (!value || ['quoteId', 'quoteProof', 'expiresAt', 'pickupLabel', 'dropoffLabel', 'estimateDisclosure'].some(key => typeof value[key] !== 'string' || !value[key] || value[key].length > 4096)) return false
    currencyDigits(value.fare?.currencyCode)
    return Number.isFinite(Date.parse(value.expiresAt)) && [value.fare?.totalMinor, value.cancellationFeeMinor, value.noShowFeeMinor].every(validMinor) && [value.estimatedDistanceMeters, value.estimatedDurationSeconds].every(validMinor) && (value.scheduledFor === null || (typeof value.scheduledFor === 'string' && Number.isFinite(Date.parse(value.scheduledFor))))
  } catch { return false }
}
