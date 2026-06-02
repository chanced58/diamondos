# League Home Page — Design

**Date:** 2026-05-31
**Status:** Approved (design); implementation plan to follow
**Repo:** `diamondos-league-home-page` (baseballcoachesapp monorepo)

## Goal

Every league gets a public-facing **home page** that serves as a live **status page** for the
league: standings plus statistical leaders across all key categories, presented in an engaging way
that celebrates the successes of players and teams.

- Publicly visible by default; a league admin can set visibility to **"Signed In Users Only."**
- League admins can add up to **5 custom (non-standard) leader categories** on top of the defaults.
- Engaging, branded presentation (hero, spotlights, recent results) — built to highlight player and
  team success.

## A. Approach

Build a **new public, server-rendered route `/l/[slug]`** backed by **precomputed snapshot tables**.

Rejected alternatives (decided during brainstorming):

- **Enhancing the existing `/(app)/league` page** — entangles public access with the auth-gated,
  active-team-cookie assumptions of the current member page. Higher risk, less clean.
- **SQL-reimplemented stat views** — would duplicate and inevitably drift from the complex TypeScript
  reducers (wOBA, QAB, ERA, WHIP) that are the source of truth today.

**Guiding principle:** the public page never touches the `game_events` log or the TypeScript reducers
at request time. It reads cheap, pre-aggregated snapshot rows. Reducers run only inside a background
refresh job.

## B. Data model changes (Postgres migrations)

### 1. `leagues` — new columns

- `slug text unique not null` — public URL identifier (generated from name, editable, uniqueness-checked).
- `visibility text not null default 'public'` — check constraint `('public','signed_in')`.
- `home_theme jsonb not null default '{}'` — accent color, secondary color, banner image URL, hero
  title, hero tagline, section order + on/off toggles. Validated by a new `leagueHomeThemeSchema`
  (Zod) in `@baseball/shared`.
- `leader_config jsonb not null default '{}'` — the ≤5 custom categories + qualifier overrides for
  default rate boards. Validated by a new `leagueLeaderConfigSchema`.

### 2. Player public-display opt-out

- `league_players.public_opt_out boolean not null default false` — per-league, per-player suppression
  from public listings. A display-name helper renders `"Alex R."` publicly, full name to signed-in
  members, and omits opted-out players from public boards entirely.

### 3. Snapshot tables (season-scoped, service-role written, read-only to the page)

- `league_standings_snapshot` — `(league_id, season, team_id, division_id, wins, losses, ties,
  runs_for, runs_against, win_pct, streak, updated_at)`.
- `league_player_stat_snapshot` — `(league_id, season, league_player_id, team_id, <all computed
  batting/pitching/fielding stats as columns>, qualifier counts (PA, IP), updated_at)`.
- `league_team_stat_snapshot` — `(league_id, season, team_id, <team-level aggregates>, updated_at)`.
- `league_spotlight_snapshot` — `(league_id, season, type, subject_id, blurb fields, window,
  updated_at)`.

Snapshots are keyed by `(league_id, season, …)` so the **season switcher** and **past-season
viewing** work for free. Within-league player identity = `league_players.player_id` (stable across
team transfers inside a league).

## C. Snapshot refresh engine

- A server-side **recompute job** (Node, in the web app — reuses `@baseball/shared` reducers; **not** a
  Deno edge function, so the stat logic is never forked) takes `(league_id, season)`, pulls all
  completed games + their `game_events`, runs the existing batting/pitching/fielding reducers,
  **attributes stats via `game_lineups.team_id`** (respecting guest `countTowardStats` settings),
  aggregates per player/team, recomputes standings from the `games` score columns, derives spotlights,
  and **upserts** the four snapshot tables in a transaction.
- **Triggers:**
  1. When a game flips to `completed`, a server action calls recompute for that league + season.
  2. A **scheduled safety-net** full rebuild (Vercel Cron → protected route handler) self-heals any
     missed trigger.
- **Spotlights** (auto, fixed logic): trailing 7-day window — top batter by a composite (OPS-weighted)
  score among qualifiers; hottest team by recent win% + run differential.

## D. Public page `/l/[slug]` (SSR)

**Visibility enforcement:** the server component loads the league by slug; if `visibility =
'signed_in'` and there is no authenticated user → render a "sign in to view" gate and mark the page
`noindex`. Public leagues are fully indexable. Data is fetched **server-side via the service-role
client** reading only the snapshot tables (no anonymous RLS surface is opened on `game_events`).

**Sections (order/visibility admin-configurable via `home_theme`):**

1. **Hero** — league logo, name, accent-colored banner, custom headline/tagline, headline counters
   (teams, games played, season).
2. **Standings** — by division: W-L-T, win%, runs for/against, streak.
3. **Statistical leaders** — default boards:
   - **Batting:** AVG, HR, RBI, H, R, SB, OBP, OPS.
   - **Pitching:** ERA, W, K, WHIP, SV.
   - **Team:** team AVG, team ERA, runs scored, run differential.
   - Rate boards apply qualifier minimums.
4. **Custom leaders** — up to 5 admin-defined boards, each a player **or** team board drawn from the
   computed-stat catalog.
5. **Recent results + upcoming** — latest finals and next scheduled games from `games`.
6. **Spotlights** — Player of the Week / Hot Team cards.

**Player names:** first name + last initial publicly; full names to signed-in members; opted-out
players excluded. **SEO:** per-page SSR metadata + a generated Open Graph share image
(standings/leaders snapshot). Signed-in-only leagues are `noindex`.

## E. League-admin settings UI (`/(app)/league/admin`)

Extends the existing admin area with a **"Home Page"** settings panel (mirrors the existing
`LeagueScoringSettingsForm` + scoring-settings endpoint pattern; gated to `league_admin`):

- Visibility toggle (Public / Signed In Users Only) + slug editor (uniqueness-checked).
- Theme editor: accent + secondary color, banner upload, hero title/tagline, section show-hide +
  reorder.
- **Custom categories manager** (≤5): per slot pick subject (player/team) → stat from catalog → label
  → sort direction → optional qualifier override. Validated by `leagueLeaderConfigSchema`.
- Qualifier-threshold overrides for default rate boards (sensible defaults pre-filled).
- Player public opt-out management.

Persisted via a new `/api/league/home-settings` route handler.

### Qualifier defaults

- Rate stats (AVG, OBP, SLG, OPS, ERA, WHIP) require a minimum (e.g. ~2.0 PA per team game for
  batting; ~1.0 IP per team game for pitching). Admin-overridable.
- Counting stats (HR, RBI, K, etc.) have no minimum.
- No-qualifier behavior is never the default (avoids a 1-for-1 hitter topping the AVG board).

## F. Phasing

### v1 (core — this spec's implementation plan)

Everything in sections B–E: migrations, snapshot engine + triggers, the public `/l/[slug]` page
(standings, default + custom leaders, recent/upcoming, spotlights, hero/theme), admin settings,
privacy display, SEO/OG. Season switcher + past-season viewing are included (snapshots are
season-scoped).

In v1, leaderboard/standings names are **not yet links** — the detail pages they would point to are
v2.

### v2 (flagged; separate designs/plans later)

- Public **player career page** (cross-league) + public **team detail pages** + clickable
  leaderboard/standings names. **Cross-league player-identity resolution gets its own focused
  mini-design** — the hard part: reconciling per-team `players` rows vs `player_external_ids` vs a
  linked user account.
- **Mobile** (Expo) league-home read view consuming the same snapshots.
- **Milestones / achievements feed** (auto-detected walk-offs, multi-HR games, no-hitters, hitting
  streaks).
- Admin-tunable spotlight window/metric.

## G. Testing & risks

### Testing

- Unit tests for snapshot aggregation (reusing existing reducer fixtures), qualifier logic, the
  display-name/opt-out helper, slug generation/uniqueness, and custom-category validation.

### Risks

1. **Recompute cost for large leagues** — mitigated by incremental per-game triggers + a bounded cron
   safety net.
2. **Stat attribution edge cases (guests/transfers)** — mitigated by reusing the existing
   `game_lineups.team_id` attribution path.
3. **Privacy regressions for minors** — mitigated by the per-player opt-out + name-masking helper,
   covered by tests.
4. **Cross-league identity** — deliberately deferred to v2 to avoid a wrong early commitment.

## Decisions log (from brainstorming)

- Route: new public `/l/[slug]` (SSR).
- Stats engine: precomputed snapshot tables (not on-demand replay, not SQL views).
- Time scope: current season default + season switcher + past seasons (v1); cross-league career page
  (v2).
- Platforms: web (v1); mobile read view (v2).
- Default leaders: classic batting + pitching + team boards.
- Custom categories: catalog-derived computed stats; admin chooses player or team per slot; ≤5.
- Qualifiers: sensible defaults, admin-overridable.
- Refresh: on game finalize + scheduled safety net.
- Private scope: "Signed In Users Only" = any authenticated platform user.
- Engagement modules: hero + branding, recent results + upcoming, auto player/team spotlights.
  (Milestones feed deferred to v2.)
- Theming: colors + banner + hero copy + section toggles/reorder.
- Player privacy: first name + last initial publicly, full names to members, per-player opt-out.
- Drill-down: public player & team pages (v2).
- SEO: SSR + Open Graph share images; signed-in-only leagues noindex.
