export const safetyQueueQuery = `query SafetyQueue($where: SafetyIncidentWhereInput!, $take: Int!, $skip: Int!, $caseWhere: SupportCaseWhereInput!, $caseTake: Int!, $caseSkip: Int!) {
  safetyQueueScope
  authenticatedItem { ... on User { id } }
  safetyIncidents(where: $where, orderBy: [{ reportedAt: desc }, { id: desc }], take: $take, skip: $skip) {
    id caseNumber status severity category summary reportedAt trip { id confirmationCode } assignedTo { id }
  }
  safetyIncidentsCount(where: $where)
  supportCases(where: $caseWhere, orderBy: [{ createdAt: desc }, { id: desc }], take: $caseTake, skip: $caseSkip) {
    id caseNumber status category createdAt trip { id confirmationCode } assignedTo { id }
  }
  supportCasesCount(where: $caseWhere)
}`
