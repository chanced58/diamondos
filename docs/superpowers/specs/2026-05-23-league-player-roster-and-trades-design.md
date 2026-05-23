# League Player Roster & Trades — Design

**Date:** 2026-05-23
**Status:** Approved approach (Option A), pending spec sign-off
**Owner:** Chance Douglass

## Problem

League admins have no way to:

1. Register players into the league independent of any single team (e.g., a kid signs up for the league before the draft, or sits between team assignments).
2. View a single roster of every player in the league, across all teams and divisions.
3. Move a player from one team to another — at season boundaries or mid-season — with an audit trail.

Today, `players` are team-scoped. `team_id` was made nullable for guest-only identities (migration `20260522000003`), and `league_players` exists as an appearance-based registry. Neither is exposed to a league admin as a manageable entity.

## Goals

- League admin can register a player into the league with or without an immediate team assignment.
- League admin can view all players in the league, filter by team / division / status, and search by name or jersey.
- League admin can execute a "trade" (move a player between teams) or "release" (move a player to free-agent state) with a recorded audit row capturing actor, reason, effective date, and transfer type.
- Mid-season trades preserve split-by-team stat attribution (already true via event sourcing — formally relied on here).
- Only `league_admin` role can mutate; `league_manager` and league members can read.

## Non-goals (v1)

- Bulk CSV / paste-text import. One-at-a-time form only.
- Coach-initiated trade proposals or two-coach approval workflows. Admin acts directly.
- Cross-league transfers. A player belongs to one league at a time.
- Email / push notifications to old + new coach on trade.
- Trade request inbox or pending-trade UI.

## Approach

Reuse the existing `players` table (`team_id IS NULL` represents the free-agent state) and the existing `league_players` registry (broaden its semantics from "appeared in a league game" to "registered in this league"). Add a single new audit table, `player_transfers`. No status enum on `players` — derived states are sufficient.

| State | `players.team_id` | `league_players` row | `is_guest_only` |
|---|---|---|---|
| Rostered in league | set | exists | false |
| Free agent in league | NULL | exists | false |
| Guest-only identity | NULL | exists | true |
| Pre-league player (legacy) | set | absent | false |

## Data Model

### Migration `20260523000001_league_player_registration_and_transfers.sql`

**Extend `league_players`:**

```sql
alter table public.league_players
  add column registered_at  timestamptz not null default now(),
  add column registered_by  uuid references auth.users(id),
  add column notes          text;

comment on table public.league_players is
  'Every player registered in this league — rostered, free agent, or guest-only. Source of truth for league membership; team affiliation lives on players.team_id.';
```

`first_seen_at` is retained for backward compatibility with the guest-flow auto-insert path. `registered_at` defaults to `now()` so pre-existing rows backfill cleanly. `registered_by` is NULL for auto-inserted rows from the guest flow, populated for admin-registered players.

**New table `player_transfers`:**

```sql
create type public.transfer_type as enum (
  'initial_assignment',
  'trade',
  'release',
  'reassignment'
);

create table public.player_transfers (
  id              uuid primary key default gen_random_uuid(),
  league_id       uuid not null references public.leagues(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  from_team_id    uuid references public.teams(id) on delete set null,
  to_team_id      uuid references public.teams(id) on delete set null,
  season_id       uuid references public.seasons(id) on delete set null,
  effective_at    timestamptz not null default now(),
  actor_user_id   uuid not null references auth.users(id),
  reason          text,
  transfer_type   public.transfer_type not null,
  created_at      timestamptz not null default now(),
  check (from_team_id is not null or to_team_id is not null)
);

create index idx_player_transfers_league on public.player_transfers(league_id, effective_at desc);
create index idx_player_transfers_player on public.player_transfers(player_id, effective_at desc);
```

`transfer_type` semantics:

- `initial_assignment` — first time a registered player gets a team (`from_team_id` is NULL).
- `trade` — moved between teams within the same season.
- `release` — removed from team to free-agent pool (`to_team_id` is NULL).
- `reassignment` — moved across season boundaries (different `season_id`).

No `update` or `delete` policy on `player_transfers` — append-only, matching `game_events`.

**No changes to `players`** — `team_id` is already nullable from `20260522000003`.

## Server actions

All in `apps/web/src/app/(app)/league/admin/players/actions.ts`. Each wraps the mutation + audit insert in a `security definer` SQL function so the two writes commit atomically.

### `createLeaguePlayer`

```ts
createLeaguePlayer({
  leagueId, firstName, lastName, dateOfBirth?, jerseyNumber?,
  primaryPosition?, bats?, throws?, graduationYear?, notes?,
  teamId?,
})
```

- Inserts `players` row (`team_id = teamId ?? null`).
- Inserts `league_players` row with `registered_by = auth.uid()`.
- If `teamId` is provided: inserts `player_transfers` row with `transfer_type='initial_assignment'`, `from_team_id=NULL`, `to_team_id=teamId`.
- Returns the new player.

### `transferPlayer`

```ts
transferPlayer({
  leagueId, playerId, toTeamId,    // toTeamId required (not NULL — that's release)
  effectiveAt?,                    // defaults to now(); accepts backdating for record-keeping
  reason?,
  seasonId?,                       // defaults to the player's current season (latest season_rosters row);
                                   // pass explicitly to record a cross-season move during off-season
  acceptJerseyClear?: boolean,     // second-call flag after JERSEY_CONFLICT is acknowledged
})
```

**Pre-flight guards** (return typed errors, do not throw):

- Player exists and has a `league_players(leagueId)` row.
- Destination team is in `league_members(leagueId, is_active=true)`.
- Player is **not** in any `game_lineups` row for a game where `games.status = 'in_progress'`. On violation: `IN_PROGRESS_GAME` with the offending `game_id`.
- Destination team has no other player on the same jersey number. On collision: returns `JERSEY_CONFLICT { conflictingPlayerName }` without mutating. The admin acknowledges in the UI; on the next call the server clears the traded player's `jersey_number` (only in the collision case) so the update can proceed, and the admin reassigns a number after the transfer. If there's no collision, the existing `jersey_number` is preserved across the move.

**On success:**

- Reads `players.team_id` with `select … for update` inside the transaction (concurrency guard).
- Updates `players.team_id = toTeamId`.
- Computes `transfer_type`:
  - `from_team_id IS NULL` → `initial_assignment`.
  - `from_team_id IS NOT NULL` and `season_id` matches player's previous transfer's `season_id` (or both NULL) → `trade`.
  - `from_team_id IS NOT NULL` and `season_id` differs → `reassignment`.
- Inserts the `player_transfers` row.

### `releasePlayer`

```ts
releasePlayer({ leagueId, playerId, reason?, effectiveAt? })
```

- Same `IN_PROGRESS_GAME` guard.
- Sets `players.team_id = NULL`.
- Inserts transfer with `to_team_id = NULL`, `transfer_type = 'release'`.

### `updateLeaguePlayer`

Non-transfer edits (name, DOB, jersey, position, bats, throws, graduation year, notes). Standard update — no transfer row written.

### SQL helper functions

- `public.fn_transfer_player(p_player_id, p_to_team_id, p_actor, p_reason, p_effective_at, p_season_id)` — `security definer`, returns the new transfer row or raises typed errors (`IN_PROGRESS_GAME`, `JERSEY_CONFLICT`, `NOT_IN_LEAGUE`).
- `public.fn_create_league_player(...)` — same pattern.
- `public.fn_release_player(...)` — same pattern.

### Authorization (defense in depth)

All four server actions verify `is_league_staff(leagueId, auth.uid()) AND get_league_role(leagueId, auth.uid()) = 'league_admin'` before proceeding. RLS policies below are the backstop.

## RLS

### `player_transfers`

```sql
alter table public.player_transfers enable row level security;

create policy "league_view_transfers"
  on public.player_transfers for select
  using (
    public.is_league_member(league_id, auth.uid())
    or public.is_league_staff(league_id, auth.uid())
    or public.is_platform_admin()
  );

create policy "league_admin_insert_transfers"
  on public.player_transfers for insert
  with check (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
    and actor_user_id = auth.uid()
  );
-- No update / delete policy — append-only.
```

### `league_players` — narrow insert to `league_admin`

The guest-flow insert path runs as `service_role` from a server action, which bypasses RLS, so narrowing the user-facing insert policy is safe.

```sql
drop policy "league_staff_insert_league_players" on public.league_players;

create policy "league_admin_insert_league_players"
  on public.league_players for insert
  with check (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
  );
-- Delete policy stays as-is (any league_staff can clean up bad entries).
```

### `players` — add league-admin insert + update path

```sql
create policy "league_admin_insert_players"
  on public.players for insert
  with check (
    (team_id is null
     and exists (
       select 1 from public.league_staff
       where user_id = auth.uid()
         and role = 'league_admin'
         and is_active = true
     ))
    or (team_id is not null
        and exists (
          select 1 from public.league_members lm
          where lm.team_id = public.players.team_id
            and public.get_league_role(lm.league_id, auth.uid()) = 'league_admin'
        ))
  );

create policy "league_admin_update_players"
  on public.players for update
  using (
    exists (
      select 1 from public.league_players lp
      where lp.player_id = public.players.id
        and public.get_league_role(lp.league_id, auth.uid()) = 'league_admin'
    )
  );
```

### No change to `season_rosters`

Mid-season trades leave the existing row intact. Team affiliation per game is preserved through `game_lineups.team_id`, which is the source of truth for split-by-team stats.

## UI

### Routes

- `/league/admin/players` — table index (search, filter, free-agent banner, row actions).
- `/league/admin/players/[playerId]` — detail view with transfer history timeline and edit form.

"Add Player" opens a dialog from the index page; no separate route.

### Components

| File | Role |
|---|---|
| `apps/web/src/app/(app)/league/admin/players/page.tsx` | Server component. Loads players via `league_players` → `players` → `teams` → `league_divisions`. |
| `apps/web/src/app/(app)/league/admin/players/LeaguePlayersTable.tsx` | Client component. Search + filter state in URL params. |
| `apps/web/src/app/(app)/league/admin/players/AddLeaguePlayerDialog.tsx` | Form with optional team picker. |
| `apps/web/src/app/(app)/league/admin/players/TradePlayerDialog.tsx` | Calls `transferPlayer`; handles `IN_PROGRESS_GAME` and `JERSEY_CONFLICT` typed errors with inline messages. |
| `apps/web/src/app/(app)/league/admin/players/ReleasePlayerDialog.tsx` | Confirmation + reason field. |
| `apps/web/src/app/(app)/league/admin/players/[playerId]/page.tsx` | Detail page. |
| `apps/web/src/app/(app)/league/admin/players/[playerId]/TransferHistoryTimeline.tsx` | Chronological list of transfers for one player. |

### Layout

The index page (mocked at `/league/admin/players`):

- Header: league name, counts (`N players · M free agents · K teams`).
- Top-right actions: `Export CSV` (dump current filtered view client-side), `+ Add Player`.
- Filter bar: search input, team select, division select, status select (rostered / free agent).
- Free-agent banner pinned above the table (only when count > 0) with a "View free agents" CTA that applies the free-agent filter.
- Table columns: Player (name + position labels), Team, Division, DOB, Jersey, Status pill, row actions (Trade, Edit; or Assign when free agent).

Trade modal fields: destination team select, effective date (defaults to today), reason textarea. Jersey-collision warning appears inline above the confirm button when the destination team already has the player's number; copy explains the jersey will be cleared on transfer.

### Navigation

Add "Players" link to `LeagueAdminClient.tsx` sidebar between "Scoring Settings" and "Opponent Teams". Visible to `is_league_staff` users.

### Shared Zod schemas

In `packages/shared/src/league/`:

- `createLeaguePlayerSchema`
- `transferPlayerSchema`
- `releasePlayerSchema`
- `updateLeaguePlayerSchema`

Each is reused by the server action and the dialog form.

## Edge cases

- **In-progress game:** Trade and release are blocked. UI surfaces the offending game with a deep link.
- **Jersey collision:** Server clears the traded player's `jersey_number` on transfer. UI warns the admin pre-confirm and prompts to reassign after.
- **Parent-player links:** Keyed by `player_id`, not team. Preserved automatically across trades.
- **Pitch counts & compliance:** Player-scoped. Rest-day tracking follows the player across trades.
- **Season rosters:** Mid-season trade leaves `season_rosters(season_id, player_id)` intact; per-game team attribution lives in `game_lineups.team_id`.
- **Released player who never played a game:** Drops to free agent; `league_players` row stays so they remain on the roster page.
- **Concurrent trades:** `fn_transfer_player` reads `players.team_id` with `select … for update` inside the transaction.
- **Correcting a mistaken transfer:** Append-only. Admin records a reversing transfer (back to the prior team) with a reason; the original row stays in history. Same convention as `game_events`.
- **Backdated transfers:** `effective_at` accepts a past timestamp for after-the-fact record-keeping. Stat attribution does *not* retroactively change, since stats follow `game_lineups.team_id` rows that were already written at the actual time of play.
- **Cross-season trade:** `transfer_type = 'reassignment'`; UI labels it "Season move" instead of "Trade".

## Domain glossary additions

Add to `CLAUDE.md`:

> **PlayerTransfer** — A recorded movement of a player between teams (or to/from the free-agent pool) within a league. Append-only row in `player_transfers`, written by league_admin server actions. Used for audit and history; does not itself drive stat attribution (which lives on `game_lineups.team_id`).
>
> **FreeAgent** — A player registered in a league (`league_players` row exists, `is_guest_only=false`) with `players.team_id IS NULL`. Eligible for assignment to a team via `transferPlayer`.

Existing `LeaguePlayer` glossary entry already covers the registry table.

## Open risks

- **Service-role guest insert path** must keep working after the `league_players` insert policy narrows to `league_admin`. Verify in the implementation step that the existing guest-flow server action uses the service role (it does today per the migration comment, but worth confirming).
- **`league_admin_update_players` policy** lets an admin update any player in any league they admin. Confirm no existing tests assume team-coach is the only updater.

## Order of work

1. Migration: schema + RLS.
2. Regenerate types: `pnpm --filter @baseball/database gen-types`.
3. Shared package: Zod schemas in `packages/shared/src/league/`.
4. SQL helper functions and server actions.
5. Web UI: page, table, dialogs, nav link.
6. `CLAUDE.md` glossary update.
7. CodeRabbit review per project convention.
