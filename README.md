# XOLT Games

A public multiplayer games platform built with React/Vite, Node.js/Express, Socket.IO, Prisma and PostgreSQL.

## Product features

- **Google and GitHub OAuth** for player sign-up and sign-in. Public accounts do not use phone/password authentication.
- **Public player profiles** with searchable usernames, profile covers (cropped before upload), scores, friend count and a 28-day online-activity heatmap.
- **Friends**: search for players, send/accept requests, see online status and invite an online friend to an active game.
- **Player-created quizzes**: any signed-in player can create and host public quizzes.
- **Admin panel**: manage game availability (active/inactive), players, shop items, game content and platform statistics.
- **Online activity and short-lived game invites** use MongoDB runtime collections; PostgreSQL remains the source of truth for accounts, friendships, quizzes, scores and shop ownership. Redis is optional for API caching.
- Games: Math Duel, Quiz, Tic-Tac-Toe, Chess, Checkers, Type Racing (typing-speed competition), and Code Battle.
- Teacher, cashier, group, attendance and payment product screens/APIs are retired. Legacy relational rows are retained by migrations to avoid deleting historical records. The 2D and 3D car-racing games have been removed; Type Racing is a separate typing game and remains available.

## Requirements

- Node.js 20 or newer
- PostgreSQL 15 or newer
- MongoDB 6 or newer for persistent presence, online activity and game invites (without MongoDB these features temporarily fall back to process memory)
- Redis is optional; the server falls back to its in-memory cache when Redis is not configured or reachable

## Local setup

### 1. Configure the server

```bash
cd server
cp .env.example .env
```

Set at least `DATABASE_URL`, a long random `JWT_SECRET`, and the OAuth settings:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
- `FRONTEND_URL` — the client origin
- `OAUTH_REDIRECT_BASE_URL` — the origin that serves the API (defaults to `FRONTEND_URL`)
- `CORS_ORIGINS` — comma-separated allowed client origins
- `ADMIN_OAUTH_EMAILS` — comma-separated, verified Google/GitHub email addresses that may access the admin role
- `MONGODB_URI` and optionally `MONGODB_DB`

Register these exact OAuth callback URLs with each provider:

```text
${OAUTH_REDIRECT_BASE_URL}/api/auth/oauth/google/callback
${OAUTH_REDIRECT_BASE_URL}/api/auth/oauth/github/callback
```

Then install, migrate and seed:

```bash
npm ci
npx prisma generate
npx prisma migrate dev
npm run db:seed
npm run dev
```

The server listens on port 4000 by default. Swagger documentation is available at `/api-docs`.

### 2. Run the client

```bash
cd ../client
npm ci
npm run dev
```

Vite runs at `http://localhost:5173` and proxies `/api`, `/uploads` and `/socket.io` to `http://127.0.0.1:4000` for local development. Keep `FRONTEND_URL=http://localhost:5173` on the server (or set `OAUTH_REDIRECT_BASE_URL` explicitly) and register `http://localhost:5173/api/auth/oauth/{google,github}/callback` with the respective OAuth providers. To use a remote API instead of the local proxy, put `VITE_API_URL=https://your-api.example.com` in `client/.env.development.local` and configure the API's CORS/origins and callback URLs accordingly.

### 3. Build and test

```bash
cd ..
npm ci
npm test
npm run build
```

### Optional no-database preview

`npm run preview` builds the client if needed and starts an in-memory OAuth demo. Its Google/GitHub buttons sign in as a sample player; to preview the admin panel, open `/api/auth/oauth/google?role=admin` on the preview origin. Preview data is temporary and is not production authentication.

## Database notes

- Apply all migrations with `npx prisma migrate deploy` in production.
- OAuth provider account IDs are stored separately from player profiles. Verified admin emails are controlled by `ADMIN_OAUTH_EMAILS` and existing active admin records.
- MongoDB stores socket presence, daily online-duration aggregates (retained for 35 days), and expiring friend game invites. Presence records preserve `lastSeenAt` after a player disconnects.
- Existing group, attendance, payment and retired-role rows are preserved for historical compatibility; their product routes and screens are no longer exposed.

## Deployment

The client is a static SPA and can be deployed behind Nginx or to a static-assets platform. Deploy the Express/Socket.IO API separately. Configure production origins, OAuth callback URLs, secure cookies (`COOKIE_SAME_SITE=none` for cross-site frontend/API deployments), PostgreSQL, MongoDB, and `JWT_SECRET` before enabling sign-in.
