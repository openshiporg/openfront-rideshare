# Openfront Rideshare

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fopenshiporg%2Fopenfront-rideshare&env=DATABASE_URL%2CSESSION_SECRET)

Openfront Rideshare is a self-hostable ride-booking and fleet-operations application for independent drivers and fleets. Riders can discover services, request quotes and rides, and review trip status. Operators manage drivers, dispatch, trip transitions, support, safety records, and manual payment records.

## Demo

Explore the application locally using the setup instructions below.

| | |
|---|---|
| **Public application** | `/` on your development URL |
| **Dashboard** | `/dashboard` on your development URL |

[Learn more →](https://openship.org/products/openfront-rideshare)

[Documentation →](features/keystone/models)

## The Openfront Ecosystem

Openfront is part of an ecosystem of open-source commerce tools:

- **[Openfront E-commerce](https://github.com/openshiporg/openfront)**: Headless e-commerce for retail.
- **[Openfront Restaurant](https://github.com/openshiporg/openfront-restaurant)**: Restaurant ordering, point of sale, and kitchen operations.
- **[Openship](https://github.com/openshiporg/openship)**: Order routing for multi-channel fulfillment.
- **Openfront Rideshare**: (This repository) a self-hostable ride-booking and fleet-operations application for independent drivers and fleets.

## Core Features

### Admin Dashboard
Manage settings, drivers, dispatch, safety, my driving, finance, trips through dedicated dashboard workspaces and permission-controlled data screens.

### Storefront
The public service surface connects `/book`, ride confirmation pages at `/rides/[confirmationCode]`, and rider accounts with request status and trip history. Private trip access uses request proofs or trip tokens rather than confirmation codes alone.

### Quotes, Requests & Dispatch
Define service areas, availability, fare rules, and ride services; create quotes and requests, offer rides to drivers, accept or decline offers, and transition trips.

### Driver & Fleet Operations
Maintain fleet memberships, drivers, vehicles, compliance documents, policies, and driver workspaces.

### Support, Safety & Finance
Record cancellations, messages, reviews, support cases, safety incidents, payment observations, refunds, ledger entries, and payouts. The included payment adapter is manual; mapping and notification implementations do not establish live automated dispatch or payment-provider service.

## Architecture

### Technology Stack
- **Frontend**: Next.js 16 with App Router and React 19.
- **Backend**: KeystoneJS 6 with a GraphQL API.
- **Database**: PostgreSQL with Prisma ORM.
- **Styling**: Tailwind CSS 4 and shared shadcn/ui components.
- **Authentication**: Password-based user accounts and session-based access with role capabilities.

### Application Structure
```text
openfront-rideshare/
├── app/                    # Public pages, dashboard routes, and HTTP endpoints
├── features/
│   ├── keystone/           # Backend models, access rules, and GraphQL workflows
│   ├── platform/           # Operator workspaces and onboarding
│   ├── storefront/         # Public application components and screens
│   └── dashboard/          # Authentication and shared dashboard shell
└── components/             # Shared UI components
```

### Data Models
The [model registry](features/keystone/models/index.ts) and [Prisma schema](schema.prisma) cover:

- Fleets, memberships, drivers, riders, vehicles, documents, and policies.
- Service areas, ride services, availability, fares, quotes, and requests.
- Offers, trips, events, location events, cancellations, messages, and safety records.
- Payment providers, payments, observations, refunds, ledger entries, payouts, and marketplace registration.

## Getting Started

### Prerequisites
- Node.js 22, compatible with the [package requirements](package.json) and Next.js 16.
- A PostgreSQL database you can migrate.
- npm.

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/openshiporg/openfront-rideshare.git
   cd openfront-rideshare
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Review the [example configuration](.env.example) and replace its placeholders. Keep only the local settings you need; do not copy production-mode or infrastructure examples unchanged.

   ```env
   DATABASE_URL=postgresql://user:password@host/database
   SESSION_SECRET=replace-with-a-new-private-random-secret
   ```

   Generate the session secret with `openssl rand -hex 32`; use the generated value, not the placeholder. Never commit `.env`.

   Review [runtime configuration](features/keystone/index.ts) for additional application settings before building or deploying. Configure enabled integrations separately; the two values above are not a complete production configuration.

3. **Start development server:**
   ```bash
   npm run dev
   ```

   The development script prepares the backend schema, applies checked-in migrations, and starts Next.js.

4. **Access the application:**
   Open the URL `npm run dev` prints, then use these paths:

   - **Public application**: `/`
   - **Admin dashboard**: `/dashboard`
   - **Customer account**: `/account`
   - **GraphQL API**: `/api/graphql`

5. **Create your first admin user:**
   Visit `/dashboard/init` on an empty database to create the initial administrator, then sign in to the dashboard.

6. **Run application onboarding:**
   Run rideshare onboarding, configure the fleet, drivers, vehicles, service areas, availability, and pricing, then review operational policies and provider limitations before serving riders.

## Development Commands

- `npm run dev` - Prepare the backend schema, apply migrations, and start Next.js development.
- `npm run build` - Build the backend and Next.js for production; does not apply migrations.
- `npm start` - Start the production Next.js server.
- `npm run migrate:gen` - Prepare the schema and generate/apply development migrations.
- `npm run migrate` - Apply checked-in Prisma migrations.
- `npm run lint` - Run the repository's ESLint script.
- `npm run typecheck` - Run the configured TypeScript check.
- `npm run test` - Run the repository's configured test suite.

Use a disposable development database for migration generation. Review the script before running it against any existing data.

### Ride Provider Integration
The [registered ride commands](features/keystone/mutations/index.ts) connect quote, request, offer, trip, and support workflows. The [payment registry](features/integrations/payment/index.ts) currently registers manual payment only. Transport operations require applicable licensing, insurance, safety processes, and approved external providers.

## Documentation

The [backend models](features/keystone/models), [registered business workflows](features/keystone/mutations/index.ts), [access rules](features/keystone/access.ts), and [application routes](app) document the implementation in this repository.

## Security & Permissions

### Role-Based Access Control
- `canAccessDashboard` - Access dashboard.
- `canManageFleet` - Manage fleet.
- `canDispatchRides` - Dispatch rides.

### Security Features
- Session-based authentication for signed-in users.
- Backend list access and workflow authorization, rather than dashboard visibility alone.
- Authority checks re-read the current human actor and active fleet membership. Dispatch, driver operations, finance, safety, and fleet administration have different membership scopes; rider access is checked separately.

Review the [access implementation](features/keystone/access.ts) and individual workflow checks before extending permissions.

## Platform Components

### Admin Platform (`/dashboard`)
- **Settings**: `/dashboard/platform/settings`.
- **Drivers**: `/dashboard/platform/drivers`.
- **Dispatch**: `/dashboard/platform/dispatch`.
- **Safety**: `/dashboard/platform/safety`.
- **My Driving**: `/dashboard/platform/my-driving`.
- **Finance**: `/dashboard/platform/finance`.
- **Trips**: `/dashboard/platform/trips`.

### Storefront Experience
The public service surface connects `/book`, ride confirmation pages at `/rides/[confirmationCode]`, and rider accounts with request status and trip history. Private trip access uses request proofs or trip tokens rather than confirmation codes alone.

Define service areas, availability, fare rules, and ride services; create quotes and requests, offer rides to drivers, accept or decline offers, and transition trips.

## Deployment

### Production Deployment
The Vercel button imports this application's own repository. Provision PostgreSQL and configure the application's complete runtime requirements, storage, mail, and enabled providers before building. Importing the source does not configure these services or grant regulatory approval.

Build the application and apply checked-in migrations as a release step before starting the server. Back up existing data before migration.

```bash
npm run build
npm run migrate
npm start
```

The included [Railway configuration](railway.toml) defines this app's build and startup lifecycle. Provision services and secrets separately.

### Scaling Considerations
Preserve fleet authority and atomic trip-state transitions across dispatch processes. Add approved mapping, communication, and payment providers before promising automated external operations.

## Contributing

Use the development commands above when preparing changes. Keep model changes and their migrations together, and describe workflow and permission changes in pull requests.

## License

No top-level license file or package license declaration is included in this repository.

## Support

- **Documentation**: [Source models and workflows](features/keystone/models).
- **Issues**: [Report bugs and feature requests](https://github.com/openshiporg/openfront-rideshare/issues).
- **Product**: [Learn more about Openfront Rideshare](https://openship.org/products/openfront-rideshare).

---

Built with [Next.js](https://nextjs.org) and [KeystoneJS](https://keystonejs.com).
