export const tripBoardQuery = `query Trips($where: TripWhereInput!, $take: Int!, $skip: Int!) {
  authenticatedItem {
    ... on User {
      id
      role { canManageRoles }
      fleetMemberships(where: { status: { equals: "active" }, role: { in: ["owner", "dispatcher"] } }, take: 1) { id }
    }
  }
  trips(where: $where, orderBy: [{ createdAt: desc }, { id: desc }], take: $take, skip: $skip) {
    id confirmationCode status scheduledFor
    acceptedOffer { id } pickupLabel dropoffLabel
    driver { publicName }
    vehicle { label plateMasked }
    updatedAt
  }
  tripsCount(where: $where)
}`
