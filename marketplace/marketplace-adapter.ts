/** Consumer-side reference adapter for openfront-marketplace. This file is not imported by the source app. */
import discoveryCriteriaSchema from './schemas/rideshare-discovery.schema.json'

export const rideshareCapability = {
  descriptor: {
    vertical: 'rideshare',
    resultKind: 'rideshare.service',
    criteriaSchema: discoveryCriteriaSchema,
    actions: ['discovery.details', 'rideshare.quote', 'rideshare.request', 'rideshare.trip.view'],
  },
  async fetchCandidates({ endpoint, query, location, limit = 10 }: any) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: `query Discover($query:String,$location:String,$limit:Int){marketplaceRideshareServices(query:$query,location:$location,limit:$limit){id title description category passengerCapacity wheelchairAccessible publicRegionLabels startingFareMinor currencyCode extension{schema value}fleet{id name publicCity countryCode}}}`, variables: { query, location, limit } }) })
    const payload = await response.json()
    if (payload.errors?.length) throw new Error(payload.errors[0].message)
    return payload.data.marketplaceRideshareServices.map((service: any) => ({
      id: service.id, title: service.title,
      semanticDocument: [service.title, service.description, service.category, ...service.publicRegionLabels].filter(Boolean),
      sourceFacts: { ...(typeof service.startingFareMinor === 'number' ? { price: { amountMinor: service.startingFareMinor, currency: service.currencyCode } } : {}), available: true },
      extension: service.extension,
      payload: service,
    }))
  },
}
