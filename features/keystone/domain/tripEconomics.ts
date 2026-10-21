export type AcceptedQuoteFeeField = 'cancellationFeeMinor' | 'noShowFeeMinor'

export type AcceptedQuoteFee = {
  feeMinor: number
  currencyCode: string
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Reads fee evidence only when the accepted Trip and its locked RideRequest agree. */
export function requireAcceptedQuoteFee(
  bookingSnapshot: unknown,
  requestQuoteSnapshot: unknown,
  field: AcceptedQuoteFeeField,
): AcceptedQuoteFee {
  const tripQuote = record(record(bookingSnapshot)?.quote)
  const requestQuote = record(requestQuoteSnapshot)
  const feeMinor = tripQuote?.[field]
  const currencyCode = tripQuote?.currencyCode
  const requestFeeMinor = requestQuote?.[field]
  const requestCurrencyCode = requestQuote?.currencyCode

  if (
    typeof feeMinor !== 'number' || !Number.isSafeInteger(feeMinor) || feeMinor < 0 ||
    typeof currencyCode !== 'string' || !/^[A-Z]{3}$/.test(currencyCode) ||
    typeof requestFeeMinor !== 'number' || !Number.isSafeInteger(requestFeeMinor) || requestFeeMinor < 0 ||
    typeof requestCurrencyCode !== 'string' || !/^[A-Z]{3}$/.test(requestCurrencyCode) ||
    feeMinor !== requestFeeMinor || currencyCode !== requestCurrencyCode
  ) {
    const label = field === 'cancellationFeeMinor' ? 'Cancellation' : 'No-show'
    throw new Error(`${label} fee evidence is missing, invalid, or inconsistent with the accepted request quote; manual review is required.`)
  }

  return { feeMinor, currencyCode }
}
