# SanKofa — Phase 1 backend

Digital rotating savings circles (ROSCA / Susu). This is the **Phase 1** backend:
a coordination layer that organizes the group, locks the payout order by vote,
tracks who has paid, and enforces the rules. **Money moves directly between
members** (Venmo/Zelle/bank) — the platform never holds funds, so it is not a
money transmitter. Phase 2 (custody via a BaaS partner) is scaffolded but
dormant.

See the architecture doc for the full design. This repo implements the buildable
Phase 1 target described there.

## Stack

- **NestJS** (TypeScript), one module per service.
- **PostgreSQL** via **Prisma** (system of record).
- **Redis + BullMQ** for scheduled jobs (reminders, period close) — optional in dev.

## Quick start

```bash
cp .env.example .env
npm install

# Start Postgres + Redis (needs Docker). Skips jobs if you don't set REDIS_URL.
npm run infra:up

npm run db:generate      # generate the Prisma client
npm run db:migrate       # create the schema (first run: names the migration)
npm run db:seed          # 3 verified users + a forming circle; prints their ids

npm run dev              # API on http://localhost:3000/api
```

> No Docker? Point `DATABASE_URL` at any Postgres 14+ instance.

## Auth

Every route is authenticated by a **global guard** (fail-closed — a new route is
protected unless explicitly marked `@Public()`, like `/health`). Two modes:

- **`AUTH_MODE=oidc`** (default in production) — verifies a Bearer JWT against the
  identity provider's JWKS (`Authorization: Bearer <token>`). Provider-agnostic:
  set `OIDC_ISSUER` (+ optional `OIDC_JWKS_URI`, `OIDC_AUDIENCE`) for Clerk,
  Auth0, or Cognito. A user's profile row is provisioned automatically on first
  authenticated request and linked to the token's `sub`; they start `unverified`
  (read-only) until KYC flips their status.
- **`AUTH_MODE=dev`** (local only) — trusts an **`x-user-id`** header so the API is
  exercisable without an IdP. The app **refuses to boot** if this is set while
  `NODE_ENV=production`.

Authorization is enforced per action in the services (`AccessService`): reads
require circle **participation**; contributing/chat require **active membership**;
closing a period and resolving disputes require the **organizer**. `x-user-id`
below assumes dev mode.

## The core loop (end to end)

Using the ids printed by the seed (`AMA`, `KOFI`, `ESI`, `CIRCLE`):

```bash
BASE=http://localhost:3000/api

# 1. Organizer proposes the payout order (defaults to join order)
curl -s -XPOST $BASE/circles/$CIRCLE/propose-order -H "x-user-id: $AMA" \
  -H 'content-type: application/json' -d '{}'
# -> returns the proposed CYCLE id

# 2. Every active member votes to approve. The last approval auto-locks the
#    cycle, builds one period per member, and opens period 0 for contributions.
for U in $AMA $KOFI $ESI; do
  curl -s -XPOST $BASE/cycles/$CYCLE/vote -H "x-user-id: $U" \
    -H 'content-type: application/json' -d '{"value":"approve"}'
done

# 3. View the locked cycle → grab period 0's id (index 0)
curl -s $BASE/cycles/$CYCLE -H "x-user-id: $AMA"

# 4. Each member marks their contribution paid (settled off-platform)
for U in $AMA $KOFI $ESI; do
  curl -s -XPOST $BASE/periods/$PERIOD0/mark-paid -H "x-user-id: $U"
done

# 5. Close the period → releases the pot to period 0's recipient and opens
#    period 1 for contributions. Add ?force=true to close on grace expiry.
curl -s -XPOST $BASE/periods/$PERIOD0/close -H "x-user-id: $AMA"

# 6. Recipient confirms they received the pot
curl -s -XPOST $BASE/periods/$PERIOD0/confirm-receipt -H "x-user-id: $AMA"
```

Other endpoints: `GET /users/me` (includes `arrears`), `POST /users/:id/verify-kyc`
(dev-only KYC stub), `POST /circles`, `POST /circles/:id/invites`,
`POST /circles/:id/accept`, `POST /circles/:id/swaps` + `POST /swaps/:id/accept|decline`,
`POST /periods/:id/settle-arrear`, `POST /periods/:id/defer`,
`POST /disputes` + `POST /disputes/:id/resolve-paid|resolve-unpaid`,
`POST /circles/:id/messages`, `GET /health`.

## Tests

Integration tests run the real service layer against a **dedicated test Postgres**
(`sankofa_test`), created and migrated automatically, reset between tests:

```bash
npm test          # needs Postgres running (npm run infra:up, or brew service)
```

Coverage focuses on the money path — vote-to-lock (unanimity / decline blocks),
close + payout math, grace-close (missed contributions + reputation docking),
cycle completion, idempotent/race-safe close, arrears + settlement, and defer —
plus the authorization matrix (participant reads, member mark-paid,
organizer-only close/invite, KYC gate). CI (`.github/workflows/ci.yml`) runs
build + tests on every push against a Postgres service container.

## Module map (`src/modules/`)

| Module | Status | Responsibility |
|---|---|---|
| `identity` | real | users, KYC status (Persona/Alloy = stub) |
| `circles` | real | create/join, invites, membership, terms |
| `rotation` | real | propose order, vote-to-lock, swaps |
| `cycles` | real | periods, mark-paid, close + payout, receipt confirm |
| `chat` | real | per-circle messages (WebSocket fan-out = TODO) |
| `disputes` | real | 3-day review window, resolve |
| `enforcement` | partial | flag missed, dock reputation (suspension = TODO) |
| `notifications` | stub | Expo/Twilio/email dispatch (logs only) |
| `payments` | stub | Plaid balance signal (P1) + BaaS ACH/ledger (P2) |
| `jobs` | scaffold | BullMQ reminders/close (needs `REDIS_URL`) |
| `audit` | real | append-only log of money-/rule-relevant actions |

## Money model

- Amounts are integer **minor units (cents)** end to end — no floats.
- A grace close releases only the **collected** pot; each unpaid member keeps an
  **outstanding arrear** (their `missed` contribution), surfaced as `arrears` on
  the user and settleable later via `POST /periods/:id/settle-arrear`.
- `close` is **idempotent and race-safe** (atomic compare-and-swap on period
  state; the pot is released exactly once). `mark-paid` is idempotent and only
  valid on a collecting period.

> **Open business decision (not encoded):** who absorbs the loss when a
> defaulter *never* settles an arrear. The debt stays open until settled or a
> future write-off policy resolves it — the code does not silently absorb it.
> The doc flags this as the single biggest risk; decide before beta.

## Remaining gaps (tracked, not shipped)

- **KYC** is a dev-only stub; wire the Persona/Alloy webhook to flip `kycStatus`.
- **Notifications, Plaid, and the Phase-2 ledger/ACH** are stubs.
- **Period close and missed-payment detection are manual endpoints**; the `jobs`
  module is where the scheduled versions belong.
- **Vote/lock races** aren't guarded as strictly as close (low-risk: unanimity
  is re-read each vote), and there's no explicit account **suspension** on
  repeat default yet.
