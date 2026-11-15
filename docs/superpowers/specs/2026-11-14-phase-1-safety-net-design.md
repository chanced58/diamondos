# Phase 1 — Safety Net: Design

Date: 2026-11-14. Parent: `docs/spring-season-readiness-roadmap.md`.

## Intent

Before the spring season (first game about April 2027), the owner needs to find out about
failures without waiting for a coach to call, and needs the background jobs the app already
depends on to actually run. Today nothing checks a pull request, nothing records an error, a
render error shows a framework default page, and the three background jobs are not scheduled
anywhere: production has no webhook on `game_events`, no `pg_cron`, no `pg_net`, and
`pitch_counts` has 0 rows against 4,005 recorded pitches.

Every later phase changes scoring, stats and access rules. This phase goes first so those changes
are checked by CI and their failures are visible.

## Goals

1. Every pull request runs type-check, lint, unit tests, the Deno tests and the database tests.
2. Errors on web, mobile and edge functions are written to one place the owner can read.
3. A render error on web or mobile shows a page that says what happened and how to continue,
   and is recorded.
4. The league snapshot rebuild and the practice reminder dispatch run on their own, defined by a
   migration in this repo. The pitch-count trigger is built and tested the same way but stays
   switched off in production until Phase 3 has fixed the count and backfilled it (owner's
   decision: coaches should not see partial totals in between).
5. A phone on an out-of-date app version is told to update.
6. Required configuration is documented in one place, and a missing value is reported instead
   of silently producing wrong behavior.

## Non-goals

- A monitoring vendor (Sentry or similar) and any alerting. The owner chose log-only.
- Over-the-air updates. The owner chose builds only.
- Blocking old app versions. The owner chose a warning only.
- Fixing what the jobs compute: pitch-count math, rest days, the ruleset, backfilling
  `pitch_counts` (Phase 3); push for messages and schedule changes (Phase 5).
- Rate limiting, CSP and other web hardening (Phase 4).

## Anti-goals

- A scored play must never fail, slow down or be lost because of anything added here. The
  `game_events` trigger and the mobile error reporter must be unable to break scoring.
- Error reporting must never throw into the code path it is reporting on.
- No secret value is committed, placed in a migration, or written into the error log.

## Constraints

- Production Supabase (`diamondos-prod`) is the only environment. Schema changes go through a
  migration file and are applied to production only after the owner confirms.
- The web app runs on Render as a long-lived Node server (`output: 'standalone'`).
- The mobile WatermelonDB schema is not changed in this phase (a version bump needs a migration
  and a wipe risk; nothing here needs a new table on the device).
- Light theme must stay pixel-identical; new web pages under `(app)` use the themed classes, and
  public pages render Light.
- GitHub Actions runners have Docker, so the local Supabase stack can run there even though it
  is not used on the owner's machine.

## Approaches

**Scheduling the jobs**

| Option | Trade-off |
|---|---|
| Supabase `pg_cron` + `pg_net`, in a migration (**chosen by the owner**) | Lives in the repo and deploys with migrations; no extra service or cost. Needs two secrets stored in Supabase Vault by hand once. |
| Render cron services via `render.yaml` | Each cron is a separately billed service, and the pitch-count trigger still has to live in the database, so the jobs end up in two places. |
| GitHub Actions `schedule` | Free, but runs are routinely late by minutes, too loose for a 5-minute reminder window. |

**Recording errors**

| Option | Trade-off |
|---|---|
| Log-only: an `app_error_log` table plus structured console logs, read from an admin page (**chosen by the owner**) | No vendor, no account, no cost. Nothing notifies the owner; they have to look. No stack-trace grouping or release tracking. |
| Sentry on all three surfaces | Alerts and grouping, but a new account, three DSNs, a native rebuild and a dependency. Can be added later behind the same `reportError` call sites. |

**Out-of-date app versions**

| Option | Trade-off |
|---|---|
| Dismissible banner on Home (**chosen by the owner**) | Never interrupts anyone; an old app may still hit errors against a newer server. |
| Blocking screen except while scoring | Guarantees compatibility but can lock a coach out at a bad moment. |

The remaining choices below were not put to the owner. They are the author's calls and are
marked **(call)**.

## Design

### 1. Continuous integration

One workflow, `.github/workflows/ci.yml`, on `pull_request` and on `push` to `main`, with three
jobs that run in parallel:

- **checks** — Node 20, pnpm 9.0.0, `pnpm install --frozen-lockfile`, then `pnpm type-check`,
  `pnpm lint`, `pnpm test`. Turbo's local cache is restored with `actions/cache`.
- **edge-functions** — `deno test` over `supabase/functions` (three test files today).
- **database** — install the Supabase CLI, run
  `node supabase/tests/prepare-isolated-database.mjs <tmp dir>`, start the local database from
  that directory, apply all migrations, and run `supabase test db` over
  `supabase/tests/database`. This is the first place every migration is replayed from scratch,
  so it may expose migrations that do not replay cleanly. **(call)** If that happens the job is
  added as non-blocking (`continue-on-error`) with the failures listed in the PR description,
  and fixing the replay is a follow-up, not part of this phase.

`pnpm format:check` is included in **checks** only if it passes on `main` today **(call)**;
reformatting the repo is not part of this phase.

Branch protection (require the three jobs before merging to `main`) is a GitHub setting. It is
listed in the production setup runbook as a step for the owner, not done by code.

### 2. Error log

**Table** `public.app_error_log` (new migration):

| Column | Notes |
|---|---|
| `id` uuid pk, `occurred_at` timestamptz default now() | |
| `source` text | `web`, `web_client`, `mobile`, `edge`, `db` (check constraint) |
| `area` text | Short stable label, e.g. `sync.push`, `finalize`, `league.refresh`, `push.send`, `cron.rebuild`, `render` |
| `message` text | Truncated to 2,000 characters |
| `details` jsonb | Ids and context; truncated to 8 KB; never tokens, emails or message bodies |
| `user_id`, `team_id`, `game_id` uuid null | No foreign keys, so the log outlives deleted rows |
| `app_version` text null, `device_id` text null | Mobile only |

RLS is enabled with no policies for `anon` or `authenticated`: only the service role reads and
writes. Indexes on `occurred_at desc` and `(source, occurred_at desc)`.

**Writers**

- **Web server** — `reportError(area, error, context)` in `apps/web/src/lib/errors/report-error.ts`.
  It writes one structured `console.error` line (so Render logs have it even if the insert fails)
  and inserts a row with the service-role client. It never throws and is not awaited on
  user-facing paths. Wired into the places that swallow errors today:
  `refreshLeagueGame` (`lib/league-games/refresh.ts`), the snapshot recompute after finalize
  (`lib/games/finalize.ts`), `sendPush` (`lib/notifications/send-push.ts`), the per-league catch
  in the cron route, and `serviceResponse` when a service returns `failed`.
- **Web browser** — the error pages (section 3) POST to `POST /api/client-errors`. **(call)** The
  route accepts signed-in users only (session cookie) and answers 204 to everyone else without
  writing, so it cannot be used to flood the table before rate limiting exists (Phase 4).
- **Mobile** — `reportClientError(area, error, context)` in `apps/mobile/src/lib/error-report.ts`
  queues entries in memory and in the WatermelonDB local-storage register `errors.pending`
  (same mechanism as `sync.clockHeldEvents`; no schema change), capped at 50 entries, oldest
  dropped. It flushes through `apiClient` to `POST /api/m/v1/client-errors` (bearer auth, body is
  an array of at most 50) after a successful sync and on app foreground. Failure to flush is
  silent; entries stay queued. Called from: the non-offline branch of `SyncProvider`'s catch,
  a failed finalize in `sync-engine.ts`, a throw from `recordEvent`, and the error boundaries.
  The server stamps `user_id` from the token and rejects entries older than 7 days.
- **Edge functions** — `supabase/functions/_shared/report-error.ts`, same shape, used in the
  catch paths of `pitch-count-calculator`, `practice-notifications-dispatch` and
  `push-notifications`.
- **Database** — the trigger and cron wrappers in section 4 insert a row with `source = 'db'`
  when their configuration is missing.

Both client routes follow the existing service pattern: a zod schema in
`packages/shared/src/validation/client-errors.ts`, a service in
`apps/web/src/lib/services/errors/`, thin routes.

**Reader** — `/admin/errors`, platform admins only, under the existing `(app)/admin` section:

- The newest 200 rows from the last 7 days, filterable by source and area, each row expandable
  to its details.
- A **Jobs** panel read through a `SECURITY DEFINER` function `admin_job_health()` (service role
  only) over the `job_runs` table described in section 4. For the snapshot rebuild and the
  practice dispatch it shows the last run's time, HTTP status and whether it succeeded (2xx),
  plus the last success. For the pitch-count trigger it shows whether the trigger is enabled
  and, over the last 24 hours, how many calls were made and how many failed.
- A count of rows in the last 24 hours in the admin navigation, so a glance shows whether
  anything is wrong.

**Retention** — a daily `pg_cron` job deletes rows older than 30 days **(call)**.

### 3. Error pages

**Web**

- `app/global-error.tsx` and `app/error.tsx`: "Something went wrong", a **Try again** button
  (`reset()`), and a link home. Rendered Light.
- `app/(app)/error.tsx`: the same inside the signed-in shell, themed.
- `app/(app)/games/[gameId]/score/error.tsx`: scorer-specific copy — plays already recorded are
  saved, **Reload scorer** resumes from the saved log.
- `app/not-found.tsx`: branded 404 with a link home.
- `app/(app)/loading.tsx`: a neutral skeleton, so navigations stop looking frozen.

Each error page reports once on mount through `/api/client-errors` with `area = 'render'`, the
pathname and Next's `digest`.

**Mobile**

- An exported `ErrorBoundary` in `app/_layout.tsx` (expo-router's convention): the message,
  **Try again** (`retry`), and a line that plays recorded on this phone are saved.
- A second one on the scorer route (`schedule/games/[gameId]/score.tsx`) with scorer copy, so a
  crash in the scorer returns to the scorer rather than the root.
- Both call `reportClientError('render', …)`. They follow the surrounding `ThemeScope`; the
  scorer's renders in the scorer's Light scope.

### 4. Background jobs

One migration turns on the extensions, defines the helpers, the trigger and the schedules.
Because the database cannot hold the secrets in a migration, configuration lives in Supabase
Vault and every job degrades to "log and skip" when it is missing.

**Configuration (Vault, set once by the owner in the SQL editor)**

| Vault name | Value |
|---|---|
| `job_functions_base_url` | `https://<project-ref>.supabase.co/functions/v1` |
| `job_web_base_url` | The Render web origin |
| `job_internal_secret` | Random, 32+ characters; also set as the edge-function secret `INTERNAL_JOB_SECRET` |
| `job_cron_secret` | The same value as the web app's `CRON_SECRET` |

`private.job_config(name text)` (`SECURITY DEFINER`, executable only by `postgres` and the
service role) reads `vault.decrypted_secrets`. `private.job_http(job, method, url, headers,
body, timeout_ms)` calls `pg_net`, and when any needed config value is missing inserts one
`app_error_log` row (`source = 'db'`, `area = 'job.config'`) and returns without calling.

**Job runs** — `pg_net` is asynchronous and keeps responses only about six hours in
`net._http_response`, with no job name, and `cron.job_run_details` only records that a request
was queued. So `private.job_http` inserts a row into `public.job_runs` (`id`, `job`,
`request_id`, `requested_at`, `status_code`, `error`, `completed_at`; service role only), and a
`collect-job-runs` cron job every 5 minutes copies the status or error for finished requests
from `net._http_response`. A request with no response after 10 minutes is marked failed. A
failed scheduled run also writes one `app_error_log` row (`area = 'job.<name>'`). `job_runs` is
pruned after 30 days by the same daily job as the error log. **(call)**

**Pitch-count trigger**

`AFTER INSERT ON game_events FOR EACH ROW WHEN (new.event_type = 'pitch_thrown')` calls
`private.notify_pitch_count()`, which posts
`{ "type": "INSERT", "table": "game_events", "record": <row> }` to
`{job_functions_base_url}/pitch-count-calculator` with header `x-internal-secret`.

- `pg_net` queues the request and returns immediately, so the insert is not delayed by the
  function.
- The function body is wrapped in `exception when others` that logs to `app_error_log` and
  returns `new`, so no failure in it can reject a play.
- The migration creates the trigger and then disables it
  (`alter table game_events disable trigger …`). A Phase 3 migration enables it after the count
  fix and backfill. The database test enables it inside its own transaction to exercise it.
- `pg_net` does not retry. A failed call is corrected by the pitcher's next pitch (the function
  recounts the whole outing), but the last pitch of an outing would not be. Phase 3 adds a
  recount when a game is finalized; nothing is added for it here because the trigger is off.
- Once it is on, compliance pushes start reaching coaches. A phone syncing a
  backlog would otherwise send alerts for games played days ago, so **(call)**
  `pitch-count-calculator` skips the push (still writes the count) when the event's
  `occurred_at` is more than 6 hours old.
- Existing pitches are not backfilled here; Phase 3 does that after fixing the count.

**Schedules**

| Job name | Schedule | Call |
|---|---|---|
| `rebuild-league-snapshots` | `0 */6 * * *` | `GET {job_web_base_url}/api/cron/rebuild-league-snapshots`, `Authorization: Bearer {job_cron_secret}`, timeout 5 minutes |
| `practice-notifications-dispatch` | `*/5 * * * *` | `POST {job_functions_base_url}/practice-notifications-dispatch`, `x-internal-secret`, timeout 30 seconds |
| `collect-job-runs` | `*/5 * * * *` | SQL only |
| `prune-logs` | `15 9 * * *` | SQL delete of old `app_error_log` and `job_runs` rows |

`cron.schedule` is called by name, so re-running the migration updates rather than duplicates.

**Edge function authorization**

`supabase/functions/_shared/require-internal.ts` accepts a request when the `x-internal-secret`
header equals `INTERNAL_JOB_SECRET`. Every caller sends it: the database jobs, the web's
`sendPush` (so `INTERNAL_JOB_SECRET` is also a Render variable), and the function-to-function
`invoke` calls. As a fallback it also accepts a bearer token equal to the function's own
service-role key, so a web deploy that lags the function deploy keeps working; the header is
the primary path because Render's key may be a different format or rotated **(call)**.
Anything else gets 401. Applied to `pitch-count-calculator`,
`practice-notifications-dispatch` and `push-notifications`; this also closes the "anyone with
the public key can send a push" finding listed under Phase 4. If `INTERNAL_JOB_SECRET` is unset
the header path is refused, never treated as a match.

`supabase/config.toml` gains `[functions.<name>] verify_jwt = false` for those three, since the
function now does its own check and the database caller has no JWT. That file only takes effect
on a CLI deploy; the functions are deployed through the Supabase MCP tool with the flag set
explicitly, and the runbook says so for anyone deploying another way.

**Cron route** — unchanged in behavior. Its comment and `.env.example` stop mentioning Vercel
Cron, and `apps/web/vercel.json` is deleted.

### 5. Out-of-date app warning

- The app is distributed through TestFlight only. `apps/mobile/app.json` `version` becomes the
  release version and is raised for every TestFlight release that users should move to (it has
  been `1.0.0` throughout). **(call)** This phase ships as `1.1.0`.
- `MIN_SUPPORTED_MOBILE_VERSION` in `packages/shared/src/constants/app-version.ts`, with a pure
  `compareAppVersions(a, b)` beside it. Raising it takes a web deploy **(call)**; a database
  setting was considered and left out because a wrong value there would nag every user with no
  review.
- `GET /api/m/v1/me` adds an optional `minSupportedAppVersion` and `appUpdateUrl` to its response
  (`meResponseSchema`), so the app gets them from the bootstrap call it already makes and
  caches. `appUpdateUrl` is a constant beside the minimum version, today the TestFlight link;
  sending it from the server lets it change to the App Store later without a new build
  **(call)**.
- `apiClient` sends `X-App-Version` on every request (from `expo-constants`; no new native
  module). The server records it on client error reports and otherwise ignores it.
- When the running version is below the minimum, Home shows a banner above its content:
  "This version of DiamondOS is out of date. Update to keep everything working." with an
  **Update** button opening `appUpdateUrl` (TestFlight) and a dismiss control.
  Dismissal lasts until the app is next cold-started. The banner never appears in the scorer.
- Builds already installed do not have this code and show nothing; the warning takes effect from
  the first build that includes it.
- CLAUDE.md records the compatibility rule this relies on: within `/api/m/v1`, responses only
  gain optional fields and requests only gain optional inputs. A breaking change needs a new
  route or prefix, or waits until the minimum version has been raised past every build that
  uses the old shape.

### 6. Configuration

- **Invite links** — the four places that fall back to
  `NEXT_PUBLIC_SUPABASE_URL.replace('.supabase.co', '.vercel.app')`
  (`admin/leagues/actions.ts`, `admin/leagues/create/actions.ts`, `admin/create-team/actions.ts`,
  `api/admin/invite-league-staff/route.ts`) and `appUrl()` in
  `lib/services/members/team-invitations.ts` use the existing helper in `lib/auth/app-url.ts`,
  which reads `NEXT_PUBLIC_APP_URL` or `APP_URL`. In production, when both are unset the helper
  makes the action fail with a clear message and
  reports it, instead of emailing a link to a domain the owner does not control.
- **Startup check** — `apps/web/src/instrumentation.ts` checks the required variables once at
  boot and calls `reportError('config', …)` for each missing one. **(call)** It does not stop the
  server: a missing optional key should not take the site down.
- **`.env.example`** and the CLAUDE.md table list every variable the code reads, including
  `NEXT_PUBLIC_APP_URL`, `ICS_FEED_BASE_URL`, `GOOGLE_MAPS_SERVER_API_KEY`, `RESEND_API_KEY`,
  `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `ICS_FEED_SECRET` and the new
  `INTERNAL_JOB_SECRET`.
- **Runbook** — `docs/superpowers/runbooks/production-setup.md`: Render environment variables,
  the four Vault secrets with the SQL to store them, edge-function secrets and deploy commands,
  branch protection, and how to read `/admin/errors` and the Jobs panel.

### 7. Housekeeping

- CLAUDE.md: tests and CI status, hosting (Render, not Vercel), migration count, the new
  glossary entries (**ErrorLog**, **BackgroundJobs**, **AppVersionWarning**), the new variables.
- `apps/web/src/middleware.ts`: the stale protected-route list is replaced by the shared
  `THEMED_PATH_PREFIXES` list so it cannot drift from the `(app)` folders again **(call)**.
- Delete `supabase/all_migrations.sql` and `supabase/fix_rls_policies.sql` (stale since March
  2026, dangerous if run) after confirming nothing references them.
- `DiamondOS Revamp.zip` and `preview.html` at the repo root look like leftovers. They are left
  alone unless the owner says to remove them.

## Rollout

Each step is its own PR and can ship alone.

1. **CI.** No production effect.
2. **Error log and error pages.** One migration (new table only). Web deploy.
3. **Background jobs.** In order: the owner sets `INTERNAL_JOB_SECRET` on Render and as an
   edge-function secret, and the four Vault secrets; the web is deployed (so `sendPush` sends
   the header); the three edge functions are redeployed; the migration is applied. Applied
   early, the jobs log "config missing" and skip, which is harmless. Verified from the Jobs
   panel: a successful rebuild and dispatch, and the pitch-count trigger shown as off.
4. **Version warning.** Web deploy, then an iOS build (`1.1.0`) that also carries the mobile
   error reporter and error boundaries.
5. **Configuration and housekeeping.**

Rollback for step 3 is `cron.unschedule` for the two HTTP jobs. Push from the web keeps working
through the function redeploy by either the header or the service-role fallback.

## Testing

- Unit: `reportError` never throws and truncates; the client-error services validate, cap and
  stamp the user; the mobile queue caps at 50, survives a failed flush and drops nothing on
  success; `compareAppVersions`; the banner's show/hide decision; the app-URL helper in
  production with and without the variable; `meResponseSchema` accepts a response with and
  without the new field.
- Deno: `require-internal` accepts the secret header and the service-role bearer, refuses the
  anon key, a wrong secret, and any header when the secret is unset; the 6-hour alert cutoff.
- Database (`supabase/tests/database`): inserting a `pitch_thrown` event succeeds with no Vault
  secrets present and, with the trigger enabled for the test, leaves one `job.config` row; a
  non-pitch insert queues nothing; the trigger is disabled after the migration; the four cron
  jobs exist with the expected schedules; `job_runs` and `app_error_log` are unreadable to `authenticated`.
- By hand after step 3: the Jobs panel showing a successful rebuild and dispatch, and a test
  push from the web still arriving.

## Left to the builder

- The exact GitHub Actions for pnpm, Deno and the Supabase CLI, and cache keys.
- Visual design of the error pages and the admin page, within the existing admin look.
- Whether `private` already exists as a schema or a different non-exposed schema is in use.
- The `pg_net` timeout parameter name and limits in the version Supabase installs, and whether a
  5-minute timeout is honored; if not, the cron route is changed to start the rebuild and answer
  202, since the Render server keeps running after the response.
- Whether `meResponseSchema` on already-shipped builds strips unknown keys (expected) or is
  strict; if strict, the new field goes on a new `GET /api/m/v1/app-config` route instead.
