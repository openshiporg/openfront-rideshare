type Boundary = { id: string; time: string | null }

export function encodeKeyset(purpose: string, scope: string, boundary: Boundary) {
  return Buffer.from(JSON.stringify({ v: 1, purpose, scope, ...boundary })).toString('base64url')
}

/** A cursor selects a position, never grants access. Every page separately
 * derives current authority and keeps its owner/fleet predicate. */
export function decodeKeyset(value: unknown, purpose: string, scope: string): Boundary | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 1600 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid page cursor.')
  let data: any
  try { data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) } catch { throw new Error('Invalid page cursor.') }
  if (data?.v !== 1 || data.purpose !== purpose || data.scope !== scope || typeof data.id !== 'string' || !data.id || data.id.length > 200 || (data.time !== null && (typeof data.time !== 'string' || !Number.isFinite(Date.parse(data.time)) || new Date(data.time).toISOString() !== data.time))) throw new Error('Invalid page cursor.')
  return { id: data.id, time: data.time }
}
