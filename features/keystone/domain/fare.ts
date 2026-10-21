export type FareRuleSnapshot = {
  currencyCode: string; baseFareMinor: number; perDistanceUnitMinor: number; distanceUnit: 'mile' | 'kilometer'; perMinuteMinor: number;
  bookingFeeMinor: number; minimumFareMinor: number; multiplierBasisPoints?: number; maximumMultiplierBasisPoints?: number
  cancellationFeeMinor?: number; noShowFeeMinor?: number; version?: number
}

export function validateFareRule(rule: FareRuleSnapshot) {
  currencyDigits(rule.currencyCode)
  for (const key of ['baseFareMinor', 'perDistanceUnitMinor', 'perMinuteMinor', 'bookingFeeMinor', 'minimumFareMinor', 'cancellationFeeMinor', 'noShowFeeMinor'] as const) {
    if ((rule[key] !== undefined || !['cancellationFeeMinor','noShowFeeMinor'].includes(key)) && !validMinor(rule[key])) throw new Error('Fare components must be non-negative integer minor units within the supported range.')
  }
  if (!['mile', 'kilometer'].includes(rule.distanceUnit)) throw new Error('Unsupported distance unit.')
  if (rule.version !== undefined && (!Number.isSafeInteger(rule.version) || rule.version < 1)) throw new Error('Fare version must be positive.')
  const maximum = rule.maximumMultiplierBasisPoints ?? 10000
  const multiplier = rule.multiplierBasisPoints ?? 10000
  if (![maximum, multiplier].every(value => Number.isSafeInteger(value) && value >= 10000 && value <= 30000) || multiplier > maximum) throw new Error('Invalid fare multiplier.')
}

export function calculateFare(rule: FareRuleSnapshot, distanceMeters: number, durationSeconds: number) {
  validateFareRule(rule)
  if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 0 || distanceMeters > MAX_MINOR || !Number.isSafeInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > MAX_MINOR) throw new Error('Route estimates must be non-negative supported integers.')
  const divisor = rule.distanceUnit === 'mile' ? 1609.344 : 1000
  const distanceMinor = Math.round((distanceMeters / divisor) * rule.perDistanceUnitMinor)
  const durationMinor = Math.round((durationSeconds / 60) * rule.perMinuteMinor)
  const subtotalMinor = rule.baseFareMinor + distanceMinor + durationMinor + rule.bookingFeeMinor
  const multiplier = rule.multiplierBasisPoints ?? 10000
  const totalMinor = Math.max(rule.minimumFareMinor, Math.round(subtotalMinor * multiplier / 10000))
  if (![distanceMinor, durationMinor, subtotalMinor, totalMinor].every(validMinor) || !Number.isSafeInteger(subtotalMinor * multiplier)) throw new Error('Calculated fare exceeds the supported range.')
  return { currencyCode: rule.currencyCode, baseFareMinor: rule.baseFareMinor, distanceMinor, durationMinor, bookingFeeMinor: rule.bookingFeeMinor, multiplierBasisPoints: multiplier, subtotalMinor, totalMinor }
}
import { currencyDigits, MAX_MINOR, validMinor } from '../../lib/currency'
