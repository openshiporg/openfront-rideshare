/** Adapted from Restaurant currency-units. Invalid evidence is never coerced to
 * zero. Intl's ISO currency set supplies the exponent, including JPY and BHD. */
export function currencyDigits(code: string): number {
  if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code)) throw new Error('Invalid currency.')
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('currency')
  if (supported && !supported.includes(code)) throw new Error('Unsupported currency.')
  return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
}

export const MAX_MINOR = 2_147_483_647

export function validMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_MINOR
}

export function formatMoney(amountMinor: unknown, code: string): string {
  try {
    if (!validMinor(amountMinor)) return 'Amount unavailable'
    const digits = currencyDigits(code)
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amountMinor / 10 ** digits)
  } catch { return 'Amount unavailable' }
}
