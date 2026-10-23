import { GraphQLError } from 'graphql'
import type { Plugin } from 'graphql-yoga'

// Keystone attaches `extensions.debug` (Prisma invocations, input data, password hashes) to its errors.
// Keystone's own server drops it outside debug mode; this route serves the schema through Yoga, so do the same here.
export function withoutDebugExtensions<T extends { errors?: readonly unknown[] }>(result: T): T {
  if (!result?.errors?.length) return result
  return {
    ...result,
    errors: result.errors.map(error => {
      if (!(error instanceof GraphQLError) || !error.extensions || !('debug' in error.extensions)) return error
      const { debug: _debug, ...extensions } = error.extensions
      return new GraphQLError(error.message, { nodes: error.nodes, source: error.source, positions: error.positions, path: error.path, originalError: error.originalError, extensions })
    }),
  }
}

export function graphqlErrorMaskingPlugin(enabled = process.env.NODE_ENV === 'production'): Plugin {
  return {
    onExecute() {
      if (!enabled) return
      return {
        onExecuteDone({ result, setResult }) {
          if (result && typeof result === 'object' && 'errors' in result) setResult(withoutDebugExtensions(result))
        },
      }
    },
  }
}
