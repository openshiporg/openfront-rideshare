import { canAccessFleet, currentHumanActor } from '../access'
import { fenceHumanAuthority } from '../domain/authorityFence'
import { sanitizeStoreLogoSvg } from '../utils/storeLogo'
import { DEFAULT_STORE_LOGO_ICON, normalizeStoreLogoColor } from '../../platform/settings/branding/store-logo'
import { isDeepStrictEqual } from 'node:util'
import { requireCommandKey } from '../domain/commandBinding'

export async function fleetBranding(_root: unknown, args: { fleetId: string }, context: any) {
  return context.prisma.$transaction(async (tx: any) => {
    await fenceHumanAuthority(tx, context.session, args.fleetId)
    if (!await canAccessFleet({ prisma: tx }, context.session, args.fleetId, 'fleetAdmin')) return null
    const row = await tx.fleet.findUnique({ where: { id: args.fleetId }, select: { id: true, name: true, logoIcon: true, logoColor: true, updatedAt: true } })
    return row ? { actorId: context.session.itemId, fleetId: row.id, name: row.name, logoIcon: sanitizeStoreLogoSvg(row.logoIcon || '') || DEFAULT_STORE_LOGO_ICON, logoColor: normalizeStoreLogoColor(row.logoColor), updatedAt: row.updatedAt?.toISOString() } : null
  }, { isolationLevel: 'RepeatableRead' })
}

export async function saveFleetBranding(_root: unknown, args: { fleetId: string; expectedUpdatedAt: string; logoIcon: string; logoColor: string; idempotencyKey: string; expectedActorId: string }, context: any) {
  const idempotencyKey = requireCommandKey(args.idempotencyKey)
  const logoIcon = sanitizeStoreLogoSvg(args.logoIcon)
  if (!logoIcon || !Number.isFinite(Date.parse(args.expectedUpdatedAt))) throw new Error('Branding input is invalid.')
  const logoColor = normalizeStoreLogoColor(args.logoColor)
  return context.prisma.$transaction(async (tx: any) => {
    const actor = await currentHumanActor(tx, context.session)
    if (!actor || actor.id !== args.expectedActorId) throw new Error('Fleet branding is unavailable.')
    for (const key of [`command:${idempotencyKey}`, `fleet-branding:${args.fleetId}`].sort()) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text IS NOT NULL`
    await fenceHumanAuthority(tx, context.session, args.fleetId)
    if (!await canAccessFleet({ prisma: tx }, context.session, args.fleetId, 'fleetAdmin')) throw new Error('Fleet branding is unavailable.')
    const command = { version: 1, purpose: 'fleet_branding', actorId: actor.id, fleetId: args.fleetId, expectedUpdatedAt: args.expectedUpdatedAt, logoIcon, logoColor }
    const prior = await tx.fleetBrandingChange.findUnique({ where: { idempotencyKey } })
    if (prior) {
      if (!isDeepStrictEqual(prior.command, command)) throw new Error('Branding key belongs to another command.')
      return prior.result
    }
    const update = await tx.fleet.updateMany({ where: { id: args.fleetId, updatedAt: new Date(args.expectedUpdatedAt) }, data: { logoIcon, logoColor } })
    if (update.count !== 1) throw new Error('Branding changed. Read the current settings before saving again.')
    const row = await tx.fleet.findUnique({ where: { id: args.fleetId }, select: { id: true, name: true, logoIcon: true, logoColor: true, updatedAt: true } })
    const result = { actorId: actor.id, fleetId: row.id, name: row.name, logoIcon: row.logoIcon, logoColor: row.logoColor, updatedAt: row.updatedAt.toISOString() }
    await tx.fleetBrandingChange.create({ data: { fleetId: row.id, actorId: actor.id, idempotencyKey, command, result } })
    return result
  }, { isolationLevel: 'Serializable' })
}
