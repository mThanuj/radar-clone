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
npm run db:seed          # taxonomy only: 1 component, 1 milestone, 10 keywords
npm run dev              # http://localhost:3000
```

Sign up at `/sign-up`. The six standard queues (My Open Radars, Assigned to Me,
Originated by Me, Watching, Unassigned, Recently Closed) are created for your
account the first time the sidebar loads.

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
