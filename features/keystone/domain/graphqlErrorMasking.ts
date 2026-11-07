import { GraphQLError } from 'graphql'
import type { Plugin } from 'graphql-yoga'
import { constraintGraphQLError } from './constraintErrors'

// Keystone attaches `extensions.debug` (Prisma invocations, input data, password hashes) to its errors.
// Keystone's own server drops it outside debug mode; this route serves the schema through Yoga, so do the same here.
export function withoutDebugExtensions<T extends { errors?: readonly unknown[] }>(result: T): T {
  if (!result?.errors?.length) return result
  return {
    ...result,
    errors: result.errors.map(raw => {
      // A database rule refusing a write reads as what was refused, not "Unexpected error.".
      const error = raw instanceof GraphQLError ? constraintGraphQLError(raw) : raw
      if (!(error instanceof GraphQLError) || !error.extensions || !('debug' in error.extensions)) return error
      const { debug: _debug, ...extensions } = error.extensions
      return new GraphQLError(error.message, { nodes: error.nodes, source: error.source, positions: error.positions, path: error.path, originalError: error.originalError, extensions })
    }),
  }
}

export function graphqlErrorMaskingPlugin(enabled = process.env.NODE_ENV === 'production'): Plugin {
  return {
    onExecute() {
      return {
        onExecuteDone({ result, setResult }) {
          if (result && typeof result === 'object' && 'errors' in result) setResult(enabled ? withoutDebugExtensions(result) : { ...result, errors: result.errors?.map(error => error instanceof GraphQLError ? constraintGraphQLError(error) : error) })
        },
      }
    },
  }
}
