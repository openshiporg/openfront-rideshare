export const driverReadinessQuery = `query Drivers($where: DriverProfileWhereInput!, $take: Int!, $skip: Int!, $documentsTake: Int!, $vehiclesTake: Int!) {
  authenticatedItem {
    ... on User {
      role { canManageRoles }
      fleetMemberships(where: { status: { equals: "active" }, role: { in: ["owner", "dispatcher"] } }, take: 1) { id }
    }
  }
  driverProfiles(where: $where, orderBy: [{ publicName: asc }, { id: asc }], take: $take, skip: $skip) {
    id publicName status dispatchStatus
    documents(orderBy: [{ createdAt: desc }, { id: desc }], take: $documentsTake) { id kind status expiresAt }
    vehicles(orderBy: [{ createdAt: desc }, { id: desc }], take: $vehiclesTake) { id label status }
    policyEvaluations(orderBy: [{ evaluatedAt: desc }, { id: desc }], take: 1) { outcome expiresAt }
  }
  driverProfilesCount(where: $where)
}`
