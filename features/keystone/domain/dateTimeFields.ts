// Keystone's DateTime scalar serializes only Date instances. Custom resolvers here often build their
// results from ISO strings, which made responses like marketplaceRideshareQuote.expiresAt fail
// ("unexpected value provided to DateTime scalar"). Every DateTime field on an extension type gets a
// resolver that hands the scalar a Date, whichever form the parent value is in.
export function toDateTime(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) ? date : null
  }
  return null
}

/** Field resolvers for every `field: DateTime` / `DateTime!` on the object types declared in `typeDefs`. */
export function dateTimeFieldResolvers(typeDefs: string) {
  const resolvers: Record<string, Record<string, (parent: Record<string, unknown>) => Date | null>> = {}
  for (const match of typeDefs.matchAll(/\btype\s+(\w+)\s*\{([^}]*)\}/g)) {
    const [, typeName, body] = match
    if (typeName === 'Query' || typeName === 'Mutation') continue
    for (const field of body.matchAll(/(\w+)\s*:\s*DateTime!?/g)) {
      const name = field[1]
      ;(resolvers[typeName] ??= {})[name] = parent => toDateTime(parent?.[name])
    }
  }
  return resolvers
}
