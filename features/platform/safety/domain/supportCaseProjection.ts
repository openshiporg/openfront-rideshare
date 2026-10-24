export type SupportCaseStatus = 'open' | 'waiting' | 'resolved' | 'closed'

export type SupportCaseQueueItem = {
  id: string
  trip: { id: string; confirmationCode: string } | null
  assignedToId: string | null
  caseNumber: string
  status: SupportCaseStatus
  category: 'trip' | 'unclassified'
  createdAt: string | null
}

const statuses = new Set<SupportCaseStatus>(['open', 'waiting', 'resolved', 'closed'])
const safeCaseNumber = /^HELP-[A-F0-9]{8}$/

/** Restrict the operator DTO to source-generated case identifiers and non-free-text display values. */
export function projectSupportCaseRows(rows: unknown): SupportCaseQueueItem[] | null {
  if (!Array.isArray(rows)) return null
  const projected: SupportCaseQueueItem[] = []
  for (const candidate of rows) {
    if (!candidate || typeof candidate !== 'object') return null
    const row = candidate as Record<string, unknown>
    if (typeof row.caseNumber !== 'string' || !safeCaseNumber.test(row.caseNumber)) return null
    if (typeof row.status !== 'string' || !statuses.has(row.status as SupportCaseStatus)) return null
    if (row.createdAt !== null && typeof row.createdAt !== 'string') return null
    if (typeof row.id !== 'string' || !row.id) return null
    const trip = row.trip && typeof row.trip === 'object' && typeof (row.trip as any).id === 'string' && typeof (row.trip as any).confirmationCode === 'string' ? { id: (row.trip as any).id, confirmationCode: (row.trip as any).confirmationCode } : null
    projected.push({
      id: row.id,
      trip,
      assignedToId: row.assignedTo && typeof (row.assignedTo as any).id === 'string' ? (row.assignedTo as any).id : null,
      caseNumber: row.caseNumber,
      status: row.status as SupportCaseStatus,
      category: row.category === 'trip' ? 'trip' : 'unclassified',
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
    })
  }
  return projected
}
