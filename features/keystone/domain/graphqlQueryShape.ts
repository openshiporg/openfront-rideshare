import { GraphQLError, getOperationAST, Kind, parse } from 'graphql'
import type { DocumentNode, OperationDefinitionNode, SelectionSetNode } from 'graphql'
import type { Plugin } from 'graphql-yoga'

export const GRAPHQL_QUERY_SHAPE_LIMITS = Object.freeze({
  maxSourceCharacters: 32_768,
  maxOperationNameCharacters: 256,
  maxTokens: 4_000,
  maxDefinitions: 160,
  maxFragments: 128,
  maxDocumentSelections: 4_000,
  maxExpandedSelections: 2_000,
  maxFields: 1_000,
  maxAliases: 100,
  maxDepth: 12,
})

export type GraphQLQueryShape = {
  operationName: string | null
  operationType: OperationDefinitionNode['operation']
  depth: number
  fields: number
  aliases: number
  expandedSelections: number
}

type SelectionBudget = { count: number }
type SelectionFrame = { selectionSet: SelectionSetNode; fieldDepth: number }

function reject(reason: string): never {
  throw new GraphQLError(`GraphQL query rejected: ${reason}.`, {
    extensions: {
      code: 'GRAPHQL_QUERY_SHAPE_REJECTED',
      http: { status: 400 },
    },
  })
}

function collectFragmentSpreads(selectionSet: SelectionSetNode, budget: SelectionBudget): string[] {
  const spreads: string[] = []
  const pending = [selectionSet]
  while (pending.length) {
    const current = pending.pop()!
    for (const selection of current.selections) {
      budget.count += 1
      if (budget.count > GRAPHQL_QUERY_SHAPE_LIMITS.maxDocumentSelections) reject('document selection limit exceeded')
      if (selection.kind === Kind.FRAGMENT_SPREAD) {
        spreads.push(selection.name.value)
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        pending.push(selection.selectionSet)
      } else if (selection.selectionSet) {
        pending.push(selection.selectionSet)
      }
    }
  }
  return spreads
}

function assertFragmentGraphIsAcyclic(adjacency: Map<string, string[]>) {
  const states = new Map<string, 0 | 1 | 2>()
  for (const start of adjacency.keys()) {
    if (states.get(start)) continue
    states.set(start, 1)
    const pending: Array<{ name: string; nextIndex: number }> = [{ name: start, nextIndex: 0 }]
    while (pending.length) {
      const frame = pending[pending.length - 1]
      const neighbors = adjacency.get(frame.name) ?? []
      if (frame.nextIndex >= neighbors.length) {
        states.set(frame.name, 2)
        pending.pop()
        continue
      }
      const next = neighbors[frame.nextIndex++]
      const state = states.get(next) ?? 0
      if (state === 1) reject('cyclic fragment spread')
      if (state === 0) {
        states.set(next, 1)
        pending.push({ name: next, nextIndex: 0 })
      }
    }
  }
}

function parseExecutableDocument(source: string): DocumentNode {
  if (source.length > GRAPHQL_QUERY_SHAPE_LIMITS.maxSourceCharacters) reject('document character limit exceeded')
  try {
    return parse(source, { maxTokens: GRAPHQL_QUERY_SHAPE_LIMITS.maxTokens })
  } catch {
    return reject('document is malformed or exceeds parser limits')
  }
}

export function analyzeGraphQLQueryShape(query: unknown, operationName?: unknown): GraphQLQueryShape {
  if (typeof query !== 'string') reject('query must be a string')
  if (operationName !== undefined && typeof operationName !== 'string') reject('operationName must be a string when provided')
  if (typeof operationName === 'string' && operationName.length > GRAPHQL_QUERY_SHAPE_LIMITS.maxOperationNameCharacters) reject('operationName length limit exceeded')

  const document = parseExecutableDocument(query)
  if (document.definitions.length > GRAPHQL_QUERY_SHAPE_LIMITS.maxDefinitions) reject('definition limit exceeded')

  const operations: OperationDefinitionNode[] = []
  const fragments = new Map<string, (typeof document.definitions)[number] & { kind: Kind.FRAGMENT_DEFINITION }>()
  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      operations.push(definition)
    } else if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      const name = definition.name.value
      if (fragments.has(name)) reject('duplicate fragment definition')
      fragments.set(name, definition)
    } else {
      reject('non-executable definition is not allowed')
    }
  }
  if (operations.length === 0) reject('document has no operation')
  if (fragments.size > GRAPHQL_QUERY_SHAPE_LIMITS.maxFragments) reject('fragment definition limit exceeded')

  const operationNames = new Set<string>()
  for (const operation of operations) {
    if (!operation.name) continue
    if (operationNames.has(operation.name.value)) reject('duplicate operation name')
    operationNames.add(operation.name.value)
  }
  if (operations.length > 1 && operations.some(operation => !operation.name)) reject('anonymous operation is ambiguous')

  let selectedOperation: OperationDefinitionNode | undefined
  if (operationName === undefined) {
    if (operations.length !== 1) reject('operationName is required when the document has multiple operations')
    selectedOperation = operations[0]
  } else {
    const namedMatches = operations.filter(operation => operation.name?.value === operationName)
    if (namedMatches.length !== 1) reject('operationName does not select exactly one operation')
    selectedOperation = namedMatches[0]
  }
  if (getOperationAST(document, operationName as string | undefined) !== selectedOperation) reject('operation selection is ambiguous')

  const documentSelectionBudget = { count: 0 }
  const fragmentAdjacency = new Map<string, string[]>()
  for (const [name, fragment] of fragments) {
    const spreads = collectFragmentSpreads(fragment.selectionSet, documentSelectionBudget)
    for (const spread of spreads) {
      if (!fragments.has(spread)) reject('undefined fragment spread')
    }
    fragmentAdjacency.set(name, spreads)
  }
  for (const operation of operations) {
    const spreads = collectFragmentSpreads(operation.selectionSet, documentSelectionBudget)
    if (spreads.length > GRAPHQL_QUERY_SHAPE_LIMITS.maxDocumentSelections) reject('fragment spread limit exceeded')
    for (const spread of spreads) {
      if (!fragments.has(spread)) reject('undefined fragment spread')
    }
  }
  assertFragmentGraphIsAcyclic(fragmentAdjacency)

  let fields = 0
  let aliases = 0
  let depth = 0
  let expandedSelections = 0
  const pending: SelectionFrame[] = [{ selectionSet: selectedOperation.selectionSet, fieldDepth: 0 }]
  while (pending.length) {
    const frame = pending.pop()!
    for (const selection of frame.selectionSet.selections) {
      expandedSelections += 1
      if (expandedSelections > GRAPHQL_QUERY_SHAPE_LIMITS.maxExpandedSelections) reject('expanded selection limit exceeded')
      if (selection.kind === Kind.FIELD) {
        fields += 1
        if (selection.alias) aliases += 1
        if (fields > GRAPHQL_QUERY_SHAPE_LIMITS.maxFields) reject('field limit exceeded')
        if (aliases > GRAPHQL_QUERY_SHAPE_LIMITS.maxAliases) reject('alias limit exceeded')
        const fieldDepth = frame.fieldDepth + 1
        depth = Math.max(depth, fieldDepth)
        if (depth > GRAPHQL_QUERY_SHAPE_LIMITS.maxDepth) reject('field depth limit exceeded')
        if (selection.selectionSet) pending.push({ selectionSet: selection.selectionSet, fieldDepth })
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        pending.push({ selectionSet: selection.selectionSet, fieldDepth: frame.fieldDepth })
      } else {
        const fragment = fragments.get(selection.name.value)
        if (!fragment) reject('undefined fragment spread')
        pending.push({ selectionSet: fragment.selectionSet, fieldDepth: frame.fieldDepth })
      }
    }
  }

  return {
    operationName: selectedOperation.name?.value ?? null,
    operationType: selectedOperation.operation,
    depth,
    fields,
    aliases,
    expandedSelections,
  }
}

export function assertGraphQLRequestShape(params: unknown): GraphQLQueryShape {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) reject('request parameters must be an object')
  const requestParams = params as { query?: unknown; operationName?: unknown }
  return analyzeGraphQLQueryShape(requestParams.query, requestParams.operationName)
}

export const graphqlQueryShapeGuardPlugin: Plugin = {
  onParams({ params }) {
    assertGraphQLRequestShape(params)
  },
}
