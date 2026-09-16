# Radar clone — build status

**Complete.** Every surface in the approved plan is built. Last verified
2026-09-12:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npm run test` (unit) | 24 passed |
| `npm run test:integration` | 8 passed, against the real dev database |
| `npm run build:check` | 18 routes compiled |
| better-auth smoke (`scripts/auth-smoke.mts`) | sign-up, handle derivation, sign-in, session cookie |

Architecture and runbook: `README.md`. Original plan:
`~/.claude/plans/quizzical-mapping-stearns.md`

---

## Routes

```
/sign-in  /sign-up
/                         → My Open Radars
/inbox                    notifications, unread badge, mark read
/radars                   filters · sort · group · columns · bulk edit · save query
/radars/new               full problem report form
/radars/[number]          detail: inline fields, description, activity, relations, helpers, CC
/board                    drag between states
/timeline                 global activity stream, day grouped, actor filter
/milestones  /milestones/[id]   progress + burnup chart
/components               component tree
/settings/{profile,notifications,components,milestones}
```

## Verified by tests, not just by eye

- **The audit invariant** — 21 patches applied, then every `FieldChange` folded
  back over the creation snapshot reproduces the current row exactly. Removing a
  single field from the differ makes this fail, so it has teeth.
- No event is written for a patch that changes nothing; a 3-field patch produces
  exactly one event with three changes.
- A bare `db.radar.update()` outside `withAudit()` throws; `radar.delete` always
  throws.
- Two racing writers on the same `version`: exactly one succeeds, the other gets
  `StaleRadarError`.
- `closeAsDuplicate` writes the FK, the edge, the state, the substate and
  `resolvedAt` together — or nothing.
- Full (state × substate) matrix: every legal pair accepted, every illegal one
  rejected.
- Search URL codec round-trips under `fast-check`; malformed input degrades to a
  chip, never a 500.
- Relation inversion, symmetric normalization, and cycle detection (including
  termination on an already-cyclic graph).

## Still needs you

1. **Browser pass.** I can't bind ports in this sandbox, so I have never seen
   the app render. Everything below the UI is exercised by tests; the pixels are
   unverified.
2. **Deploy.** `github.com` is blocked here, so pushing to
   `github.com/mThanuj/radar-clone.git` is yours. `vercel.json` is ready; set
   `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`.
3. **Nothing is committed yet.** `create-next-app` initialized git; I have made
   no commits, since you didn't ask for any.

## Deliberate design calls (not omissions)

- Filters are AND-of-ORs. Nested boolean groups force an opaque blob into the
  URL and are what make filter builders unpleasant.
- Text search is trigram `ILIKE`, not `tsvector`. A generated tsvector column
  forces the whole list query into raw SQL, duplicating the filter mapper.
- No attachments, per your call — text and Markdown only.
- Notifications are in-app only; no mail service is configured.

## Environment constraints

See the table in `README.md` under "Working inside a restricted network", and the
memory note `radar-clone-sandbox-constraints`. Short version: no port binding
(you run `npm run dev`), allowlist-only proxy on 443, so migrations go through
`scripts/migrate.mjs` over Neon's WebSocket driver, and TS scripts run as
`node --import tsx/esm file.mts` rather than via the tsx CLI.

### After every `npm install`, normalize the lockfile

```bash
npm run lockfile:normalize
```

Installing from inside the corp network records internal Artifactory mirror URLs
(`npm.apple.com`, `artifacts.apple.com`) in `package-lock.json`. GitHub Actions
runners can't resolve those hosts, so `npm ci` fails with `ENOTFOUND` — and there
is no reason to publish an internal hostname in a public repo. The script
rewrites the `resolved` URLs to `registry.npmjs.org`; the mirrors serve identical
tarballs under identical paths, so `integrity` hashes are untouched and still
verify.

Consequence: `npm ci` no longer works from inside the sandbox, because
`registry.npmjs.org` is not allowlisted here. Use `npm install` locally (it
follows your configured registry), then re-run the normalize script before
committing.
