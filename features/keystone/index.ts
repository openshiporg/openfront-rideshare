import { s3ForcePathStyle } from "./lib/s3-storage";
import { createAuth } from '@keystone-6/auth'
import { config } from '@keystone-6/core'
import { statelessSessions } from '@keystone-6/core/session'
import 'dotenv/config'
import { models } from './models'
import { extendGraphqlSchema } from './mutations'
import { sendPasswordResetEmail } from './lib/mail'
import { permissionNames, permissions } from './access'

const production = process.env.NODE_ENV === 'production'
const databaseURL = process.env.DATABASE_URL || 'postgresql://localhost/openfront_rideshare'
const sessionSecret = process.env.SESSION_SECRET || 'development-only-session-secret-change-me-now'
if (production && (!process.env.DATABASE_URL || !process.env.SESSION_SECRET || sessionSecret.length < 32)) throw new Error('DATABASE_URL and SESSION_SECRET of at least 32 characters are required in production.')

const session = statelessSessions({ maxAge: 60 * 60 * 24 * 30, secret: sessionSecret })
const { withAuth } = createAuth({
  listKey: 'User', identityField: 'email', secretField: 'password',
  initFirstItem: {
    fields: ['name', 'email', 'password'],
    itemData: { role: { create: { name: 'Admin', ...Object.fromEntries(permissionNames.map(name => [name, true])) } } },
  },
  passwordResetLink: { async sendToken(args) { await sendPasswordResetEmail(args.token, args.identity) } },
  sessionData: `id name email role { id name ${permissionNames.join(' ')} }`,
})

const storage = process.env.S3_BUCKET_NAME ? {
  my_images: {
    kind: 's3' as const, type: 'image' as const, bucketName: process.env.S3_BUCKET_NAME,
    region: process.env.S3_REGION || 'auto', accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    endpoint: process.env.S3_ENDPOINT, forcePathStyle: s3ForcePathStyle(process.env.S3_ENDPOINT), signed: { expiry: 5000 },
  },
} : undefined

export default withAuth(config({
  db: { provider: 'postgresql', url: databaseURL }, lists: models, session,
  graphql: { extendGraphqlSchema }, storage,
  ui: { isAccessAllowed: context => permissions.canAccessDashboard({ context, session: context.session }) },
}))
