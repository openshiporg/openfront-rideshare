export type QuoteInputSnapshot = Readonly<{
  serviceId: string
  pickupLabel: string
  dropoffLabel: string
  scheduledFor: string
  passengerCount: string
  wheelchairAccessible: boolean
}>

export type QuoteBinding<TQuote extends { expiresAt: string }> = Readonly<{
  quote: TQuote
  inputs: QuoteInputSnapshot
  generation: number
}>

export function advanceQuoteRequestGeneration(current: number): number {
  return Number.isSafeInteger(current) && current >= 0 && current < Number.MAX_SAFE_INTEGER
    ? current + 1
    : 1
}

export function isCurrentQuoteRequest(requestGeneration: number, currentGeneration: number): boolean {
  return Number.isSafeInteger(requestGeneration) && requestGeneration > 0 && requestGeneration === currentGeneration
}

export function quoteInputsMatch(left: QuoteInputSnapshot, right: QuoteInputSnapshot): boolean {
  return left.serviceId === right.serviceId
    && left.pickupLabel === right.pickupLabel
    && left.dropoffLabel === right.dropoffLabel
    && left.scheduledFor === right.scheduledFor
    && left.passengerCount === right.passengerCount
    && left.wheelchairAccessible === right.wheelchairAccessible
}

export function isQuoteUnexpired(expiresAt: string, now = Date.now()): boolean {
  const expiry = Date.parse(expiresAt)
  return Number.isFinite(expiry) && expiry > now
}

export function getUsableQuoteBinding<TQuote extends { expiresAt: string }>(
  binding: QuoteBinding<TQuote> | null,
  currentInputs: QuoteInputSnapshot,
  currentGeneration: number,
  now = Date.now(),
): QuoteBinding<TQuote> | null {
  if (!binding || !isCurrentQuoteRequest(binding.generation, currentGeneration)) return null
  if (!quoteInputsMatch(binding.inputs, currentInputs) || !isQuoteUnexpired(binding.quote.expiresAt, now)) return null
  return binding
}
