import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

type ProofPayload = { v: 1; purpose: 'quote' | 'request' | 'trip'; resourceId: string; expiresAt: number; nonce: string }

function secret() {
  const value = process.env.SESSION_SECRET || ''
  if (Buffer.byteLength(value) < 32) throw new Error('Ride receipt proof requires SESSION_SECRET of at least 32 characters.')
  return value
}

export function createOwnershipProof(purpose: ProofPayload['purpose'], resourceId: string, expiresAt: Date) {
  return signProof({ v: 1, purpose, resourceId, expiresAt: expiresAt.getTime(), nonce: randomBytes(18).toString('base64url') })
}

// Reconstruct ONLY an existing original request receipt; callers must verify its stored hash,
// original intent, owning actor and original expiry. Never extends expiry or rotates on reads.
export function createRecoverableRequestProof(requestId: string, requestNumber: string, expiresAt: Date, quoteProof: string) {
  const nonce = createHmac('sha256', secret()).update(JSON.stringify(['request-receipt/v2', requestId, requestNumber, expiresAt.getTime(), hashOwnershipProof(quoteProof)])).digest('base64url')
  return signProof({ v: 1, purpose: 'request', resourceId: requestNumber, expiresAt: expiresAt.getTime(), nonce })
}

function signProof(payload: ProofPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret()).update(body).digest('base64url')
  const token = `${body}.${signature}`
  return { token, hash: hashOwnershipProof(token), payload }
}

export function hashOwnershipProof(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyOwnershipProof(token: string, purpose: ProofPayload['purpose'], resourceId: string, expectedHash?: string | null, now = Date.now()) {
  if (!token || token.length > 4096) return false
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra) return false
  const expectedSignature = createHmac('sha256', secret()).update(body).digest()
  const actualSignature = Buffer.from(signature, 'base64url')
  if (expectedSignature.length !== actualSignature.length || !timingSafeEqual(expectedSignature, actualSignature)) return false
  if (expectedHash) {
    const actualHash = Buffer.from(hashOwnershipProof(token), 'hex')
    const storedHash = Buffer.from(expectedHash, 'hex')
    if (actualHash.length !== storedHash.length || !timingSafeEqual(actualHash, storedHash)) return false
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as ProofPayload
    return payload.v === 1 && payload.purpose === purpose && payload.resourceId === resourceId && payload.expiresAt > now
  } catch { return false }
}
