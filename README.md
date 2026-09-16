# Radar

A clone of Apple's internal Radar issue tracker — its actual domain model
(components, classification, state/substate, milestones, typed relationships,
CC lists) in a Linear-style interface, plus a global activity timeline.

Next.js 16 · React 19 · TypeScript · Tailwind v4 + shadcn (Base UI) ·
Prisma 7 · Neon Postgres · better-auth

---

## Getting started

```bash
npm install
cp .env.example .env     # then fill in your Neon URLs and a BETTER_AUTH_SECRET
npm run db:migrate       # apply migrations
npm run db:seed          # taxonomy only: 1 component, 1 milestone
npm run dev              # http://localhost:3000
```

Sign up at `/sign-up`. The six standard queues (My Open Radars, Assigned to Me,
Originated by Me, Watching, Unassigned, Recently Closed) are created for your
account the first time the sidebar loads.

## Getting the credentials

All of these are required — the app validates them at startup and refuses to
boot with a message naming whatever is missing, rather than failing later when
the first email tries to send.

### Neon (database)

1. [console.neon.tech](https://console.neon.tech) → **New Project**.
2. **Connection Details** → copy the **pooled** string (host contains
   `-pooler`) into `DATABASE_URL`.
3. Toggle off "Pooled connection" and copy the **direct** string into
   `DIRECT_URL`. Migrations need this one; pgbouncer can't run DDL.

### Gmail (email)

Gmail rejects your normal password over SMTP, so you need an app password —
which requires 2-Step Verification to be on.

1. [myaccount.google.com/security](https://myaccount.google.com/security) →
   turn on **2-Step Verification** if it isn't already.
2. Same page → **App passwords** (or go straight to
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
3. App name: `Radar` → **Create**. Copy the 16-character password — it's shown
   once.
4. Fill in:
   ```
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="587"
   SMTP_USER="you@gmail.com"
   SMTP_PASS="the 16 characters, spaces removed"
   SMTP_FROM="Radar <you@gmail.com>"
   ```

Gmail sends about 500 messages a day and rewrites the From header to your own
address, which is fine for a personal tracker. Check it works from
**Settings → Notifications → Send a test email**; that goes straight through
SMTP rather than the queue, so a bad password surfaces immediately.

Don't want real mail while developing? Set `EMAIL_TRANSPORT="json"` and every
message is rendered to the server console instead.

### Upstash (realtime)

1. [console.upstash.com](https://console.upstash.com) → **Create Database** →
   Redis. Pick the region closest to your Vercel region; the free tier is
   ample (10k commands/day).
2. On the database page, scroll to **REST API** and click **.env**.
3. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` across.

Use the read-write token. It stays server-side — the browser talks to our own
SSE endpoint, never to Upstash.

### Cron secret

Any random string; it's what Vercel Cron authenticates with.

```bash
openssl rand -hex 24
```

Required in production. The cron endpoints reject every request until it's set,
so an unconfigured deployment has closed endpoints rather than open ones.

## Notifications

Nineteen events across four categories — assignment, discussion, workflow,
planning — each deliverable in-app, by email, or both, per user. The catalog in
`src/lib/notifications/catalog.ts` is the single definition: the settings page
renders from it and the server filters on it, so a toggle can't mean two
different things.

Suppression is checked in a fixed order, and that order is a test rather than a
convention: actor → per-radar mute → global email switch → category toggle,
with `@mentions` overriding the last two.

`@all` in a comment reaches every active account rather than the radar's
followers — a separate reason from `@mention` precisely so it does *not*
inherit that override: a broadcast still answers to each reader's mute, their
category toggle and their global mail switch. The handle `all` is reserved so
no account can shadow it. The composer names the number of people before you
send.

Email goes through an outbox written in the same transaction as the
notification, so mail can neither be lost nor sent for a change that rolled
back. Sending happens in `after()` so it never delays a save, and because
that sweep claims the whole pending backlog rather than only the rows it just
created, a failed message is retried the next time anyone touches a radar.
`/api/cron/daily` is the backstop for stretches when nobody uses the app —
one job, because Vercel Hobby allows cron only once per day. Real-time uses
Upstash pub/sub behind an SSE relay, falling back to 20-second polling after
repeated stream failures.

When mail is not arriving, ask the deployment rather than guessing — the same
endpoint drains the queue and reports it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<host>/api/cron/email?verify=1"
```

`queue.byStatus` empty with `queue.notifications: 0` means fan-out is finding
nobody to tell, which is a different problem from mail that will not send.
Note that fan-out drops the actor, so a deployment with one account can never
notify anyone — the test button on `/settings/notifications` is the only path
that mails you directly.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on 127.0.0.1:3000 |
| `npm run build` | `prisma generate && next build` |
| `npm run build:check` | Webpack build (works where Turbopack can't bind a port) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests only — no database needed |
| `npm run test:integration` | Audit-trail and concurrency tests against the dev database |
| `npm run test:all` | Both |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:status` | Applied / pending migrations |
| `npm run db:reset` | Drop the schema, re-apply everything, re-seed |
| `npm run db:seed` | Idempotent taxonomy seed |
| `npm run db:sql "…"` | Ad-hoc SQL |

## How it's put together

**`state` + `substate` are the only status columns.** Radar has no resolution
field — what looks like one is the substate vocabulary of the `CLOSED` state, so
`Closed / Duplicate` is a single cell in a (state × substate) matrix. That table
lives in `src/lib/radar/state-machine.ts` and drives the state picker, the close
dialog, the board's legal drop targets, and server-side validation from one
definition.

**One audited write path.** Every edit — inline field, form save, board drag,
bulk edit — goes through `applyUpdate` in `src/server/radars/mutations.ts`,
inside a transaction: drop no-ops, validate the transition, apply derived
effects, check the optimistic-concurrency `version`, then write the row and one
`ActivityEvent` with an N-row `FieldChange` diff. A Prisma extension in
`src/lib/db.ts` throws on any `radar.update` that didn't declare an actor, and
blocks hard deletes outright — so the history can't quietly grow holes. The
integration suite proves it: apply 21 patches, fold every `FieldChange` back
over the creation snapshot, assert it reproduces the current row.

**One field registry.** `src/lib/search/fields.ts` declares each field once —
label, kind, operators, options, Prisma `where`, `orderBy`, table column. That
single entry drives the filter bar, URL parsing and validation, the query, the
sort, and the result columns. Filters are AND-of-ORs and live entirely in the
URL, so every list view is shareable and a saved query is just its canonical
query string.

**Relations are stored once.** Only canonical directions exist as rows
(`DUPLICATE_OF`, `BLOCKS`, `PARENT_OF`, …); the inverse reading is produced by
`invertRelation()`. Mirrored rows would double writes and could disagree.

## Deploying

`vercel.json` runs `prisma generate && prisma migrate deploy && next build`.
Set `DATABASE_URL` (pooled), `DIRECT_URL` (unpooled), `BETTER_AUTH_SECRET`, and
`BETTER_AUTH_URL` in the Vercel project.

## Working inside a restricted network

`STATUS.md` documents the constraints this was built under — no port binding, an
allowlist-only proxy on 443 — and the workarounds that are now load-bearing:
`scripts/migrate.mjs` applies migrations over Neon's WebSocket driver while
staying compatible with `prisma migrate deploy`, and the driver is handed an
HTTPS proxy agent when one is configured.
