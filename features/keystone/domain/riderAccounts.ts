/** Riders may create accounts when any active fleet opens rider accounts in Settings → Operations.
 * PUBLIC_SIGNUPS_ALLOWED keeps working for installs that already set it. */
export async function riderSignupsOpen(prisma: any) {
  if (process.env.PUBLIC_SIGNUPS_ALLOWED === 'true') return true
  return Boolean(await prisma.fleet.findFirst({ where: { riderAccounts: 'open', status: 'active' }, select: { id: true } }))
}
