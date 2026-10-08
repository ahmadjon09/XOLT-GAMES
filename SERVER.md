# XOLT Games — Server Operations

This guide reflects the public OAuth-based platform and its current runtime/data boundaries.

## Architecture

```text
Browser (React SPA)
  ├── /api/*        → Express REST API
  ├── /socket.io/*  → Socket.IO multiplayer sessions
  └── /uploads/*    → uploaded images
          │
          ▼
      Nginx / TLS
          │
          ├── Node.js (Express + Socket.IO)
          ├── PostgreSQL (Prisma: accounts, friendships, quizzes, scores, shop)
          ├── MongoDB (presence leases, online activity, expiring game invites)
          └── Redis (optional response/cache acceleration)
```

### Durable versus runtime data

- **PostgreSQL** is authoritative for OAuth-linked accounts, admin accounts, friendships, quizzes, game catalog state, scores and shop ownership.
- **MongoDB** holds frequently changing presence and online-activity data, plus short-lived friend game invites. Presence heartbeats refresh every 25 seconds with a 90-second lease; daily activity is kept for 35 days. If MongoDB is unavailable, the process falls back to memory, so presence/activity will not be shared across restarts until MongoDB is restored.
- **Redis** is optional. The existing cache layer falls back to in-process memory if Redis is not configured.
- Legacy group/attendance/payment tables and attribution fields remain in PostgreSQL for non-destructive history retention. Their public product routes and UI have been removed.

## OAuth and browser sessions

Configure the following in `server/.env`:

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
FRONTEND_URL=https://games.example.com
OAUTH_REDIRECT_BASE_URL=https://api.example.com
CORS_ORIGINS=https://games.example.com
ADMIN_OAUTH_EMAILS=admin@example.com
COOKIE_SAME_SITE=none
JWT_SECRET=<long-random-secret>
```

Provider callback URLs must exactly match:

```text
https://api.example.com/api/auth/oauth/google/callback
https://api.example.com/api/auth/oauth/github/callback
```

OAuth tokens are placed in an `HttpOnly`, `Secure` production cookie and also returned once in the frontend callback URL fragment. The client stores that bearer token to authenticate cross-site API and Socket.IO requests when third-party cookies are blocked; the fragment is removed from browser history before React starts. Set `COOKIE_SAME_SITE=none` when the frontend and API are cross-site, and ensure TLS is enabled. Public users can authenticate through either provider. Only verified addresses in `ADMIN_OAUTH_EMAILS` (or active, provisioned admin records) receive the admin role.

## Capacity protection

`server/src/utils/capacity.js` samples process/cgroup memory, event-loop lag, socket count and active rooms. At `busy`, room creation/join requests receive `SERVER_BUSY`; existing game traffic is not blocked. The HTTP guard keeps health and auth endpoints reachable and returns `503` for blocked API work. Uploads are treated as heavy work and are also rejected at the warning threshold.

Relevant settings in `server/.env.example`:

```dotenv
SERVER_MEM_LIMIT_MB=
CAP_MEM_WARN_PCT=75
CAP_MEM_BUSY_PCT=88
CAP_LOOP_LAG_WARN_MS=150
CAP_LOOP_LAG_BUSY_MS=400
CAP_MAX_SOCKETS=4000
CAP_MAX_ACTIVE_GAMES=500
CAP_RECOVER_MS=5000
CAP_RETRY_AFTER_MS=15000
```

Monitor `/health` or `/api/health`. The client polls the latter and also listens for Socket.IO `server:status` and `server:busy` events.

## Database migrations and seed

From `server/`:

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

Migrations add OAuth/social data, user-owned public quizzes, the game catalog and profile covers; later migrations retire the teacher/cashier roles and remove the car-racing catalog entries. Historical records are retained. Back up PostgreSQL before applying production migrations.

## Local development

```bash
# Terminal 1
cd server
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate dev
npm run dev

# Terminal 2
cd client
npm ci
npm run dev
```

Vite proxies API, upload and Socket.IO requests to the server. For root-level tests and an in-memory UI preview without database services, install the root tooling with `npm ci`, then use `npm test` or `npm run preview` from the repository root. Preview data and its simulated OAuth sessions are not production authentication.

## Scaling considerations

- Use PostgreSQL connection pooling/PgBouncer when the API needs many database connections.
- Use Redis for shared caching across server replicas. Presence/activity are already shared through MongoDB.
- Multiplayer room state remains in each Node process. Horizontal scaling of live games requires sticky Socket.IO routing and a deliberate shared-room-state/adapter strategy; a Redis Socket.IO adapter alone does not make in-memory game rooms portable.
- Run behind a TLS reverse proxy, set `trust proxy` correctly, and keep `CORS_ORIGINS` limited to the intended frontend origins.
- Use managed services or private networking for PostgreSQL, MongoDB and Redis. Do not expose database ports publicly.

## Security checklist

- [ ] Replace the development `JWT_SECRET` with a long random value.
- [ ] Register production OAuth callback URLs exactly and restrict allowed redirect origins.
- [ ] Set `ADMIN_OAUTH_EMAILS` to verified administrator emails only.
- [ ] Use HTTPS and secure cross-site cookies when the frontend/API are on different sites.
- [ ] Set production database credentials and private network rules.
- [ ] Configure upload limits and an image host or persistent upload volume.
- [ ] Apply migrations with a backup and verify `/health`, `/api/health`, OAuth sign-in, friend presence and Socket.IO after deployment.
