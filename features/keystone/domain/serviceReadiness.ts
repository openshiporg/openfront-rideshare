/** New admissions only. Historical readback and exact committed receipts are
 * deliberately resolved before this guard. Parent SHARE locks fence ordinary
 * pause/update/delete writers for the remainder of the transaction. */
export async function requireServiceReadiness(tx: any, serviceId: string | null, fleetId?: string | null) {
  if (!serviceId) throw new Error('Service is unavailable.')
  await tx.$queryRaw`SELECT id FROM "RideService" WHERE id = ${serviceId} FOR SHARE`
  const service = await tx.rideService.findUnique({ where: { id: serviceId }, select: { id: true, fleetId: true, status: true } })
  if (!service?.fleetId || (fleetId && service.fleetId !== fleetId) || service.status !== 'active') throw new Error('Service is unavailable.')
  await tx.$queryRaw`SELECT id FROM "Fleet" WHERE id = ${service.fleetId} FOR SHARE`
  const fleet = await tx.fleet.findUnique({ where: { id: service.fleetId }, select: { id: true, status: true } })
  const areas = await tx.serviceArea.findMany({ where: { fleetId: service.fleetId, status: 'active', services: { some: { id: service.id } } }, orderBy: { id: 'asc' }, take: 1, select: { id: true } })
  if (fleet?.status !== 'active' || !areas.length) throw new Error('Service is unavailable.')
  await tx.$queryRaw`SELECT id FROM "ServiceArea" WHERE id = ${areas[0].id} FOR SHARE`
  const area = await tx.serviceArea.findFirst({ where: { id: areas[0].id, fleetId: service.fleetId, status: 'active', services: { some: { id: service.id } } }, select: { id: true } })
  if (!area) throw new Error('Service is unavailable.')
  return service
}
