import { createHash } from 'node:crypto'

export async function estimateRoute({ pickupLabel, dropoffLabel }: { pickupLabel: string; dropoffLabel: string }) {
  if (!pickupLabel.trim() || !dropoffLabel.trim()) throw new Error('Pickup and drop-off labels are required.')
  const digest = createHash('sha256').update(`${pickupLabel.trim()}|${dropoffLabel.trim()}`).digest()
  const distanceMeters = 3_000 + digest.readUInt16BE(0) % 12_000
  const durationSeconds = Math.round(600 + distanceMeters / 8)
  return {
    distanceMeters,
    durationSeconds,
    evidence: { provider: 'manual-estimate', observedAt: new Date().toISOString(), authoritative: false, disclosure: 'Development estimate only; no mapping provider was contacted.' },
  }
}
