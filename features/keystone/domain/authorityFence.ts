import { humanSessionId, type Session } from '../access'

/** Call ONLY on the command/read transaction client. Native SHARE row locks
 * conflict with UPDATE/DELETE by ordinary Prisma/Keystone writers too. The
 * current authority check must run AFTER acquiring these locks. */
export async function fenceHumanAuthority(tx: any, session?: Session, fleetId?: string | null) {
  const actorId = humanSessionId(session)
  if (!actorId) throw new Error('A current human session is required.')
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR SHARE`
  await tx.$queryRaw`SELECT r.id FROM "Role" r JOIN "User" u ON u.role = r.id WHERE u.id = ${actorId} FOR SHARE OF r`
  if (fleetId) {
    await tx.$queryRaw`SELECT id FROM "Fleet" WHERE id = ${fleetId} FOR SHARE`
    await tx.$queryRaw`SELECT id FROM "FleetMembership" WHERE "user" = ${actorId} AND fleet = ${fleetId} ORDER BY id FOR SHARE`
  }
}
