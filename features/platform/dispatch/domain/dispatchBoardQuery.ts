export const dispatchBoardQuery = `query Dispatch($where: RideRequestWhereInput!, $take: Int!, $skip: Int!) {
  authenticatedItem { ... on User { id } }
  dispatchQueueScope
  rideRequests(where: $where, orderBy: [{ createdAt: asc }, { id: asc }], take: $take, skip: $skip) {
    id requestNumber status requestedFor pickupLabel dropoffLabel passengerCount fleet { id operationsMode }
    matchOffers(where: { status: { in: ["offered", "accepted"] } }, orderBy: { offeredAt: desc }, take: 50) { id status expiresAt }
  }
  rideRequestsCount(where: $where)
}`
