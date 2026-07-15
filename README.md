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

## Auth (dev)

Real Phase 1 auth is a managed provider (Clerk/Auth0/Cognito) + JWT. For the
scaffold, protected routes read an **`x-user-id`** header — pass a seeded user id.

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

Other endpoints: `POST /users` (sign-up), `POST /users/:id/verify-kyc` (KYC stub),
`POST /circles`, `POST /circles/:id/invites`, `POST /circles/:id/accept`,
`POST /circles/:id/swaps` + `POST /swaps/:id/accept|decline`,
`POST /disputes`, `POST /circles/:id/messages`, `GET /health`.

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

## Known shortcuts (hackathon scope)

- Dev auth is an `x-user-id` header, not real JWT verification.
- KYC, notifications, Plaid, and the Phase-2 ledger/ACH are stubs.
- Period close and missed-payment detection are manual endpoints; the `jobs`
  module is where the scheduled versions belong.
- Close/dispute-resolve authorization is loose (any authed member); tighten to
  organizer/admin before real use.
