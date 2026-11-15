# Production setup

What the owner sets by hand for the Phase 1 safety net (error log, background jobs, app version
warning, CI), and how to run it afterwards. Design: `docs/superpowers/specs/2026-11-14-phase-1-safety-net-design.md`.

Production is the only Supabase environment (`diamondos-prod`). The web app runs on Render.
No secret value goes into this repo, a migration or the error log.

## First-time rollout, in order

Each step is safe on its own; applied early, the jobs log one `job.config` row and skip the call.

- [ ] Generate `INTERNAL_JOB_SECRET` (random, 32+ characters, e.g. `openssl rand -hex 32`).
- [ ] Set it on Render (web service environment) and as an edge-function secret
      (`supabase secrets set INTERNAL_JOB_SECRET=<value>`, or Dashboard → Edge Functions → Secrets).
- [ ] Store the four Vault secrets (see **Supabase Vault secrets**).
- [ ] Deploy the web, so `sendPush` sends the `x-internal-secret` header.
- [ ] Redeploy `push-notifications`, `practice-notifications-dispatch` and `pitch-count-calculator`
      with `verify_jwt` false (see **Edge-function secrets and deploy**).
- [ ] Apply `20261114000000_app_error_log.sql` and `20261114000001_background_jobs.sql`, then set
      `supabase_migrations.schema_migrations.version` on each applied row to its file's timestamp
      (`20261114000000`, `20261114000001`), since the MCP tool records the apply time instead.
- [ ] Verify: `select * from admin_job_health();` shows a successful `rebuild-league-snapshots`
      and `practice-notifications-dispatch` run (allow up to six hours for the rebuild, or call the
      cron route once by hand), and `pitch-count-calculator` as off.
- [ ] Send a test push from the web and confirm it arrives.

Rollback for the jobs: `select cron.unschedule('rebuild-league-snapshots');` and
`select cron.unschedule('practice-notifications-dispatch');`.

## Render environment variables

Checked at boot by `apps/web/src/instrumentation.ts` (`apps/web/src/lib/env/required-env.ts`). A
missing **required** name writes a `config` row to the error log; a missing **recommended** name
logs a warning. Neither stops the server.

Required:

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — every Supabase call fails without it.
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — sign-in and every signed-in page fail.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — service-role reads and writes fail: the mobile API, admin pages,
      the error log, finalize and league snapshots.
- [ ] `NEXT_PUBLIC_APP_URL` (or `APP_URL`) — invitations are refused ("Invitations are
      unavailable: the site address is not configured.").
- [ ] `CRON_SECRET` — the league snapshot rebuild route refuses the scheduler. Same value as the
      Vault `job_cron_secret`.
- [ ] `INTERNAL_JOB_SECRET` — pushes from the web fall back to the service-role bearer, and fail if
      that key differs from the function's own.

Recommended:

- [ ] `RESEND_API_KEY` — no emails (invitations, notifications).
- [ ] `ANTHROPIC_API_KEY` — AI practice plans, summaries and scouting cards fail.
- [ ] `GOOGLE_MAPS_SERVER_API_KEY` — the mobile venue search answers 503; venues save without
      coordinates.
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — the web address autocomplete is off.
- [ ] `ICS_FEED_SECRET` — calendar subscription links cannot be signed.
- [ ] `ICS_FEED_BASE_URL` — optional override; unset derives the feed URL from the Supabase URL.

## Supabase Vault secrets

Run once in the SQL editor. `private.job_config` reads them; a missing one logs a `job.config`
row and skips the call.

- [ ] `select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'job_functions_base_url');`
- [ ] `select vault.create_secret('https://<render web origin>', 'job_web_base_url');`
- [ ] `select vault.create_secret('<INTERNAL_JOB_SECRET value>', 'job_internal_secret');`
- [ ] `select vault.create_secret('<CRON_SECRET value>', 'job_cron_secret');`

To change one later: `select vault.update_secret(id, '<new value>') from vault.secrets where name = '<name>';`

## Edge-function secrets and deploy

- [ ] Edge-function secrets include `INTERNAL_JOB_SECRET` (same value as Render) and
      `EXPO_ACCESS_TOKEN`.
- [ ] `push-notifications`, `practice-notifications-dispatch` and `pitch-count-calculator` are
      deployed with `verify_jwt` **false**, however they are deployed: the Supabase MCP
      `deploy_edge_function` with `verify_jwt: false`, or
      `supabase functions deploy <name> --no-verify-jwt`. `supabase/config.toml` sets it only for a
      CLI deploy from the repo. They check the caller themselves: header `x-internal-secret` equal
      to `INTERNAL_JOB_SECRET`, or a bearer equal to the service-role key; anything else gets 401.
- [ ] After a deploy, confirm the function's settings show JWT verification off; with it on, the
      database jobs get 401 and the Jobs panel shows the failure.

## GitHub branch protection

- [ ] On `main`, require the status checks `checks`, `edge-functions` and `database`
      (`.github/workflows/ci.yml`) before merging.
- [ ] The `database` job pins the Supabase CLI to 2.84.2 (newer CLIs reject the `[inbucket]`
      section). Raise it only together with a `config.toml` that the new CLI accepts.

## Reading `/admin/errors` and the Jobs panel

Platform admins only. The admin index shows the error count for the last 24 hours.

- [ ] The table lists the newest 200 rows from the last 7 days; filter by source (`web`,
      `web_client`, `mobile`, `edge`, `db`) and area (e.g. `finalize`, `sync.push`, `push.send`,
      `cron.rebuild`, `render`, `config`, `job.config`). Expand a row for its details (ids and
      context; sanitized, no tokens or emails).
- [ ] Rows are kept 30 days (`prune-logs`, daily).
- [ ] Jobs panel (`admin_job_health()`): for the snapshot rebuild and the practice dispatch, the
      last run, its result (HTTP status, or the error) and the last success. A request with no
      response after 10 minutes is marked failed. For `pitch-count-calculator`: whether the
      `game_events_notify_pitch_count` trigger is on (it stays **off** until Phase 3) and its calls
      and failures in 24 hours.
- [ ] A `job.config` row means a Vault secret is missing. A `job.<name>` row is a failed run.
- [ ] If `rebuild-league-snapshots` shows "timed out" although Render's logs show the rebuild
      finished, the follow-up is to make the cron route answer 202 and run the rebuild in the
      background.

## Turning a job off

- [ ] `select cron.unschedule('<name>');` with `rebuild-league-snapshots`,
      `practice-notifications-dispatch`, `collect-job-runs` or `prune-logs`.
- [ ] To bring it back, re-run its `cron.schedule` call from
      `supabase/migrations/20261114000001_background_jobs.sql`.

## Raising the minimum app version

- [ ] Ship the new TestFlight build first and wait until it is available to testers.
- [ ] Then edit `MIN_SUPPORTED_MOBILE_VERSION` in `packages/shared/src/constants/app-version.ts`
      and deploy the web. Builds below it show a dismissible update banner on Home (never in the
      scorer); nothing is blocked.
- [ ] `MOBILE_APP_UPDATE_URL` (today `itms-beta://`, TestFlight) is the banner's link; change it
      there when the app moves to the App Store.
- [ ] Within `/api/m/v1`, responses only gain optional fields and requests only gain optional
      inputs. A breaking change needs a new route, or waits until the minimum is past every build
      that uses the old shape.

## CodeRabbit CLI

- [ ] If `~/.local/bin/coderabbit review` reports an authentication error, run
      `coderabbit auth login` and retry.
