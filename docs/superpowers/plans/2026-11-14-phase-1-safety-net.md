# Phase 1 — Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI, an error log the owner can read, error pages, in-repo background jobs, an out-of-date app warning and a documented production configuration.

**Architecture:** Errors from web, mobile, edge functions and the database land in one service-role-only table, `app_error_log`, read from `/admin/errors`. Background jobs are `pg_cron` schedules and one `game_events` trigger that call HTTP endpoints through `pg_net`, with secrets in Supabase Vault and every call recorded in `job_runs`. The mobile app learns the minimum supported version from `GET /api/m/v1/me` and shows a banner.

**Tech Stack:** GitHub Actions, Next.js 14 App Router, Expo SDK 51 / expo-router 3, Supabase Postgres (`pg_cron`, `pg_net`, Vault), Deno edge functions, zod, jest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-11-14-phase-1-safety-net-design.md`. Read it before any task; this plan does not repeat its reasoning.

## Global Constraints

- A scored play must never fail, slow down or be lost because of this work. Nothing in a `game_events` trigger or the mobile reporter may throw into the caller.
- Error reporting never throws and is never awaited on a user-facing path.
- No secret value in a migration, a commit, or `app_error_log`.
- The pitch-count trigger is created **disabled**. Do not enable it in production.
- No WatermelonDB schema change (`apps/mobile/src/db/schema.ts` stays at version 6).
- No new native module in `apps/mobile`.
- Light theme stays pixel-identical: new `(app)` pages use themed classes, no raw hex, no `dark:` variants; public pages render Light. The `no-raw-colors` tests must pass.
- Production Supabase is the only database. **Never apply a migration or deploy a function to production without the owner's explicit go-ahead in chat** (Task 13 is the only task that touches production).
- Conventional Commits; one PR per part (Parts A–E), each branched from `main`.
- New `/api/m/v1` fields are optional; no existing field changes shape.
- After each migration, update `packages/database/src/types/supabase.ts` by hand to match (no local Docker stack on the owner's machine).
- `pnpm type-check`, `pnpm lint`, `pnpm test` pass at the end of every task.

## Review Focus

1. A `pitch_thrown` insert when Vault secrets are missing, or when `net.http_post` raises: the insert succeeds. → Task 11, Step 1.
2. An error report whose `details` carries a token, password or email: those keys are removed before the row is written. → Task 3, Step 1.
3. `reportError` given a non-`Error` (string, `undefined`, an object with a circular reference, a 1 MB message): no throw, one truncated row. → Task 3, Step 1.
4. The mobile queue's stored register is corrupt JSON, or the flush call itself fails: treated as an empty queue; a flush failure is not reported as a new error (no loop). → Task 8, Step 1.
5. A version string that is not `x.y.z` (`"1.1"`, `"1.1.0-beta"`, `null`): no throw, and an unknown version is treated as supported (no banner). → Task 14, Step 1.

---

## Part A — CI (PR 1)

### Task 1: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: three jobs named `checks`, `edge-functions`, `database` (the runbook in Task 18 names them for branch protection).

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

Triggers: `pull_request`, and `push` to `main`. `concurrency` cancels superseded runs per ref.

- `checks` (ubuntu-latest): `actions/checkout`, `pnpm/action-setup` (version `9.0.0`), `actions/setup-node` (Node 20, `cache: pnpm`), `pnpm install --frozen-lockfile`, restore `.turbo` with `actions/cache`, then `pnpm type-check`, `pnpm lint`, `pnpm test` as separate steps. Do **not** add `pnpm format:check` (it fails on `main` today).
- `edge-functions`: `denoland/setup-deno` (v2.x), `deno test --allow-env --allow-read supabase/functions`.
- `database`: `supabase/setup-cli`, then
  `node supabase/tests/prepare-isolated-database.mjs "$RUNNER_TEMP/db"`,
  `supabase db start --workdir "$RUNNER_TEMP/db"`,
  `supabase test db --workdir "$RUNNER_TEMP/db"`.

- [ ] **Step 2: Push the branch, open the PR, read the three job results**

Expected: `checks` and `edge-functions` green. If `database` fails because a migration does not replay from scratch (not because of a test assertion), set `continue-on-error: true` on that job, list each failing migration and error in the PR description, and stop there: fixing the replay is out of scope. If it fails on a test assertion, report it; do not edit the test.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run type-check, lint, tests, deno and database tests on every PR"
```

---

## Part B — Error log and error pages (PR 2)

### Task 2: `app_error_log` table

**Files:**
- Create: `supabase/migrations/20261114000000_app_error_log.sql`
- Create: `supabase/tests/database/app-error-log.test.sql`
- Modify: `packages/database/src/types/supabase.ts`

**Interfaces:**
- Produces: table `public.app_error_log(id uuid pk default gen_random_uuid(), occurred_at timestamptz not null default now(), source text not null check (source in ('web','web_client','mobile','edge','db')), area text not null, message text not null, details jsonb not null default '{}', user_id uuid, team_id uuid, game_id uuid, app_version text, device_id text)`. No foreign keys. Indexes on `(occurred_at desc)` and `(source, occurred_at desc)`. RLS enabled, no policies; `revoke all … from anon, authenticated`.

- [ ] **Step 1: Write the pgTAP test** (`plan(4)`): the table exists; as role `authenticated` a `select` returns 0 rows after a service-role insert of one row; as `authenticated` an `insert` raises `42501`; `source = 'nope'` violates the check (`23514`).
- [ ] **Step 2: Write the migration.**
- [ ] **Step 3: Add the table to `supabase.ts`** (`Row`, `Insert`, `Update`) following the file's existing table entries.
- [ ] **Step 4: Run** `pnpm type-check` → PASS. (The pgTAP test runs in CI's `database` job.)
- [ ] **Step 5: Commit** `feat(errors): add app_error_log table`.

### Task 3: Shared schema and the web `reportError`

**Files:**
- Create: `packages/shared/src/validation/client-errors.ts` (export from `packages/shared/src/validation/index.ts`)
- Create: `packages/shared/src/validation/__tests__/client-errors.test.ts`
- Create: `apps/web/src/lib/errors/report-error.ts`
- Create: `apps/web/src/lib/errors/__tests__/report-error.test.ts`

**Interfaces:**
- Produces (shared):
  - `ERROR_MESSAGE_MAX = 2000`, `ERROR_DETAILS_MAX_BYTES = 8192`, `CLIENT_ERROR_BATCH_MAX = 50`, `CLIENT_ERROR_MAX_AGE_MS = 7 * 24 * 3600 * 1000`
  - `clientErrorEntrySchema`: `{ area: string (1–64), message: string (1–ERROR_MESSAGE_MAX), details?: Record<string, unknown>, occurredAt: ISO datetime string, appVersion?: string (≤32), deviceId?: string (≤64), teamId?: uuid, gameId?: uuid }`
  - `clientErrorBatchSchema`: `{ entries: clientErrorEntrySchema[] (1–CLIENT_ERROR_BATCH_MAX) }`
  - types `ClientErrorEntry`, `ClientErrorBatch`
  - `sanitizeErrorDetails(details: unknown): Record<string, unknown>` — returns `{}` for non-objects; drops, at any depth, keys matching `/token|authorization|password|secret|cookie|email|apikey|api_key/i`; replaces a circular reference with `'[circular]'`; if the JSON exceeds `ERROR_DETAILS_MAX_BYTES` returns `{ truncated: true }`.
  - `errorMessageOf(error: unknown): string` — `Error.message`, a string as is, otherwise `String(error)`; truncated to `ERROR_MESSAGE_MAX`.
- Produces (web):
  - `type ErrorSource = 'web' | 'web_client' | 'mobile' | 'edge' | 'db'`
  - `interface ErrorContext { userId?: string; teamId?: string; gameId?: string; details?: Record<string, unknown> }`
  - `buildErrorRow(source: ErrorSource, area: string, error: unknown, context?: ErrorContext): AppErrorLogInsert` (pure)
  - `reportError(area: string, error: unknown, context?: ErrorContext): void` — one `console.error` line `[error] area=<area> <message> <JSON context>`, then a fire-and-forget insert with a service-role client built from `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`; any failure of the insert is swallowed after a `console.error`.

- [ ] **Step 1: Write the failing tests**

```ts
// client-errors.test.ts
it('drops secret-looking keys at any depth', () => {
  expect(sanitizeErrorDetails({ gameId: 'g1', token: 'x', nested: { Authorization: 'y', email: 'a@b.c', ok: 1 } }))
    .toEqual({ gameId: 'g1', nested: { ok: 1 } });
});
it('survives a circular reference', () => {
  const a: Record<string, unknown> = { id: 1 }; a.self = a;
  expect(sanitizeErrorDetails(a)).toEqual({ id: 1, self: '[circular]' });
});
it('replaces oversized details', () => {
  expect(sanitizeErrorDetails({ blob: 'x'.repeat(20_000) })).toEqual({ truncated: true });
});
it('returns {} for non-objects', () => {
  expect(sanitizeErrorDetails('nope')).toEqual({}); expect(sanitizeErrorDetails(undefined)).toEqual({});
});
it('reads a message from anything', () => {
  expect(errorMessageOf(new Error('boom'))).toBe('boom');
  expect(errorMessageOf(undefined)).toBe('undefined');
  expect(errorMessageOf('x'.repeat(1_000_000))).toHaveLength(2000);
});
it('rejects a batch of 51 and an empty batch', () => { /* clientErrorBatchSchema.safeParse(...).success === false */ });

// report-error.test.ts
it('builds a truncated, sanitized row', () => {
  const row = buildErrorRow('web', 'finalize', new Error('x'.repeat(5000)), { gameId: G, details: { token: 't', n: 1 } });
  expect(row).toMatchObject({ source: 'web', area: 'finalize', game_id: G, details: { n: 1 } });
  expect(row.message).toHaveLength(2000);
});
it('never throws when the insert rejects', async () => { /* mock createClient().from().insert to reject; expect(() => reportError('a', 'b')).not.toThrow(); flush microtasks; no unhandled rejection */ });
it('never throws when env is missing', () => { /* delete SUPABASE_SERVICE_ROLE_KEY; expect not to throw */ });
```

- [ ] **Step 2: Run** `pnpm --filter @baseball/shared test client-errors` and `pnpm --filter web test report-error` → FAIL (modules missing).
- [ ] **Step 3: Implement** the shared module and `report-error.ts` to the interfaces above.
- [ ] **Step 4: Run both test commands** → PASS.
- [ ] **Step 5: Commit** `feat(errors): add shared client-error schema and web reportError`.

### Task 4: Client error service and routes

**Files:**
- Create: `apps/web/src/lib/services/errors/record-client-errors.ts`
- Create: `apps/web/src/lib/services/errors/__tests__/record-client-errors.test.ts`
- Create: `apps/web/src/app/api/m/v1/client-errors/route.ts`
- Create: `apps/web/src/app/api/client-errors/route.ts`

**Interfaces:**
- Consumes: Task 3's schema, `sanitizeErrorDetails`, `ErrorSource`; `ServiceResult`, `serviceOk`, `invalidInput` (`lib/services/result.ts`); `requireApiUser`, `readJsonBody`, `serviceResponse`.
- Produces: `recordClientErrors(db: SupabaseClient, actorUserId: string, input: unknown, source: 'mobile' | 'web_client', appVersionHeader?: string | null): Promise<ServiceResult<{ recorded: number }>>`
  - validates with `clientErrorBatchSchema`; drops entries whose `occurredAt` is older than `CLIENT_ERROR_MAX_AGE_MS` or more than 5 minutes in the future; stamps `user_id = actorUserId`, `occurred_at = entry.occurredAt`, `app_version = entry.appVersion ?? appVersionHeader`; sanitizes `details`; one bulk insert; an insert error returns `serviceError('failed', …)`.
- Routes:
  - `POST /api/m/v1/client-errors` — bearer auth, source `mobile`, passes `req.headers.get('x-app-version')`, responds through `serviceResponse`.
  - `POST /api/client-errors` — reads the cookie session with the existing server Supabase client; no user → `204` with no write; otherwise source `web_client` using a service-role client, responds `204` on success.

- [ ] **Step 1: Write the failing test** — cases: a valid batch of two inserts two rows stamped with the actor and source; an entry 8 days old is dropped and `recorded` is 1; `details.token` is absent from the inserted row; 51 entries → `invalid`; a rejected insert → `failed`; the header version fills a missing `appVersion`.
- [ ] **Step 2: Run** `pnpm --filter web test record-client-errors` → FAIL.
- [ ] **Step 3: Implement** the service and both routes (follow `app/api/m/v1/team-events/route.ts`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(errors): accept client error reports from web and mobile`.

### Task 5: Report the errors the web swallows today

**Files:**
- Modify: `apps/web/src/lib/league-games/refresh.ts` (the two `catch` blocks near lines 351 and 357)
- Modify: `apps/web/src/lib/games/finalize.ts` (snapshot-recompute `catch` near line 270)
- Modify: `apps/web/src/lib/notifications/send-push.ts` (both failure branches)
- Modify: `apps/web/src/app/api/cron/rebuild-league-snapshots/route.ts` (per-league `catch`)
- Modify: `apps/web/src/lib/api/service-response.ts` (`failed` branch)
- Test: extend the existing tests beside each file where one exists; add `apps/web/src/lib/api/__tests__/service-response.test.ts` if absent.

**Interfaces:**
- Consumes: `reportError(area, error, context)`.
- Areas (exact strings): `league.refresh`, `league.snapshot`, `finalize.snapshot`, `push.send`, `cron.rebuild`, `service.failed`.

- [ ] **Step 1: Write failing tests** asserting `reportError` (mocked) is called with the area above and the relevant id in context (`leagueGameId`, `gameId`, `leagueId`) when the wrapped call rejects, and that the function still resolves/returns as before. For `serviceResponse`: a `failed` result calls `reportError('service.failed', result.error)` and still responds 500 `Internal error`.
- [ ] **Step 2: Run** `pnpm --filter web test` → the new cases FAIL.
- [ ] **Step 3: Add the `reportError` calls** next to the existing `console.error` lines (keep those lines).
- [ ] **Step 4: Run** `pnpm --filter web test` → PASS.
- [ ] **Step 5: Commit** `feat(errors): record swallowed server errors in the error log`.

### Task 6: Web error pages

**Files:**
- Create: `apps/web/src/components/errors/ErrorScreen.tsx` (client component: title, body, primary action, optional home link; reports once on mount)
- Create: `apps/web/src/lib/errors/report-client-error.ts`
- Create: `apps/web/src/app/global-error.tsx`, `apps/web/src/app/error.tsx`, `apps/web/src/app/not-found.tsx`
- Create: `apps/web/src/app/(app)/error.tsx`, `apps/web/src/app/(app)/loading.tsx`
- Create: `apps/web/src/app/(app)/games/[gameId]/score/error.tsx`
- Test: `apps/web/src/components/errors/__tests__/ErrorScreen.test.tsx`

**Interfaces:**
- Produces: `reportClientError(area: string, error: unknown, details?: Record<string, unknown>): void` — `fetch('/api/client-errors', { method: 'POST', keepalive: true, body: one-entry batch })`, all failures swallowed.
- `ErrorScreen` props: `{ title: string; body: string; actionLabel: string; onAction: () => void; error: Error & { digest?: string }; homeHref?: string }`.
- Exact copy:
  - default: title "Something went wrong", body "The page hit an error. Your data is safe.", action "Try again".
  - scorer: title "The scorer hit an error", body "Plays you already recorded are saved. Reload to pick up where you left off.", action "Reload scorer".
  - not found: title "Page not found", link "Go to home".

- [ ] **Step 1: Write the failing test** — `ErrorScreen` renders the title, body and action; clicking the action calls `onAction`; it calls `reportClientError('render', error, { pathname, digest })` exactly once across a re-render.
- [ ] **Step 2: Run** `pnpm --filter web test ErrorScreen` → FAIL.
- [ ] **Step 3: Implement.** `global-error.tsx` renders its own `<html data-theme="light"><body>`. `(app)/error.tsx` and the scorer's use themed classes only. `loading.tsx` is a neutral skeleton block.
- [ ] **Step 4: Run** `pnpm --filter web test` (includes `no-raw-colors` and the themed-path disk walk) → PASS.
- [ ] **Step 5: Commit** `feat(web): add error, not-found and loading pages`.

### Task 7: `/admin/errors`

**Files:**
- Create: `apps/web/src/lib/services/errors/load-error-log.ts` and its test
- Create: `apps/web/src/app/(app)/admin/errors/page.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx` (admin links near line 124), `apps/web/src/app/(app)/admin/page.tsx` (card list near line 181)

**Interfaces:**
- Consumes: the platform-admin check used by `(app)/admin/billing` (reuse it; do not write a new one).
- Produces: `loadErrorLog(db, actorUserId, input: unknown): Promise<ServiceResult<{ rows: ErrorLogRow[]; countLast24h: number; areas: string[] }>>` with `input` = `{ source?: ErrorSource; area?: string }`; `forbidden` unless platform admin; newest 200 rows from the last 7 days.
- `ErrorLogRow = { id, occurredAt, source, area, message, details, userId, teamId, gameId, appVersion, deviceId }`.

- [ ] **Step 1: Write the failing test** — non-admin → `forbidden`; admin gets rows newest first, limited to 200 and to 7 days; `source` and `area` filters are applied; `countLast24h` counts all sources.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the service and the page: filter controls as query params (`?source=&area=`), a table with an expandable details cell (`<details>`), the 24-hour count in the page heading, an "Errors" entry in the admin sidebar, and an "Errors" card on the admin index (`admin/page.tsx`) that shows the 24-hour count so a glance at the admin home says whether anything is wrong. A 404 for non-admins, matching the other admin pages.
- [ ] **Step 4: Run** `pnpm --filter web test` → PASS.
- [ ] **Step 5: Commit** `feat(admin): add error log page`.

### Task 8: Mobile error reporter

**Files:**
- Create: `apps/mobile/src/lib/app-version.ts`
- Create: `apps/mobile/src/lib/error-queue.ts` (pure) and `apps/mobile/src/lib/__tests__/error-queue.test.ts`
- Create: `apps/mobile/src/lib/error-report.ts` and `apps/mobile/src/lib/__tests__/error-report.test.ts`
- Modify: `apps/mobile/src/lib/api-client.ts` (request headers near line 154)
- Modify: `apps/mobile/src/providers/SyncProvider.tsx` (non-offline branch near line 119; after a successful sync near line 95)
- Modify: `apps/mobile/src/sync/sync-engine.ts` (where `finalizeFailureCounts` is incremented)
- Modify: `apps/mobile/src/features/scoring/use-record-event.ts`

**Interfaces:**
- Produces:
  - `APP_VERSION: string | null` = `Constants.expoConfig?.version ?? null` (`expo-constants`, already a dependency).
  - `ERROR_QUEUE_KEY = 'errors.pending'`, `ERROR_QUEUE_MAX = 50`
  - `parseErrorQueue(raw: unknown): ClientErrorEntry[]` — anything that is not a JSON array of valid entries → `[]` (invalid entries dropped individually).
  - `enqueueError(queue: ClientErrorEntry[], entry: ClientErrorEntry): ClientErrorEntry[]` — appends, keeps the newest `ERROR_QUEUE_MAX`.
  - `reportClientError(area: string, error: unknown, context?: { teamId?: string; gameId?: string; details?: Record<string, unknown> }): void` — builds an entry (`errorMessageOf`, `sanitizeErrorDetails`, `occurredAt = now`, `appVersion = APP_VERSION`, `deviceId` from `getDeviceId()`), then reads/enqueues/writes the register through `database.localStorage` inside a caught promise chain. Never throws, returns immediately.
  - `flushClientErrors(): Promise<void>` — reads the register; empty → return; `apiClient.post('/client-errors', { entries })`; on success writes `[]`; on **any** failure leaves the register untouched and does **not** call `reportClientError`. A single in-flight flush at a time.
- `apiClient` adds `'X-App-Version': APP_VERSION` to every request when it is non-null.
- Areas: `sync.failed` (SyncProvider), `finalize.failed` (first failure per game only, where `warnedFinalizeFailureGames` latches), `scoring.record` (a throw from `recordEvent`, re-thrown unchanged).
- `flushClientErrors()` is called after a successful sync and when `AppState` becomes `active`.

- [ ] **Step 1: Write the failing tests**

```ts
// error-queue.test.ts
it('treats corrupt or non-array input as empty', () => {
  expect(parseErrorQueue('{not json')).toEqual([]); expect(parseErrorQueue({})).toEqual([]); expect(parseErrorQueue(null)).toEqual([]);
});
it('drops invalid entries and keeps valid ones', () => { /* [valid, {area: 1}] → [valid] */ });
it('keeps the newest 50', () => {
  const q = Array.from({ length: 60 }, (_, i) => entry(`m${i}`)).reduce(enqueueError, [] as ClientErrorEntry[]);
  expect(q).toHaveLength(50); expect(q[0].message).toBe('m10'); expect(q[49].message).toBe('m59');
});

// error-report.test.ts  (mock database.localStorage and apiClient)
it('reportClientError never throws when storage rejects', () => { /* set rejects; expect not to throw; no unhandled rejection */ });
it('flush clears the queue on success', async () => { /* register has 2; post resolves; set called with '[]' */ });
it('flush keeps the queue and reports nothing when the post fails', async () => { /* post rejects ApiError offline; set not called; register unchanged */ });
it('flush posts nothing for an empty or corrupt register', async () => { /* post not called */ });
it('recordEvent rethrows the original error after reporting', async () => { /* in use-record-event test */ });
```

- [ ] **Step 2: Run** `pnpm --filter mobile test error-queue error-report` → FAIL.
- [ ] **Step 3: Implement** to the interfaces. Follow `getClockHeldEvents` in `sync-engine.ts` for the register read/write pattern.
- [ ] **Step 4: Run** `pnpm --filter mobile test` → PASS.
- [ ] **Step 5: Commit** `feat(mobile): queue and report client errors`.

### Task 9: Mobile error boundaries

**Files:**
- Create: `apps/mobile/src/features/errors/ErrorFallback.tsx` and `__tests__/ErrorFallback.test.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (add `export function ErrorBoundary`)
- Modify: `apps/mobile/app/(tabs)/schedule/games/[gameId]/score.tsx` (add `export function ErrorBoundary`)

**Interfaces:**
- Consumes: `reportClientError`; expo-router's `ErrorBoundaryProps` (`{ error: Error; retry: () => void }`).
- Produces: `ErrorFallback({ error, retry, variant }: ErrorBoundaryProps & { variant: 'app' | 'scorer' })`.
- Exact copy: app — "Something went wrong" / "Plays recorded on this phone are saved." / button "Try again". Scorer — "The scorer hit an error" / "Plays you already recorded are saved on this phone." / button "Reopen scorer".
- The root boundary renders outside every provider, so `ErrorFallback` with `variant="app"` must not use `useThemeColors` or any provider hook: wrap its content in `<ThemeScope theme="light" statusBar={false}>`. The scorer variant does the same (the scorer content is a Light island).

- [ ] **Step 1: Write the failing test** — renders the variant's copy; pressing the button calls `retry`; `reportClientError('render', error, { details: { variant } })` is called once.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** and export the two boundaries.
- [ ] **Step 4: Run** `pnpm --filter mobile test` (includes mobile `no-raw-colors`) → PASS.
- [ ] **Step 5: Commit** `feat(mobile): add error boundaries for the app and the scorer`.

---

## Part C — Background jobs (PR 3)

### Task 10: Edge function authorization and alert cutoff

**Files:**
- Create: `supabase/functions/_shared/require-internal.ts` and `require-internal.test.ts`
- Create: `supabase/functions/_shared/report-error.ts`
- Create: `supabase/functions/_shared/alert-cutoff.ts` and `alert-cutoff.test.ts`
- Modify: `supabase/functions/push-notifications/index.ts`, `practice-notifications-dispatch/index.ts`, `pitch-count-calculator/index.ts`
- Modify: `supabase/functions/_shared/cors.ts` (allow header `x-internal-secret`)
- Modify: `supabase/config.toml` (`[functions.push-notifications]`, `[functions.practice-notifications-dispatch]`, `[functions.pitch-count-calculator]`, each `verify_jwt = false`)
- Modify: `apps/web/src/lib/notifications/send-push.ts` and its test

**Interfaces:**
- Produces:
  - `isInternalRequest(headers: Headers, env: { internalSecret?: string; serviceRoleKey?: string }): boolean` (pure) — true when `x-internal-secret` equals a non-empty `internalSecret`, or the bearer token equals a non-empty `serviceRoleKey`. Constant-time string comparison.
  - `requireInternal(req: Request): Response | null` — reads `INTERNAL_JOB_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`; returns a 401 JSON response or `null`.
  - `internalHeaders(): Record<string, string>` — `{ 'x-internal-secret': INTERNAL_JOB_SECRET }` or `{}` when unset; used on the two function-to-function `functions.invoke('push-notifications', { body, headers })` calls.
  - `reportEdgeError(supabase, area: string, error: unknown, details?: Record<string, unknown>): Promise<void>` — inserts `source = 'edge'`; never throws.
  - `ALERT_MAX_EVENT_AGE_MS = 6 * 3600 * 1000`; `shouldSendPitchAlert(occurredAt: string, nowMs: number): boolean` — false when older than the limit or unparseable.
- Each of the three functions calls `requireInternal` right after `handleCors`, and `reportEdgeError` in its failure paths (areas `edge.push`, `edge.practice-dispatch`, `edge.pitch-count`).
- `pitch-count-calculator` still upserts the count for an old event but skips the push when `shouldSendPitchAlert` is false.
- Web `sendPush` passes `headers: { 'x-internal-secret': process.env.INTERNAL_JOB_SECRET }` when the variable is set.

- [ ] **Step 1: Write the failing Deno tests**

```ts
Deno.test('accepts the secret header', () => assert(isInternalRequest(h({ 'x-internal-secret': 's' }), { internalSecret: 's' })));
Deno.test('accepts the service-role bearer', () => assert(isInternalRequest(h({ authorization: 'Bearer k' }), { serviceRoleKey: 'k' })));
Deno.test('refuses the anon key, a wrong secret, and no headers', () => { /* three assertFalse */ });
Deno.test('refuses any header when the secret is unset', () => assertFalse(isInternalRequest(h({ 'x-internal-secret': '' }), { internalSecret: '' })));
Deno.test('refuses an empty bearer when the key is unset', () => assertFalse(isInternalRequest(h({ authorization: 'Bearer ' }), {})));
Deno.test('alerts for a 5h-old pitch, not a 7h-old one, not garbage', () => { /* shouldSendPitchAlert */ });
```

- [ ] **Step 2:** If Deno is installed locally run `deno test supabase/functions/_shared` → FAIL; otherwise rely on CI's `edge-functions` job and say so in the PR.
- [ ] **Step 3: Implement**, wire the three functions, update `send-push.ts` and extend its jest test (header present when the env var is set, absent otherwise).
- [ ] **Step 4: Run** `pnpm --filter web test send-push` → PASS; Deno tests → PASS (locally or in CI).
- [ ] **Step 5: Commit** `feat(functions): require an internal caller for push, practice dispatch and pitch counts`.

### Task 11: Jobs migration

**Files:**
- Create: `supabase/migrations/20261114000001_background_jobs.sql`
- Create: `supabase/tests/database/background-jobs.test.sql`
- Modify: `packages/database/src/types/supabase.ts` (`job_runs`, `admin_job_health`)

**Interfaces:**
- Consumes: `public.app_error_log` (Task 2).
- Produces (exact names):
  - Extensions: `pg_cron`, `pg_net` (`create extension if not exists`, in the schemas Supabase uses: `pg_catalog` and `extensions`). Vault is already present on Supabase.
  - Schema `private`; `revoke all on schema private from anon, authenticated`.
  - Table `public.job_runs(id bigint generated always as identity pk, job text not null, request_id bigint, requested_at timestamptz not null default now(), status_code int, error text, completed_at timestamptz)`; RLS on, no policies; index `(job, requested_at desc)`.
  - `private.job_config(p_name text) returns text` — `SECURITY DEFINER`, `set search_path = ''`; reads `vault.decrypted_secrets` by `name`; null when absent.
  - `private.job_http(p_job text, p_method text, p_base_key text, p_path text, p_auth text, p_body jsonb, p_timeout_ms int) returns void` — `p_base_key` is `job_functions_base_url` or `job_web_base_url`; `p_auth` is `internal` (header `x-internal-secret` = `job_internal_secret`) or `cron` (`Authorization: Bearer` + `job_cron_secret`). When the base URL or the secret is null: insert one `app_error_log` row (`source 'db'`, `area 'job.config'`, `message 'Missing Vault secret for job ' || p_job`, `details {job, missing}`) and return. Otherwise `net.http_post` / `net.http_get` with `timeout_milliseconds := p_timeout_ms` and insert a `job_runs` row with the returned request id. The whole body is inside `begin … exception when others then` that inserts an `app_error_log` row (`area 'job.' || p_job`) and returns.
  - `private.notify_pitch_count() returns trigger` — calls `private.job_http('pitch-count-calculator','POST','job_functions_base_url','/pitch-count-calculator','internal', jsonb_build_object('type','INSERT','table','game_events','record', to_jsonb(new)), 10000)`; own `exception when others` returning `new`; always `return new`.
  - Trigger `game_events_notify_pitch_count` `after insert on public.game_events for each row when (new.event_type = 'pitch_thrown')`, followed by `alter table public.game_events disable trigger game_events_notify_pitch_count;`
  - `private.collect_job_runs() returns void` — for `job_runs` rows with `completed_at is null`: copy `status_code` and `error_msg` (or `'timed out'`) from `net._http_response` by `request_id` and set `completed_at`; rows older than 10 minutes with no response get `error = 'no response'`. For each newly failed row (`status_code` null or not 2xx) whose `job` is not `pitch-count-calculator`, insert an `app_error_log` row (`area 'job.' || job`).
  - `public.admin_job_health() returns table(job text, enabled boolean, last_run_at timestamptz, last_status int, last_ok boolean, last_success_at timestamptz, calls_24h int, failures_24h int)` — `SECURITY DEFINER`; execute granted to `service_role` only. One row per job in `('rebuild-league-snapshots','practice-notifications-dispatch','pitch-count-calculator')`; `enabled` is the cron job's `active` flag, or for the pitch-count job whether the trigger's `tgenabled <> 'D'`.
  - `cron.schedule` by name:

    | name | schedule | command |
    |---|---|---|
    | `rebuild-league-snapshots` | `0 */6 * * *` | `select private.job_http('rebuild-league-snapshots','GET','job_web_base_url','/api/cron/rebuild-league-snapshots','cron',null,300000)` |
    | `practice-notifications-dispatch` | `*/5 * * * *` | `select private.job_http('practice-notifications-dispatch','POST','job_functions_base_url','/practice-notifications-dispatch','internal','{}'::jsonb,30000)` |
    | `collect-job-runs` | `*/5 * * * *` | `select private.collect_job_runs()` |
    | `prune-logs` | `15 9 * * *` | delete `app_error_log` and `job_runs` rows older than 30 days |

- [ ] **Step 1: Write the pgTAP test** (`background-jobs.test.sql`, inside `BEGIN … ROLLBACK`):
  1. `game_events_notify_pitch_count` exists and `tgenabled = 'D'`.
  2. The four cron jobs exist with the schedules in the table.
  3. `job_runs` and `private.job_config` are unusable as `authenticated` (`42501`).
  4. After `alter table … enable trigger` (in the test transaction) and with no Vault secrets: inserting a `pitch_thrown` event succeeds (`lives_ok`) and leaves exactly one `app_error_log` row with `area = 'job.config'`.
  5. Inserting a non-pitch event leaves no further row and no `job_runs` row.
  6. With the four secrets created via `vault.create_secret` and `net.http_post` replaced in the test by a function that raises: the `pitch_thrown` insert still succeeds and an `app_error_log` row with `area = 'job.pitch-count-calculator'` exists.
  7. With secrets and the real `net.http_post`: the insert leaves one `job_runs` row with `job = 'pitch-count-calculator'` and a non-null `request_id`.
  8. `admin_job_health()` as `service_role` returns three rows and reports the pitch-count job `enabled = false`.

  Build the game fixture the way `tournament-mobile-game-start.test.sql` does. If replacing `net.http_post` in a test is not possible in this Postgres image, make case 6 call `private.job_http` with a `p_method` of `'BOGUS'` that the function rejects by raising internally, and assert it returns without error and logs.

- [ ] **Step 2: Write the migration.** Idempotent: `create … if not exists`, `create or replace function`, `drop trigger if exists` before `create trigger`.
- [ ] **Step 3: Update `supabase.ts`.** `pnpm type-check` → PASS.
- [ ] **Step 4:** Push and confirm CI's `database` job passes the new test file.
- [ ] **Step 5: Commit** `feat(jobs): schedule snapshot rebuild and practice dispatch in the database`.

### Task 12: Jobs panel and Vercel cleanup

**Files:**
- Modify: `apps/web/src/lib/services/errors/load-error-log.ts` and its test (add `jobs`)
- Modify: `apps/web/src/app/(app)/admin/errors/page.tsx`
- Modify: `apps/web/src/app/api/cron/rebuild-league-snapshots/route.ts` (comment only)
- Delete: `apps/web/vercel.json`

**Interfaces:**
- Consumes: `admin_job_health()` (Task 11).
- Produces: `loadErrorLog` data gains `jobs: JobHealth[]` where `JobHealth = { job: string; enabled: boolean; lastRunAt: string | null; lastStatus: number | null; lastOk: boolean | null; lastSuccessAt: string | null; calls24h: number; failures24h: number }`. An RPC error yields `jobs: []` and a `reportError('admin.job-health', …)`, not a failed page.

- [ ] **Step 1: Extend the test** — the service maps the RPC rows to `JobHealth`; an RPC error gives `jobs: []`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** and render a Jobs table above the error list: job, On/Off, last run, last result ("OK 200", "Failed 500", "No response", "Never run"), last success, and for the pitch-count job "N calls, M failed in 24h".
- [ ] **Step 4: Run** `pnpm --filter web test` → PASS. Confirm nothing else references `vercel.json` (`grep -rn "vercel.json" --exclude-dir=node_modules .`).
- [ ] **Step 5: Commit** `feat(admin): show background job health; drop unused vercel cron`.

### Task 13: Production rollout (owner-gated; no code)

Do nothing in this task until the owner says to proceed in chat. Then, in this order, confirming each with the owner:

- [ ] **Step 1:** The owner generates a random 32+ character value and sets it as `INTERNAL_JOB_SECRET` on Render and as an edge-function secret, and confirms `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` are set on Render. Never ask for or echo the values.
- [ ] **Step 2:** The owner stores the four Vault secrets with the SQL from the runbook (Task 18): `job_functions_base_url`, `job_web_base_url`, `job_internal_secret`, `job_cron_secret`.
- [ ] **Step 3:** PR 3's web build is live on Render.
- [ ] **Step 4:** Deploy `push-notifications`, `practice-notifications-dispatch`, `pitch-count-calculator` with `verify_jwt` false.
- [ ] **Step 5:** Apply `20261114000000` (if not already) and `20261114000001`; reconcile `supabase_migrations.schema_migrations.version` to the file timestamps.
- [ ] **Step 6: Verify:** `select * from admin_job_health()` shows the pitch-count job `enabled = false`; within 10 minutes `practice-notifications-dispatch` has `last_ok = true`; run `select private.job_http('rebuild-league-snapshots','GET','job_web_base_url','/api/cron/rebuild-league-snapshots','cron',null,300000)` once and see `last_ok = true` after the next collect. If the rebuild shows "timed out" although Render logs show it finished, change the cron route to start the rebuild without awaiting and answer `202` (spec, "Left to the builder"), and repeat.
- [ ] **Step 7:** A reconciliation or test push from the web still arrives (confirms `sendPush` passes the new check).

---

## Part D — Out-of-date app warning (PR 4)

### Task 14: Shared version constants and `/me`

**Files:**
- Create: `packages/shared/src/constants/app-version.ts` (export from `constants/index.ts`) and `constants/__tests__/app-version.test.ts`
- Modify: `packages/shared/src/validation/mobile-me.ts` and `__tests__/mobile-me.test.ts`
- Modify: `apps/web/src/lib/services/me/load-me.ts` and its test

**Interfaces:**
- Produces:
  - `MIN_SUPPORTED_MOBILE_VERSION = '1.0.0'` (nobody is warned until this is raised)
  - `MOBILE_APP_UPDATE_URL = 'itms-beta://'` (opens TestFlight)
  - `compareAppVersions(a: string, b: string): number` — compares the leading numeric dot-separated parts, missing parts as 0, ignoring any suffix after `-` or `+`; negative, 0 or positive.
  - `isAppVersionSupported(current: string | null | undefined, minimum: string | null | undefined): boolean` — `true` when either is missing or has no numeric part.
  - `meResponseSchema` gains `minSupportedAppVersion: z.string().optional()` and `appUpdateUrl: z.string().optional()`; `loadMe` returns both constants.

- [ ] **Step 1: Write the failing tests**

```ts
expect(compareAppVersions('1.0.0', '1.1.0')).toBeLessThan(0);
expect(compareAppVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
expect(compareAppVersions('1.1', '1.1.0')).toBe(0);
expect(compareAppVersions('1.1.0-beta', '1.1.0')).toBe(0);
expect(isAppVersionSupported('1.0.0', '1.1.0')).toBe(false);
expect(isAppVersionSupported('1.1.0', '1.1.0')).toBe(true);
expect(isAppVersionSupported(null, '1.1.0')).toBe(true);
expect(isAppVersionSupported('1.0.0', undefined)).toBe(true);
expect(isAppVersionSupported('garbage', '1.1.0')).toBe(true);
// mobile-me: parses with and without the two new fields
```

- [ ] **Step 2: Run** `pnpm --filter @baseball/shared test app-version mobile-me` → FAIL. **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(mobile-api): send the minimum supported app version with /me`.

### Task 15: Update banner

**Files:**
- Create: `apps/mobile/src/features/app-version/UpdateBanner.tsx` and `__tests__/UpdateBanner.test.tsx`
- Modify: `apps/mobile/src/providers/RoleProvider.tsx` (expose the two fields from the `/me` payload it already caches)
- Modify: `apps/mobile/app/(tabs)/(home)/index.tsx` (render the banner above the content)
- Modify: `apps/mobile/app.json` (`version` → `1.1.0`)

**Interfaces:**
- Consumes: `APP_VERSION` (Task 8), `isAppVersionSupported` (Task 14).
- Produces: the role context (`useRole()`, `RoleContextValue`) gains `minSupportedAppVersion: string | null` and `appUpdateUrl: string | null`. `UpdateBanner` takes no props, reads them, and returns `null` when supported, when `appUpdateUrl` is null, or after dismissal. Dismissal is module-level state (lasts until cold start).
- Exact copy: "This version of DiamondOS is out of date. Update to keep everything working." Button "Update" → `Linking.openURL(appUpdateUrl)`, falling back to `https://testflight.apple.com` if that rejects. Dismiss control with `accessibilityLabel="Dismiss"`.
- Colors through `useThemeColors()` / themed classes only.

- [ ] **Step 1: Write the failing test** — hidden when the version is supported; hidden when the minimum is unknown; shown with the exact copy when below; "Update" opens the URL and falls back when it rejects; "Dismiss" hides it and it stays hidden on re-render.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** The banner is rendered only on Home; do not add it to the scorer or any shared layout.
- [ ] **Step 4: Run** `pnpm --filter mobile test` → PASS; `pnpm type-check` → PASS.
- [ ] **Step 5: Commit** `feat(mobile): warn when the app version is out of date`.

The iOS build that carries Tasks 8, 9 and 15 (`cd apps/mobile && eas build -p ios --profile production --auto-submit`) is run only when the owner asks for it.

---

## Part E — Configuration and housekeeping (PR 5)

### Task 16: One app-URL helper, no `.vercel.app` fallback

**Files:**
- Modify: `apps/web/src/lib/auth/app-url.ts` and its test (create `apps/web/src/lib/auth/__tests__/app-url.test.ts` if absent)
- Modify: `apps/web/src/app/(app)/admin/leagues/actions.ts:107`, `admin/leagues/create/actions.ts:81`, `admin/create-team/actions.ts:78`, `apps/web/src/app/api/admin/invite-league-staff/route.ts:90`
- Modify: `apps/web/src/lib/services/members/team-invitations.ts` (`appUrl()` near line 50)

**Interfaces:**
- Produces: `resolveAppOrigin(): string | null` — `getAppOrigin()` when non-empty; otherwise `'http://localhost:3001'` when `NODE_ENV !== 'production'`; otherwise calls `reportError('config', 'NEXT_PUBLIC_APP_URL is not set')` and returns `null`.
- Each of the five call sites uses it and, on `null`, fails in its existing error shape with the message "Invitations are unavailable: the site address is not configured." without sending an email. `getAppOrigin` is unchanged.

- [ ] **Step 1: Write the failing test** — returns the normalized env value; honors `APP_URL`; localhost in development; `null` plus one `reportError('config', …)` in production with both unset.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** and update the five call sites; extend an existing invitation test with the unset-in-production case (no invite call made, `failed`/error returned).
- [ ] **Step 4: Run** `pnpm --filter web test` → PASS; `grep -rn "vercel.app" apps/web/src` returns nothing outside tests.
- [ ] **Step 5: Commit** `fix(invites): refuse to send invite links when the site address is not configured`.

### Task 17: Startup configuration check

**Files:**
- Create: `apps/web/src/lib/env/required-env.ts` and `__tests__/required-env.test.ts`
- Create: `apps/web/src/instrumentation.ts`
- Modify: `apps/web/next.config.js` (`experimental.instrumentationHook: true`)

**Interfaces:**
- Produces: `REQUIRED_ENV = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_APP_URL','CRON_SECRET','INTERNAL_JOB_SECRET'] as const`; `RECOMMENDED_ENV = ['RESEND_API_KEY','ANTHROPIC_API_KEY','GOOGLE_MAPS_SERVER_API_KEY','NEXT_PUBLIC_GOOGLE_MAPS_API_KEY','ICS_FEED_SECRET','ICS_FEED_BASE_URL'] as const`; `findMissingEnv(env: Record<string, string | undefined>, names: readonly string[]): string[]` (empty string counts as missing; `NEXT_PUBLIC_APP_URL` is satisfied by `APP_URL`).
- `instrumentation.ts` `register()`: only when `NEXT_RUNTIME === 'nodejs'` and `NODE_ENV === 'production'`; one `reportError('config', 'Missing required environment variables', { details: { missing } })` if any required are missing, one `console.warn` for recommended. Never throws; the server always starts.

- [ ] **Step 1: Write the failing test** for `findMissingEnv` (all present → `[]`; empty string → listed; `APP_URL` satisfies `NEXT_PUBLIC_APP_URL`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter web test required-env` → PASS; `pnpm --filter web build` → succeeds.
- [ ] **Step 5: Commit** `feat(web): report missing configuration at startup`.

### Task 18: Docs, env example, middleware, stale files

**Files:**
- Modify: `.env.example`, `CLAUDE.md`
- Create: `docs/superpowers/runbooks/production-setup.md`
- Modify: `apps/web/src/middleware.ts` (protected-route check near lines 49–54) and its test if one exists
- Delete: `supabase/all_migrations.sql`, `supabase/fix_rls_policies.sql` (after `grep -rn "all_migrations\|fix_rls_policies" --exclude-dir=node_modules .` shows no reference besides docs)
- Leave alone: `DiamondOS Revamp.zip`, `preview.html` (owner's decision).

- [ ] **Step 1: Middleware.** Replace the hard-coded prefix chain with `isThemedPath(pathname)` from `lib/theme/themed-paths.ts`. Add or extend a test: `/practices`, `/league/admin` and `/players/me` redirect to `/login` when signed out; `/players/signup` and `/l/some-league` do not.
- [ ] **Step 2: `.env.example`.** Add `NEXT_PUBLIC_APP_URL`, `ICS_FEED_BASE_URL`, `GOOGLE_MAPS_SERVER_API_KEY`, `INTERNAL_JOB_SECRET` with one-line comments; replace the "Vercel Cron" wording for `CRON_SECRET` with "the database scheduler"; change the `EXPO_PUBLIC_API_BASE_URL` example host to a Render-style URL.
- [ ] **Step 3: Runbook** with these sections, each a checklist: Render environment variables (the `REQUIRED_ENV` and `RECOMMENDED_ENV` names and what breaks without each); Supabase Vault secrets (the four names and a `select vault.create_secret('<value>', '<name>');` line each); edge-function secrets and deploy (`verify_jwt` false for the three functions, however deployed); GitHub branch protection (require `checks`, `edge-functions`, `database` on `main`); reading `/admin/errors` and the Jobs panel; turning a job off (`select cron.unschedule('<name>')`); raising the minimum app version (edit `MIN_SUPPORTED_MOBILE_VERSION`, deploy web, only after the new TestFlight build is available).
- [ ] **Step 4: CLAUDE.md.** Repository Status (tests configured; CI runs on PRs); Architecture table and "DiamondOS Context" (web on Render; remove Vercel); directory structure note ("12 ordered SQL migration files" → no count); the Environment Variables table (add the variables from Step 2, fix `CRON_SECRET`'s description); glossary entries **ErrorLog**, **BackgroundJobs**, **AppVersionWarning** summarizing the spec's sections 2, 4 and 5 in the glossary's existing style, including: the pitch-count trigger is disabled until Phase 3, and the `/api/m/v1` rule that responses and requests only gain optional fields.
- [ ] **Step 5: Run** `pnpm type-check && pnpm lint && pnpm test` → PASS.
- [ ] **Step 6: Commit** `docs: document production setup, background jobs and the error log`.

---

## After each part

Run the CodeRabbit review the project requires (`~/.local/bin/coderabbit review --agent --committed --base main -c CLAUDE.md`), fix what it finds, then open the PR.
