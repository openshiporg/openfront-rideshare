export type OfferResponseIntent = { offerId: string; response: 'accept' | 'decline'; idempotencyKey: string }
const prefix = 'openfront-rideshare-offer-response-v1:'
export const offerResponseStorageKey = (offerId: string) => `${prefix}${offerId}`

export function readOfferResponseIntent(raw: string | null, offerId: string): OfferResponseIntent | null {
  if (!raw) return null
  if (raw.length > 4096 || !offerId || offerId.length > 200) throw new Error('Saved offer command is invalid; reconciliation is required.')
  const value = JSON.parse(raw)
  if (value?.offerId !== offerId || !['accept', 'decline'].includes(value.response) || typeof value.idempotencyKey !== 'string' || value.idempotencyKey.length < 12 || value.idempotencyKey.length > 200) throw new Error('Saved offer command is invalid; reconciliation is required.')
  return { offerId, response: value.response, idempotencyKey: value.idempotencyKey }
}

// Local intent is not authority. Keep recovery reachable independently of the
// server's unexpired-offer queue, which drops an offer after acceptance/expiry.
export function listOfferResponseIntents(storage: Pick<Storage, 'length' | 'key' | 'getItem'>) {
  const commands: OfferResponseIntent[] = []
  let unreadable = 0
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(prefix)) continue
    try {
      const intent = readOfferResponseIntent(storage.getItem(key), key.slice(prefix.length))
      if (intent) commands.push(intent)
    } catch { unreadable++ }
  }
  return { commands, unreadable }
}

export function persistOfferResponseIntent(storage: Pick<Storage, 'getItem' | 'setItem'>, intent: OfferResponseIntent) {
  const key = offerResponseStorageKey(intent.offerId)
  const existing = readOfferResponseIntent(storage.getItem(key), intent.offerId)
  if (existing && (existing.response !== intent.response || existing.idempotencyKey !== intent.idempotencyKey)) throw new Error('The original offer command must be recovered before another response.')
  const serialized = JSON.stringify(intent)
  storage.setItem(key, serialized)
  if (storage.getItem(key) !== serialized) throw new Error('Offer response could not be saved; no command was sent.')
}

export function acknowledgeOfferResponse(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, intent: OfferResponseIntent, receipt: string) {
  const key = offerResponseStorageKey(intent.offerId)
  const pending = readOfferResponseIntent(storage.getItem(key), intent.offerId)
  if (!pending || JSON.stringify(pending) !== JSON.stringify(intent) || !receipt) throw new Error('Original response acknowledgement could not be retained.')
  const acknowledgementKey = `openfront-rideshare-offer-ack-v1:${intent.offerId}:${intent.idempotencyKey}`
  const serialized = JSON.stringify({ version: 1, intent, receipt })
  storage.setItem(acknowledgementKey, serialized)
  if (storage.getItem(acknowledgementKey) !== serialized) throw new Error('Response acknowledgement could not be retained.')
  storage.removeItem(key)
}
