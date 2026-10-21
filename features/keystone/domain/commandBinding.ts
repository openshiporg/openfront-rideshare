import { createHash } from 'node:crypto'

/** Canonical body ordering adapted from Restaurant utils/idempotency.ts. */
function canonical(value: any, depth = 0): any {
  if (depth > 10) throw new Error('Command body is too deep.')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key], depth + 1)]))
  throw new Error('Command body is invalid.')
}

export function commandBodyHash(body: Record<string, unknown>) {
  const serialized = JSON.stringify(canonical(body))
  if (Buffer.byteLength(serialized) > 32_768) throw new Error('Command body is too large.')
  return createHash('sha256').update(serialized).digest('hex')
}

export function requireCommandKey(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 200 || value !== value.trim()) throw new Error('A stable command key of 12–200 characters is required.')
  return value
}
