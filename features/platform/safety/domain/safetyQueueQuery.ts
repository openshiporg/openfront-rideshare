export const safetyQueueQuery = `query SafetyQueue($where: SafetyIncidentWhereInput!, $take: Int!, $skip: Int!, $caseWhere: SupportCaseWhereInput!, $caseTake: Int!, $caseSkip: Int!) {
  safetyQueueScope
  safetyIncidents(where: $where, orderBy: [{ reportedAt: desc }, { id: desc }], take: $take, skip: $skip) {
    id caseNumber status severity category summary reportedAt
  }
  safetyIncidentsCount(where: $where)
  supportCases(where: $caseWhere, orderBy: [{ createdAt: desc }, { id: desc }], take: $caseTake, skip: $caseSkip) {
    caseNumber status category createdAt
  }
  supportCasesCount(where: $caseWhere)
}`
