import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GraphQLError } from 'graphql'
import { withoutDebugExtensions } from '../features/keystone/domain/graphqlErrorMasking'

test('drops Keystone debug details from GraphQL errors and keeps the rest', () => {
  const leaking = new GraphQLError('Prisma error: invalid invocation', { path: ['createUser'], extensions: { code: 'KS_PRISMA_ERROR', debug: [{ message: 'password: "$2a$10$hash"' }] } })
  const result = withoutDebugExtensions({ data: null, errors: [leaking] })
  const [error] = result.errors as GraphQLError[]
  assert.equal(error.message, 'Prisma error: invalid invocation')
  assert.deepEqual(error.path, ['createUser'])
  assert.deepEqual(error.extensions, { code: 'KS_PRISMA_ERROR' })
  assert.ok(!JSON.stringify(result).includes('$2a$10$'))
})

test('leaves results without errors untouched', () => {
  const ok: { data: { ok: boolean }; errors?: readonly unknown[] } = { data: { ok: true } }
  assert.equal(withoutDebugExtensions(ok), ok)
})
