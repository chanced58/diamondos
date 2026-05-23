# League Player Roster & Trades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give league admins a way to register players into a league independent of teams, see a single roster of all league players, and execute audited trades / releases.

**Architecture:** Hybrid model — `players.team_id IS NULL` is the free-agent state; `league_players` (existing) is the registered-in-league registry, broadened to support admin-registered entries; new `player_transfers` append-only audit table; `league_admin`-gated server actions wrap mutation + audit insert atomically via SQL functions.

**Tech Stack:** Supabase Postgres + RLS, Next.js 14 App Router server actions, Zod schemas in `@baseball/shared`, query helpers in `@baseball/database`, jest for shared-package tests.

**Spec:** `docs/superpowers/specs/2026-05-23-league-player-roster-and-trades-design.md`

---

## File Map

| Path | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260523000001_league_player_registration_and_transfers.sql` | new | Schema, RLS, SQL helper functions |
| `packages/database/src/types/supabase.ts` | regen | Generated DB types |
| `packages/database/src/queries/league-players.ts` | new | Read helpers (`getLeaguePlayers`, `getPlayerTransfers`) |
| `packages/database/src/queries/index.ts` | modify | Re-export new query module |
| `packages/database/src/index.ts` | modify | Surface new helpers if not already covered |
| `packages/shared/src/validation/league-player.ts` | new | Zod schemas + inferred input types |
| `packages/shared/src/validation/__tests__/league-player.test.ts` | new | Schema-level jest tests |
| `packages/shared/src/validation/index.ts` | modify | Re-export new schemas |
| `apps/web/src/app/(app)/league/admin/players/page.tsx` | new | Server component: load + render roster |
| `apps/web/src/app/(app)/league/admin/players/LeaguePlayersTable.tsx` | new | Client table with filters and row actions |
| `apps/web/src/app/(app)/league/admin/players/actions.ts` | new | Server actions calling SQL functions |
| `apps/web/src/app/(app)/league/admin/players/AddLeaguePlayerDialog.tsx` | new | Add-player form dialog |
| `apps/web/src/app/(app)/league/admin/players/TradePlayerDialog.tsx` | new | Trade form dialog + collision flow |
| `apps/web/src/app/(app)/league/admin/players/ReleasePlayerDialog.tsx` | new | Release confirmation dialog |
| `apps/web/src/app/(app)/league/admin/players/[playerId]/page.tsx` | new | Player detail + edit |
| `apps/web/src/app/(app)/league/admin/players/[playerId]/TransferHistoryTimeline.tsx` | new | History list |
| `apps/web/src/components/layout/Sidebar.tsx` | modify | Add "League Players" link gated on `isLeagueAdmin` |
| `CLAUDE.md` | modify | Glossary additions: `PlayerTransfer`, `FreeAgent` |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260523000001_league_player_registration_and_transfers.sql`

- [ ] **Step 1: Confirm DB target with user**

Memory `feedback_confirm_db_target` requires asking prod vs dev before any migration. Ask the user explicitly: "Apply this migration to dev or prod first?" before invoking `mcp__claude_ai_Supabase__apply_migration`.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260523000001_league_player_registration_and_transfers.sql`:

```sql
-- League player registration + trades:
-- 1) Extend league_players with registered_at / registered_by / notes so league
--    admin can register a player into the league without (yet) putting them on
--    a team. Existing rows auto-populated by the guest flow get sensible defaults.
-- 2) New player_transfers append-only audit table — every team move (assignment,
--    trade, release, season reassignment) writes a row.
-- 3) RLS: mutations are league_admin-only; reads are league-member + staff.
-- 4) SQL helper functions wrap mutation + audit insert in a single transaction
--    with select-for-update to prevent races.

-- ── 1. league_players: widen semantics ─────────────────────────────────────

alter table public.league_players
  add column registered_at timestamptz not null default now(),
  add column registered_by uuid references auth.users(id),
  add column notes         text;

comment on table public.league_players is
  'Every player registered in this league — rostered, free agent, or guest-only. Source of truth for league membership; team affiliation lives on players.team_id.';

comment on column public.league_players.registered_at is
  'When this player was registered into the league (admin add OR first appearance).';

comment on column public.league_players.registered_by is
  'Auth user who registered the player; NULL for rows auto-inserted by the guest flow.';

-- ── 2. player_transfers ───────────────────────────────────────────────────

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

comment on table public.player_transfers is
  'Append-only audit log of player movements within a league. Mirrors game_events convention: never updated, never deleted; reversals are recorded as new rows.';

create index idx_player_transfers_league
  on public.player_transfers (league_id, effective_at desc);

create index idx_player_transfers_player
  on public.player_transfers (player_id, effective_at desc);

-- ── 3. RLS ────────────────────────────────────────────────────────────────

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
-- No update / delete policies — append-only.

-- Narrow league_players insert to league_admin (was league_staff).
-- The guest-flow path runs as service_role and bypasses RLS, so this is safe.
drop policy if exists "league_staff_insert_league_players" on public.league_players;
create policy "league_admin_insert_league_players"
  on public.league_players for insert
  with check (
    public.get_league_role(league_id, auth.uid()) = 'league_admin'
  );

-- Add league-admin insert + update paths on players (existing team-coach paths
-- remain). The insert policy allows NULL team_id (free agent) when the actor
-- is a league_admin in any league, OR a non-NULL team_id when the team belongs
-- to a league this user admins.
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

-- ── 4. SQL helper functions ───────────────────────────────────────────────

-- fn_create_league_player: creates a players row + league_players row + (if
-- teamId provided) an initial_assignment transfer row. Atomic.
create or replace function public.fn_create_league_player(
  p_league_id        uuid,
  p_first_name       text,
  p_last_name        text,
  p_date_of_birth    date,
  p_jersey_number    smallint,
  p_primary_position public.player_position,
  p_bats             public.bats_throws,
  p_throws           public.bats_throws,
  p_graduation_year  smallint,
  p_notes            text,
  p_team_id          uuid,
  p_actor            uuid
) returns public.players
language plpgsql security definer
as $$
declare
  v_player public.players;
begin
  -- Authorization
  if public.get_league_role(p_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.players (
    team_id, first_name, last_name, date_of_birth, jersey_number,
    primary_position, bats, throws, graduation_year, notes
  ) values (
    p_team_id, p_first_name, p_last_name, p_date_of_birth, p_jersey_number,
    p_primary_position, p_bats, p_throws, p_graduation_year, p_notes
  )
  returning * into v_player;

  insert into public.league_players (league_id, player_id, registered_by)
  values (p_league_id, v_player.id, p_actor);

  if p_team_id is not null then
    insert into public.player_transfers (
      league_id, player_id, from_team_id, to_team_id,
      actor_user_id, reason, transfer_type
    ) values (
      p_league_id, v_player.id, null, p_team_id,
      p_actor, null, 'initial_assignment'
    );
  end if;

  return v_player;
end;
$$;

-- fn_transfer_player: moves a player between teams (or to a team for the first
-- time, if from is NULL). Guards in-progress games and jersey collisions.
-- p_accept_jersey_clear lets the second call (after JERSEY_CONFLICT) proceed
-- by clearing the player's jersey_number atomically.
create or replace function public.fn_transfer_player(
  p_league_id            uuid,
  p_player_id            uuid,
  p_to_team_id           uuid,
  p_effective_at         timestamptz,
  p_reason               text,
  p_season_id            uuid,
  p_accept_jersey_clear  boolean,
  p_actor                uuid
) returns public.player_transfers
language plpgsql security definer
as $$
declare
  v_from_team_id   uuid;
  v_jersey         smallint;
  v_last_season    uuid;
  v_in_progress    uuid;
  v_collision      record;
  v_transfer_type  public.transfer_type;
  v_row            public.player_transfers;
begin
  -- Authorization
  if public.get_league_role(p_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_to_team_id is null then
    raise exception 'TO_TEAM_REQUIRED' using errcode = '22023';
  end if;

  -- Player must be in this league
  if not exists (
    select 1 from public.league_players
    where league_id = p_league_id and player_id = p_player_id
  ) then
    raise exception 'NOT_IN_LEAGUE' using errcode = 'P0002';
  end if;

  -- Destination team must be in this league and active
  if not exists (
    select 1 from public.league_members
    where league_id = p_league_id and team_id = p_to_team_id and is_active = true
  ) then
    raise exception 'TEAM_NOT_IN_LEAGUE' using errcode = 'P0002';
  end if;

  -- Lock the player row; capture current team and jersey
  select team_id, jersey_number
    into v_from_team_id, v_jersey
    from public.players
    where id = p_player_id
    for update;

  -- In-progress game guard
  select gl.game_id
    into v_in_progress
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.player_id = p_player_id
      and g.status = 'in_progress'
    limit 1;

  if v_in_progress is not null then
    raise exception 'IN_PROGRESS_GAME:%', v_in_progress using errcode = 'P0001';
  end if;

  -- Jersey collision check on destination team
  if v_jersey is not null then
    select p.id, p.first_name, p.last_name
      into v_collision
      from public.players p
      where p.team_id = p_to_team_id
        and p.jersey_number = v_jersey
        and p.id <> p_player_id
      limit 1;

    if found then
      if not p_accept_jersey_clear then
        raise exception 'JERSEY_CONFLICT:% %', v_collision.first_name, v_collision.last_name
          using errcode = 'P0001';
      else
        update public.players set jersey_number = null where id = p_player_id;
      end if;
    end if;
  end if;

  -- Decide transfer_type
  select season_id
    into v_last_season
    from public.player_transfers
    where player_id = p_player_id
    order by effective_at desc
    limit 1;

  if v_from_team_id is null then
    v_transfer_type := 'initial_assignment';
  elsif (v_last_season is null and p_season_id is null) or v_last_season = p_season_id then
    v_transfer_type := 'trade';
  else
    v_transfer_type := 'reassignment';
  end if;

  -- Mutate + audit
  update public.players set team_id = p_to_team_id where id = p_player_id;

  insert into public.player_transfers (
    league_id, player_id, from_team_id, to_team_id, season_id,
    effective_at, actor_user_id, reason, transfer_type
  ) values (
    p_league_id, p_player_id, v_from_team_id, p_to_team_id, p_season_id,
    coalesce(p_effective_at, now()), p_actor, p_reason, v_transfer_type
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- fn_release_player: moves a player to free-agent state (team_id = NULL) with
-- a 'release' transfer row. Guards in-progress games. Idempotent: releasing an
-- already-free-agent player raises NOT_ON_TEAM.
create or replace function public.fn_release_player(
  p_league_id    uuid,
  p_player_id    uuid,
  p_effective_at timestamptz,
  p_reason       text,
  p_actor        uuid
) returns public.player_transfers
language plpgsql security definer
as $$
declare
  v_from_team_id uuid;
  v_in_progress  uuid;
  v_row          public.player_transfers;
begin
  if public.get_league_role(p_league_id, p_actor) is distinct from 'league_admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.league_players
    where league_id = p_league_id and player_id = p_player_id
  ) then
    raise exception 'NOT_IN_LEAGUE' using errcode = 'P0002';
  end if;

  select team_id into v_from_team_id
    from public.players where id = p_player_id for update;

  if v_from_team_id is null then
    raise exception 'NOT_ON_TEAM' using errcode = 'P0001';
  end if;

  select gl.game_id into v_in_progress
    from public.game_lineups gl
    join public.games g on g.id = gl.game_id
    where gl.player_id = p_player_id and g.status = 'in_progress'
    limit 1;
  if v_in_progress is not null then
    raise exception 'IN_PROGRESS_GAME:%', v_in_progress using errcode = 'P0001';
  end if;

  update public.players set team_id = null where id = p_player_id;

  insert into public.player_transfers (
    league_id, player_id, from_team_id, to_team_id,
    effective_at, actor_user_id, reason, transfer_type
  ) values (
    p_league_id, p_player_id, v_from_team_id, null,
    coalesce(p_effective_at, now()), p_actor, p_reason, 'release'
  ) returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.fn_create_league_player(
  uuid, text, text, date, smallint, public.player_position, public.bats_throws,
  public.bats_throws, smallint, text, uuid, uuid
) to authenticated;

grant execute on function public.fn_transfer_player(
  uuid, uuid, uuid, timestamptz, text, uuid, boolean, uuid
) to authenticated;

grant execute on function public.fn_release_player(
  uuid, uuid, timestamptz, text, uuid
) to authenticated;
```

- [ ] **Step 3: Apply migration to the user-confirmed target**

Use `mcp__claude_ai_Supabase__apply_migration` with `name='league_player_registration_and_transfers'` and the SQL body above. Verify the response shows the new objects.

- [ ] **Step 4: Smoke-check via execute_sql**

```sql
select table_name from information_schema.tables
  where table_schema='public' and table_name='player_transfers';

select column_name from information_schema.columns
  where table_schema='public' and table_name='league_players'
  and column_name in ('registered_at','registered_by','notes')
  order by column_name;

select proname from pg_proc
  where proname in ('fn_create_league_player','fn_transfer_player','fn_release_player');
```

Expected: `player_transfers` row, three `league_players` columns, three function rows.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260523000001_league_player_registration_and_transfers.sql
git commit -m "feat(db): add player_transfers + league_player registration plumbing"
```

---

## Task 2: Regenerate database types

**Files:**
- Modify: `packages/database/src/types/supabase.ts`

- [ ] **Step 1: Regenerate**

```bash
pnpm --filter @baseball/database gen-types
```

Expected: the `player_transfers` table and `transfer_type` enum appear in `packages/database/src/types/supabase.ts`; `league_players` gains three columns.

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/types/supabase.ts
git commit -m "chore(db): regenerate types for player_transfers"
```

---

## Task 3: Shared Zod schemas + tests

**Files:**
- Create: `packages/shared/src/validation/league-player.ts`
- Create: `packages/shared/src/validation/__tests__/league-player.test.ts`
- Modify: `packages/shared/src/validation/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/validation/__tests__/league-player.test.ts`:

```ts
import {
  createLeaguePlayerSchema,
  transferPlayerSchema,
  releasePlayerSchema,
  updateLeaguePlayerSchema,
} from '../league-player';

describe('createLeaguePlayerSchema', () => {
  const base = {
    leagueId: '00000000-0000-0000-0000-000000000001',
    firstName: 'Mateo',
    lastName: 'Reyes',
  };

  it('accepts the minimum required shape', () => {
    expect(createLeaguePlayerSchema.parse(base)).toMatchObject({
      firstName: 'Mateo',
      lastName: 'Reyes',
    });
  });

  it('trims first and last names', () => {
    const out = createLeaguePlayerSchema.parse({ ...base, firstName: '  Sam  ', lastName: '  Chen  ' });
    expect(out.firstName).toBe('Sam');
    expect(out.lastName).toBe('Chen');
  });

  it('rejects empty first name', () => {
    expect(() => createLeaguePlayerSchema.parse({ ...base, firstName: ' ' })).toThrow();
  });

  it('coerces empty optional team_id to undefined', () => {
    const out = createLeaguePlayerSchema.parse({ ...base, teamId: '' });
    expect(out.teamId).toBeUndefined();
  });

  it('rejects malformed UUIDs on team_id', () => {
    expect(() => createLeaguePlayerSchema.parse({ ...base, teamId: 'not-a-uuid' })).toThrow();
  });

  it('rejects jersey numbers outside 0..99', () => {
    expect(() => createLeaguePlayerSchema.parse({ ...base, jerseyNumber: -1 })).toThrow();
    expect(() => createLeaguePlayerSchema.parse({ ...base, jerseyNumber: 100 })).toThrow();
  });
});

describe('transferPlayerSchema', () => {
  const base = {
    leagueId: '00000000-0000-0000-0000-000000000001',
    playerId: '00000000-0000-0000-0000-000000000002',
    toTeamId: '00000000-0000-0000-0000-000000000003',
  };

  it('accepts the minimum required shape', () => {
    expect(transferPlayerSchema.parse(base)).toMatchObject({
      toTeamId: base.toTeamId,
      acceptJerseyClear: false,
    });
  });

  it('defaults acceptJerseyClear to false', () => {
    expect(transferPlayerSchema.parse(base).acceptJerseyClear).toBe(false);
  });

  it('rejects when toTeamId is missing', () => {
    expect(() => transferPlayerSchema.parse({ ...base, toTeamId: undefined })).toThrow();
  });

  it('caps reason at 500 chars', () => {
    expect(() => transferPlayerSchema.parse({ ...base, reason: 'x'.repeat(501) })).toThrow();
  });
});

describe('releasePlayerSchema', () => {
  it('accepts minimum required shape', () => {
    expect(
      releasePlayerSchema.parse({
        leagueId: '00000000-0000-0000-0000-000000000001',
        playerId: '00000000-0000-0000-0000-000000000002',
      }),
    ).toBeTruthy();
  });
});

describe('updateLeaguePlayerSchema', () => {
  it('requires playerId', () => {
    expect(() => updateLeaguePlayerSchema.parse({ firstName: 'Jordan' })).toThrow();
  });

  it('allows partial updates with only playerId + one field', () => {
    expect(
      updateLeaguePlayerSchema.parse({
        playerId: '00000000-0000-0000-0000-000000000002',
        firstName: 'Jordan',
      }),
    ).toMatchObject({ firstName: 'Jordan' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @baseball/shared test -- league-player
```

Expected: FAIL — module `../league-player` does not exist.

- [ ] **Step 3: Implement the schemas**

Create `packages/shared/src/validation/league-player.ts`:

```ts
import { z } from 'zod';

const PLAYER_POSITION = z.enum([
  'pitcher','catcher','first_base','second_base','third_base','shortstop',
  'left_field','center_field','right_field','designated_hitter','utility',
]);

const BATS_THROWS = z.enum(['right','left','switch']);

const uuid = () => z.string().uuid();

const trimmedNonEmpty = (max: number) =>
  z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(max));

const optionalUuid = () =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    uuid().optional(),
  );

export const createLeaguePlayerSchema = z.object({
  leagueId: uuid(),
  firstName: trimmedNonEmpty(80),
  lastName:  trimmedNonEmpty(80),
  dateOfBirth: z.string().date().optional(),     // YYYY-MM-DD
  jerseyNumber: z.number().int().min(0).max(99).optional(),
  primaryPosition: PLAYER_POSITION.optional(),
  bats: BATS_THROWS.optional(),
  throws: BATS_THROWS.optional(),
  graduationYear: z.number().int().min(1900).max(2100).optional(),
  notes: z.string().max(2000).optional(),
  teamId: optionalUuid(),
});

export type CreateLeaguePlayerInput = z.infer<typeof createLeaguePlayerSchema>;

export const transferPlayerSchema = z.object({
  leagueId: uuid(),
  playerId: uuid(),
  toTeamId: uuid(),
  effectiveAt: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
  seasonId: optionalUuid(),
  acceptJerseyClear: z.boolean().default(false),
});

export type TransferPlayerInput = z.infer<typeof transferPlayerSchema>;

export const releasePlayerSchema = z.object({
  leagueId: uuid(),
  playerId: uuid(),
  effectiveAt: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
});

export type ReleasePlayerInput = z.infer<typeof releasePlayerSchema>;

export const updateLeaguePlayerSchema = z.object({
  playerId: uuid(),
  firstName: trimmedNonEmpty(80).optional(),
  lastName:  trimmedNonEmpty(80).optional(),
  dateOfBirth: z.string().date().optional(),
  jerseyNumber: z.number().int().min(0).max(99).nullable().optional(),
  primaryPosition: PLAYER_POSITION.nullable().optional(),
  bats: BATS_THROWS.nullable().optional(),
  throws: BATS_THROWS.nullable().optional(),
  graduationYear: z.number().int().min(1900).max(2100).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type UpdateLeaguePlayerInput = z.infer<typeof updateLeaguePlayerSchema>;
```

- [ ] **Step 4: Re-export from validation index**

Add to the end of `packages/shared/src/validation/index.ts`:

```ts
export * from './league-player';
```

- [ ] **Step 5: Run tests + type-check**

```bash
pnpm --filter @baseball/shared test -- league-player
pnpm type-check
```

Expected: all tests pass; type-check clean.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/validation/league-player.ts \
        packages/shared/src/validation/__tests__/league-player.test.ts \
        packages/shared/src/validation/index.ts
git commit -m "feat(shared): add league-player + transfer Zod schemas"
```

---

## Task 4: DB query helpers

**Files:**
- Create: `packages/database/src/queries/league-players.ts`
- Modify: `packages/database/src/queries/index.ts`

- [ ] **Step 1: Write query helpers**

Create `packages/database/src/queries/league-players.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type LeaguePlayerRow = {
  player_id: string;
  league_id: string;
  registered_at: string;
  registered_by: string | null;
  notes: string | null;
  player: {
    id: string;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
    primary_position: string | null;
    bats: string | null;
    throws: string | null;
    date_of_birth: string | null;
    graduation_year: number | null;
    is_guest_only: boolean;
    team_id: string | null;
    team: { id: string; name: string; organization: string | null } | null;
  };
};

/**
 * All players registered in the league, with their current team (if any).
 * Filters out guest-only identities by default.
 */
export async function getLeaguePlayers(
  db: SupabaseClient,
  leagueId: string,
  opts: { includeGuests?: boolean } = {},
): Promise<LeaguePlayerRow[]> {
  let q = db
    .from('league_players')
    .select(`
      player_id, league_id, registered_at, registered_by, notes,
      player:players!inner(
        id, first_name, last_name, jersey_number, primary_position, bats, throws,
        date_of_birth, graduation_year, is_guest_only, team_id,
        team:teams(id, name, organization)
      )
    `)
    .eq('league_id', leagueId);

  if (!opts.includeGuests) {
    q = q.eq('player.is_guest_only', false);
  }

  const { data, error } = await q.order('last_name', { referencedTable: 'players' });
  if (error) throw error;
  return (data ?? []) as unknown as LeaguePlayerRow[];
}

export type PlayerTransferRow = {
  id: string;
  league_id: string;
  player_id: string;
  from_team_id: string | null;
  to_team_id: string | null;
  season_id: string | null;
  effective_at: string;
  actor_user_id: string;
  reason: string | null;
  transfer_type: 'initial_assignment' | 'trade' | 'release' | 'reassignment';
  from_team: { id: string; name: string } | null;
  to_team: { id: string; name: string } | null;
};

export async function getPlayerTransfers(
  db: SupabaseClient,
  playerId: string,
): Promise<PlayerTransferRow[]> {
  const { data, error } = await db
    .from('player_transfers')
    .select(`
      id, league_id, player_id, from_team_id, to_team_id, season_id,
      effective_at, actor_user_id, reason, transfer_type,
      from_team:teams!player_transfers_from_team_id_fkey(id, name),
      to_team:teams!player_transfers_to_team_id_fkey(id, name)
    `)
    .eq('player_id', playerId)
    .order('effective_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PlayerTransferRow[];
}
```

- [ ] **Step 2: Re-export from queries index**

Add to `packages/database/src/queries/index.ts`:

```ts
export * from './league-players';
```

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/queries/league-players.ts \
        packages/database/src/queries/index.ts
git commit -m "feat(db): add league-players + player-transfers query helpers"
```

---

## Task 5: Server actions

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/players/actions.ts`

- [ ] **Step 1: Implement the four actions**

Create `apps/web/src/app/(app)/league/admin/players/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueAccess } from '@/lib/league-access';
import {
  createLeaguePlayerSchema, transferPlayerSchema,
  releasePlayerSchema, updateLeaguePlayerSchema,
  type CreateLeaguePlayerInput, type TransferPlayerInput,
  type ReleasePlayerInput, type UpdateLeaguePlayerInput,
} from '@baseball/shared';

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; meta?: Record<string, unknown> };

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireLeagueAdmin(leagueId: string): Promise<
  { user: { id: string } } | { error: string }
> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'NOT_AUTHENTICATED' };
  const access = await getLeagueAccess(leagueId, user.id);
  if (!access.isLeagueAdmin) return { error: 'FORBIDDEN' };
  return { user };
}

/** Maps Postgres exceptions raised by SQL helper functions into typed Result. */
function parsePgError(message: string): { code: string; meta?: Record<string, unknown> } {
  if (message.startsWith('IN_PROGRESS_GAME:')) {
    return { code: 'IN_PROGRESS_GAME', meta: { gameId: message.split(':')[1]?.trim() } };
  }
  if (message.startsWith('JERSEY_CONFLICT:')) {
    return { code: 'JERSEY_CONFLICT', meta: { conflictingPlayerName: message.replace(/^JERSEY_CONFLICT:\s*/, '') } };
  }
  if (message === 'FORBIDDEN') return { code: 'FORBIDDEN' };
  if (message === 'NOT_IN_LEAGUE') return { code: 'NOT_IN_LEAGUE' };
  if (message === 'TEAM_NOT_IN_LEAGUE') return { code: 'TEAM_NOT_IN_LEAGUE' };
  if (message === 'TO_TEAM_REQUIRED') return { code: 'TO_TEAM_REQUIRED' };
  if (message === 'NOT_ON_TEAM') return { code: 'NOT_ON_TEAM' };
  return { code: 'UNKNOWN' };
}

export async function createLeaguePlayer(input: CreateLeaguePlayerInput): Promise<Result<{ playerId: string }>> {
  const parsed = createLeaguePlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(parsed.data.leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const { data, error } = await db.rpc('fn_create_league_player', {
    p_league_id: parsed.data.leagueId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_date_of_birth: parsed.data.dateOfBirth ?? null,
    p_jersey_number: parsed.data.jerseyNumber ?? null,
    p_primary_position: parsed.data.primaryPosition ?? null,
    p_bats: parsed.data.bats ?? null,
    p_throws: parsed.data.throws ?? null,
    p_graduation_year: parsed.data.graduationYear ?? null,
    p_notes: parsed.data.notes ?? null,
    p_team_id: parsed.data.teamId ?? null,
    p_actor: auth.user.id,
  });
  if (error) {
    const e = parsePgError(error.message);
    return { ok: false, code: e.code, message: error.message, meta: e.meta };
  }

  revalidatePath('/league/admin/players');
  return { ok: true, data: { playerId: (data as { id: string }).id } };
}

export async function transferPlayer(input: TransferPlayerInput): Promise<Result<{ transferId: string }>> {
  const parsed = transferPlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(parsed.data.leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const { data, error } = await db.rpc('fn_transfer_player', {
    p_league_id: parsed.data.leagueId,
    p_player_id: parsed.data.playerId,
    p_to_team_id: parsed.data.toTeamId,
    p_effective_at: parsed.data.effectiveAt ?? null,
    p_reason: parsed.data.reason ?? null,
    p_season_id: parsed.data.seasonId ?? null,
    p_accept_jersey_clear: parsed.data.acceptJerseyClear,
    p_actor: auth.user.id,
  });
  if (error) {
    const e = parsePgError(error.message);
    return { ok: false, code: e.code, message: error.message, meta: e.meta };
  }

  revalidatePath('/league/admin/players');
  return { ok: true, data: { transferId: (data as { id: string }).id } };
}

export async function releasePlayer(input: ReleasePlayerInput): Promise<Result<{ transferId: string }>> {
  const parsed = releasePlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(parsed.data.leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const { data, error } = await db.rpc('fn_release_player', {
    p_league_id: parsed.data.leagueId,
    p_player_id: parsed.data.playerId,
    p_effective_at: parsed.data.effectiveAt ?? null,
    p_reason: parsed.data.reason ?? null,
    p_actor: auth.user.id,
  });
  if (error) {
    const e = parsePgError(error.message);
    return { ok: false, code: e.code, message: error.message, meta: e.meta };
  }

  revalidatePath('/league/admin/players');
  return { ok: true, data: { transferId: (data as { id: string }).id } };
}

export async function updateLeaguePlayer(
  leagueId: string,
  input: UpdateLeaguePlayerInput,
): Promise<Result<{ playerId: string }>> {
  const parsed = updateLeaguePlayerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const updates: Record<string, unknown> = {};
  const map: Record<string, string> = {
    firstName: 'first_name', lastName: 'last_name', dateOfBirth: 'date_of_birth',
    jerseyNumber: 'jersey_number', primaryPosition: 'primary_position',
    bats: 'bats', throws: 'throws', graduationYear: 'graduation_year', notes: 'notes',
  };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k === 'playerId') continue;
    if (v === undefined) continue;
    updates[map[k]] = v;
  }
  if (Object.keys(updates).length === 0) {
    return { ok: true, data: { playerId: parsed.data.playerId } };
  }

  const { error } = await db.from('players').update(updates).eq('id', parsed.data.playerId);
  if (error) return { ok: false, code: 'DB_ERROR', message: error.message };

  revalidatePath('/league/admin/players');
  revalidatePath(`/league/admin/players/${parsed.data.playerId}`);
  return { ok: true, data: { playerId: parsed.data.playerId } };
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/league/admin/players/actions.ts
git commit -m "feat(league): server actions for league player CRUD + transfers"
```

---

## Task 6: League roster page (server component)

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/players/page.tsx`

- [ ] **Step 1: Implement the page**

Create `apps/web/src/app/(app)/league/admin/players/page.tsx`:

```tsx
import type { JSX } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import {
  getLeagueTeamsAll,
  getLeagueDivisions,
  getLeagueForStaff,
  getLeaguePlayers,
} from '@baseball/database';
import { LeaguePlayersTable } from './LeaguePlayersTable';

export const metadata: Metadata = { title: 'League Players' };

export default async function LeaguePlayersPage(): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const activeTeam = await getActiveTeam(auth, user.id);
  let leagueId: string | null = activeTeam ? (await getActiveLeague(activeTeam.id))?.id ?? null : null;
  if (!leagueId) {
    const staffLeague = await getLeagueForStaff(db, user.id);
    leagueId = staffLeague?.id ?? null;
  }
  if (!leagueId) redirect('/dashboard');

  const access = await getLeagueAccess(leagueId, user.id);
  if (!access.isLeagueStaff) redirect('/dashboard');

  const [players, teams, divisions] = await Promise.all([
    getLeaguePlayers(db, leagueId),
    getLeagueTeamsAll(db, leagueId),
    getLeagueDivisions(db, leagueId),
  ]);

  const rosterTeams = teams
    .filter((t) => !t.opponent_team_id && t.is_active)
    .map((t) => ({
      id: t.team_id!,
      name: t.teams?.name ?? 'Unknown',
      divisionId: t.division_id,
    }));

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">League Players</h1>
      <p className="text-gray-500 mb-6">{players.length} players · {players.filter((p) => p.player.team_id === null).length} free agents · {rosterTeams.length} teams</p>
      <LeaguePlayersTable
        leagueId={leagueId}
        players={players}
        teams={rosterTeams}
        divisions={divisions.map((d) => ({ id: d.id, name: d.name }))}
        canEdit={access.isLeagueAdmin}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: type-check fails because `LeaguePlayersTable` does not exist yet — that's fine, the next task creates it. Skip to Step 3.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/league/admin/players/page.tsx
git commit -m "feat(league): /league/admin/players page scaffolding"
```

---

## Task 7: LeaguePlayersTable client component

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/players/LeaguePlayersTable.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/web/src/app/(app)/league/admin/players/LeaguePlayersTable.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LeaguePlayerRow } from '@baseball/database';
import { AddLeaguePlayerDialog } from './AddLeaguePlayerDialog';
import { TradePlayerDialog } from './TradePlayerDialog';
import { ReleasePlayerDialog } from './ReleasePlayerDialog';

type Team = { id: string; name: string; divisionId: string | null };
type Division = { id: string; name: string };

type Props = {
  leagueId: string;
  players: LeaguePlayerRow[];
  teams: Team[];
  divisions: Division[];
  canEdit: boolean;
};

type Filter = {
  search: string;
  teamId: string;    // '' = all, 'free' = free agents
  divisionId: string;
};

export function LeaguePlayersTable({ leagueId, players, teams, divisions, canEdit }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>({ search: '', teamId: '', divisionId: '' });
  const [adding, setAdding] = useState(false);
  const [tradeTarget, setTradeTarget] = useState<LeaguePlayerRow | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<LeaguePlayerRow | null>(null);

  const filtered = useMemo(() => {
    const s = filter.search.trim().toLowerCase();
    return players.filter((p) => {
      if (filter.teamId === 'free' && p.player.team_id !== null) return false;
      if (filter.teamId && filter.teamId !== 'free' && p.player.team_id !== filter.teamId) return false;
      if (filter.divisionId) {
        const team = teams.find((t) => t.id === p.player.team_id);
        if (team?.divisionId !== filter.divisionId) return false;
      }
      if (s) {
        const blob = `${p.player.first_name} ${p.player.last_name} #${p.player.jersey_number ?? ''}`.toLowerCase();
        if (!blob.includes(s)) return false;
      }
      return true;
    });
  }, [players, teams, filter]);

  const freeAgents = players.filter((p) => p.player.team_id === null);

  function onAfterMutation() {
    setAdding(false);
    setTradeTarget(null);
    setReleaseTarget(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex justify-end gap-2">
        {canEdit && (
          <button
            onClick={() => setAdding(true)}
            className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800"
          >
            + Add Player
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          placeholder="Search name or jersey…"
          className="flex-1 min-w-[220px] text-sm border border-gray-300 rounded-lg px-3 py-2"
        />
        <select
          value={filter.teamId}
          onChange={(e) => setFilter({ ...filter, teamId: e.target.value })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">All teams</option>
          <option value="free">— Free agents —</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select
          value={filter.divisionId}
          onChange={(e) => setFilter({ ...filter, divisionId: e.target.value })}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">All divisions</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Free-agent banner */}
      {freeAgents.length > 0 && filter.teamId !== 'free' && (
        <div className="flex justify-between items-center border border-amber-300 bg-amber-50 rounded-lg px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-amber-800">{freeAgents.length} free agents</div>
            <div className="text-xs text-amber-700">Registered in the league but not currently on a team</div>
          </div>
          <button
            onClick={() => setFilter({ ...filter, teamId: 'free' })}
            className="text-xs font-medium text-amber-800 border border-amber-300 rounded-md px-3 py-1.5 hover:bg-amber-100"
          >
            View free agents
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
              <th className="px-4 py-2">Player</th>
              <th className="px-4 py-2">Team</th>
              <th className="px-4 py-2">DOB</th>
              <th className="px-4 py-2">Jersey</th>
              <th className="px-4 py-2">Status</th>
              {canEdit && <th className="px-4 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={canEdit ? 6 : 5} className="px-4 py-6 text-center text-gray-400 text-sm">No players match these filters.</td></tr>
            ) : filtered.map((p) => {
              const isFree = p.player.team_id === null;
              return (
                <tr key={p.player.id} className={isFree ? 'bg-amber-50/40' : ''}>
                  <td className="px-4 py-3">
                    <Link href={`/league/admin/players/${p.player.id}`} className="font-medium text-gray-900 hover:underline">
                      {p.player.first_name} {p.player.last_name}
                    </Link>
                    {p.player.primary_position && (
                      <div className="text-xs text-gray-500">{formatPosition(p.player.primary_position)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">{p.player.team?.name ?? <span className="text-gray-400">— unassigned —</span>}</td>
                  <td className="px-4 py-3 text-gray-700">{p.player.date_of_birth ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-gray-700">{p.player.jersey_number != null ? `#${p.player.jersey_number}` : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3">
                    {isFree ? (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">Free agent</span>
                    ) : (
                      <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Rostered</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => setTradeTarget(p)}
                        className="text-xs font-medium text-gray-700 border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-50"
                      >
                        {isFree ? 'Assign' : 'Trade'}
                      </button>
                      {!isFree && (
                        <button
                          onClick={() => setReleaseTarget(p)}
                          className="text-xs font-medium text-red-700 hover:text-red-900"
                        >
                          Release
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddLeaguePlayerDialog
          leagueId={leagueId}
          teams={teams}
          onClose={() => setAdding(false)}
          onSuccess={onAfterMutation}
        />
      )}
      {tradeTarget && (
        <TradePlayerDialog
          leagueId={leagueId}
          player={tradeTarget}
          teams={teams}
          onClose={() => setTradeTarget(null)}
          onSuccess={onAfterMutation}
        />
      )}
      {releaseTarget && (
        <ReleasePlayerDialog
          leagueId={leagueId}
          player={releaseTarget}
          onClose={() => setReleaseTarget(null)}
          onSuccess={onAfterMutation}
        />
      )}
    </div>
  );
}

function formatPosition(p: string): string {
  return p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/league/admin/players/LeaguePlayersTable.tsx
git commit -m "feat(league): LeaguePlayersTable with search, filters, free-agent banner"
```

---

## Task 8: AddLeaguePlayerDialog

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/players/AddLeaguePlayerDialog.tsx`

- [ ] **Step 1: Implement the dialog**

Create `apps/web/src/app/(app)/league/admin/players/AddLeaguePlayerDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { createLeaguePlayer } from './actions';

type Team = { id: string; name: string };

type Props = {
  leagueId: string;
  teams: Team[];
  onClose: () => void;
  onSuccess: () => void;
};

const POSITIONS = [
  'pitcher','catcher','first_base','second_base','third_base','shortstop',
  'left_field','center_field','right_field','designated_hitter','utility',
] as const;

export function AddLeaguePlayerDialog({ leagueId, teams, onClose, onSuccess }: Props) {
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [jersey, setJersey] = useState('');
  const [position, setPosition] = useState('');
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await createLeaguePlayer({
      leagueId,
      firstName: first,
      lastName: last,
      dateOfBirth: dob || undefined,
      jerseyNumber: jersey ? Number(jersey) : undefined,
      primaryPosition: (position || undefined) as never,
      teamId: teamId || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.code === 'VALIDATION' ? 'Check the form fields' : res.message);
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add Player to League</h2>
        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">{err}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name *">
            <input required value={first} onChange={(e) => setFirst(e.target.value)} className="input" />
          </Field>
          <Field label="Last name *">
            <input required value={last} onChange={(e) => setLast(e.target.value)} className="input" />
          </Field>
          <Field label="Date of birth">
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="input" />
          </Field>
          <Field label="Jersey #">
            <input type="number" min={0} max={99} value={jersey} onChange={(e) => setJersey(e.target.value)} className="input" />
          </Field>
          <Field label="Primary position">
            <select value={position} onChange={(e) => setPosition(e.target.value)} className="input">
              <option value="">—</option>
              {POSITIONS.map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Assign to team">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="input">
              <option value="">— Free agent —</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-gray-100">Cancel</button>
          <button type="submit" disabled={saving || !first.trim() || !last.trim()}
                  className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Player'}
          </button>
        </div>
      </form>
      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
      {label}
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/league/admin/players/AddLeaguePlayerDialog.tsx
git commit -m "feat(league): AddLeaguePlayerDialog form"
```

---

## Task 9: TradePlayerDialog

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/players/TradePlayerDialog.tsx`

- [ ] **Step 1: Implement the dialog**

Create `apps/web/src/app/(app)/league/admin/players/TradePlayerDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { LeaguePlayerRow } from '@baseball/database';
import { transferPlayer } from './actions';

type Team = { id: string; name: string };

type Props = {
  leagueId: string;
  player: LeaguePlayerRow;
  teams: Team[];
  onClose: () => void;
  onSuccess: () => void;
};

export function TradePlayerDialog({ leagueId, player, teams, onClose, onSuccess }: Props) {
  const isAssignment = player.player.team_id === null;
  const [toTeamId, setToTeamId] = useState('');
  const [effective, setEffective] = useState('');
  const [reason, setReason] = useState('');
  const [collision, setCollision] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const eligibleTeams = teams.filter((t) => t.id !== player.player.team_id);
  const fullName = `${player.player.first_name} ${player.player.last_name}`;

  async function submit(e: React.FormEvent, acceptJerseyClear: boolean) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await transferPlayer({
      leagueId,
      playerId: player.player.id,
      toTeamId,
      effectiveAt: effective ? new Date(effective).toISOString() : undefined,
      reason: reason || undefined,
      acceptJerseyClear,
    });
    setSaving(false);
    if (!res.ok) {
      if (res.code === 'JERSEY_CONFLICT') {
        setCollision((res.meta?.conflictingPlayerName as string) ?? 'another player');
        return;
      }
      if (res.code === 'IN_PROGRESS_GAME') {
        setErr(`Cannot trade — ${fullName} is in a live game. Finalize the game first.`);
        return;
      }
      setErr(res.message);
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={(e) => submit(e, !!collision)} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">
          {isAssignment ? `Assign ${fullName}` : `Trade ${fullName}`}
        </h2>
        {!isAssignment && (
          <p className="text-xs text-gray-500">Currently on: {player.player.team?.name ?? 'unknown'}</p>
        )}

        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">{err}</div>}

        <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
          {isAssignment ? 'Assign to team' : 'Move to team'}
          <select required value={toTeamId} onChange={(e) => { setToTeamId(e.target.value); setCollision(null); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Choose team…</option>
            {eligibleTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>

        <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
          Effective date
          <input type="date" value={effective} onChange={(e) => setEffective(e.target.value)}
                 className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </label>

        <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
          Reason <span className="text-gray-400">(optional, visible to league members)</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </label>

        {collision && (
          <div className="border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Jersey #{player.player.jersey_number} is taken by {collision} on the destination team. Confirm to clear this player's jersey on transfer — assign a new one after.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-gray-100">Cancel</button>
          <button type="submit" disabled={saving || !toTeamId}
                  className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50">
            {saving ? 'Saving…' : collision ? 'Confirm & clear jersey' : (isAssignment ? 'Confirm assignment' : 'Confirm trade')}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/league/admin/players/TradePlayerDialog.tsx
git commit -m "feat(league): TradePlayerDialog with jersey-collision flow"
```

---

## Task 10: ReleasePlayerDialog

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/players/ReleasePlayerDialog.tsx`

- [ ] **Step 1: Implement the dialog**

Create `apps/web/src/app/(app)/league/admin/players/ReleasePlayerDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { LeaguePlayerRow } from '@baseball/database';
import { releasePlayer } from './actions';

type Props = {
  leagueId: string;
  player: LeaguePlayerRow;
  onClose: () => void;
  onSuccess: () => void;
};

export function ReleasePlayerDialog({ leagueId, player, onClose, onSuccess }: Props) {
  const fullName = `${player.player.first_name} ${player.player.last_name}`;
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await releasePlayer({
      leagueId,
      playerId: player.player.id,
      reason: reason || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      if (res.code === 'IN_PROGRESS_GAME') {
        setErr(`Cannot release — ${fullName} is in a live game. Finalize the game first.`);
        return;
      }
      setErr(res.message);
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold">Release {fullName}</h2>
        <p className="text-sm text-gray-600">
          {fullName} will be moved off <strong>{player.player.team?.name}</strong> into the free-agent pool. Their season stats remain attributed to that team.
        </p>

        {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">{err}</div>}

        <label className="text-xs font-medium text-gray-600 flex flex-col gap-1">
          Reason <span className="text-gray-400">(optional)</span>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-gray-100">Cancel</button>
          <button type="submit" disabled={saving}
                  className="text-sm font-medium bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Releasing…' : 'Confirm Release'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/league/admin/players/ReleasePlayerDialog.tsx
git commit -m "feat(league): ReleasePlayerDialog confirmation"
```

---

## Task 11: Player detail page + TransferHistoryTimeline

**Files:**
- Create: `apps/web/src/app/(app)/league/admin/players/[playerId]/page.tsx`
- Create: `apps/web/src/app/(app)/league/admin/players/[playerId]/TransferHistoryTimeline.tsx`

- [ ] **Step 1: Detail page**

Create `apps/web/src/app/(app)/league/admin/players/[playerId]/page.tsx`:

```tsx
import type { JSX } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueAccess } from '@/lib/league-access';
import { getLeagueForStaff, getPlayerTransfers } from '@baseball/database';
import { TransferHistoryTimeline } from './TransferHistoryTimeline';

export default async function PlayerDetailPage({
  params,
}: {
  params: { playerId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const staffLeague = await getLeagueForStaff(db, user.id);
  if (!staffLeague) redirect('/dashboard');

  const access = await getLeagueAccess(staffLeague.id, user.id);
  if (!access.isLeagueStaff) redirect('/dashboard');

  // Verify the player is in this admin's league.
  const { data: lp } = await db
    .from('league_players')
    .select('player_id')
    .eq('league_id', staffLeague.id)
    .eq('player_id', params.playerId)
    .maybeSingle();
  if (!lp) notFound();

  const { data: player } = await db
    .from('players')
    .select('id, first_name, last_name, jersey_number, date_of_birth, primary_position, bats, throws, graduation_year, team_id, team:teams(id, name)')
    .eq('id', params.playerId)
    .single();
  if (!player) notFound();

  const transfers = await getPlayerTransfers(db, params.playerId);

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <Link href="/league/admin/players" className="text-sm text-brand-700 hover:underline">← Back to League Players</Link>
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          {player.first_name} {player.last_name}
        </h1>
        <p className="text-gray-500">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(player as any).team?.name ?? <span className="text-amber-700">Free agent</span>}
          {player.jersey_number != null && <span className="ml-2">#{player.jersey_number}</span>}
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl p-6 grid grid-cols-2 gap-4 text-sm">
        <Field label="Date of birth" value={player.date_of_birth ?? '—'} />
        <Field label="Graduation year" value={player.graduation_year?.toString() ?? '—'} />
        <Field label="Primary position" value={player.primary_position ?? '—'} />
        <Field label="Bats / Throws" value={`${player.bats ?? '—'} / ${player.throws ?? '—'}`} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Transfer History</h2>
        <TransferHistoryTimeline transfers={transfers} />
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 uppercase">{label}</div>
      <div className="text-gray-900">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Timeline component**

Create `apps/web/src/app/(app)/league/admin/players/[playerId]/TransferHistoryTimeline.tsx`:

```tsx
import type { PlayerTransferRow } from '@baseball/database';

type Props = { transfers: PlayerTransferRow[] };

const TYPE_LABEL: Record<PlayerTransferRow['transfer_type'], string> = {
  initial_assignment: 'Initial assignment',
  trade: 'Trade',
  release: 'Release',
  reassignment: 'Season move',
};

export function TransferHistoryTimeline({ transfers }: Props) {
  if (transfers.length === 0) {
    return <p className="text-sm text-gray-400">No transfers recorded.</p>;
  }

  return (
    <ol className="space-y-3">
      {transfers.map((t) => (
        <li key={t.id} className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex justify-between items-baseline">
            <div className="text-sm font-medium text-gray-900">
              {TYPE_LABEL[t.transfer_type]}: {t.from_team?.name ?? '—'} → {t.to_team?.name ?? <span className="text-amber-700">Free agent</span>}
            </div>
            <time className="text-xs text-gray-500">{new Date(t.effective_at).toLocaleDateString()}</time>
          </div>
          {t.reason && <p className="mt-2 text-sm text-gray-700">{t.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/league/admin/players/\[playerId\]
git commit -m "feat(league): player detail page with transfer history timeline"
```

---

## Task 12: Sidebar nav link

**Files:**
- Modify: `apps/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add the link**

In `apps/web/src/components/layout/Sidebar.tsx`, after the existing "League Admin" entry (around line 79), add another conditional entry. The relevant block currently reads:

```ts
    ...(leagueId && canLeague && isLeagueAdmin
      ? [{ href: '/league/admin', label: 'League Admin', icon: <Icon.admin /> }]
      : []),
```

Change it to:

```ts
    ...(leagueId && canLeague && isLeagueAdmin
      ? [
          { href: '/league/admin', label: 'League Admin', icon: <Icon.admin /> },
          { href: '/league/admin/players', label: 'League Players', icon: <Icon.team /> },
        ]
      : []),
```

- [ ] **Step 2: Verify in dev**

```bash
pnpm dev:web
```

Sign in as a league admin; confirm "League Players" appears in the sidebar and the page loads with players listed (or "no players" empty state).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/Sidebar.tsx
git commit -m "feat(web): add League Players sidebar link for admins"
```

---

## Task 13: CLAUDE.md glossary update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append glossary entries**

In `CLAUDE.md`, in the Domain Glossary section, add these two rows after the `CourtesyRunner` row:

```
| **PlayerTransfer** | Append-only row in `player_transfers` recording a player's move within a league (initial assignment, trade, release, or season reassignment). Written by `league_admin` server actions wrapping `fn_transfer_player` / `fn_release_player`. Does not drive stat attribution — that lives on `game_lineups.team_id`. |
| **FreeAgent** | A player registered in a league (`league_players` row exists, `is_guest_only=false`) with `players.team_id IS NULL`. Eligible for assignment to a team via `transferPlayer`. |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(league): add PlayerTransfer + FreeAgent to glossary"
```

---

## Task 14: End-to-end manual verification

- [ ] **Step 1: Start dev server**

```bash
pnpm dev:web
```

- [ ] **Step 2: Walk the golden path**

Sign in as a `league_admin`. Verify each of:

1. Open `/league/admin/players`. Sees the table, search/filter controls, "+ Add Player" button.
2. Click "+ Add Player". Create a player as a free agent (no team). After save, the player appears in the table with status "Free agent". Free-agent counter increments by one.
3. From the row's "Assign" button, assign to a team. Status flips to "Rostered", team column updates. `player_transfers` has an `initial_assignment` row (verify via Supabase MCP `execute_sql`).
4. From a different rostered player, click "Trade". Choose a destination team where another player has the same jersey. Confirm the jersey-collision banner appears. Click confirm; jersey is cleared and the row updates.
5. Click "Release" on a rostered player. Status flips to "Free agent". `player_transfers` has a `release` row.
6. Open the player detail page (`/league/admin/players/<id>`); confirm the timeline lists all transfers in reverse chronological order with correct labels.
7. Sign in as a `league_manager` (non-admin). Confirm the sidebar shows "League Players" only when `isLeagueAdmin` (per Task 12 it's gated). If a manager visits the URL directly, the page should render (managers are staff and can read) but the Add/Trade/Release buttons are absent because `canEdit` is `access.isLeagueAdmin`.

- [ ] **Step 3: Negative-path checks**

1. Start a game and put a player into the lineup; while the game is `in_progress`, attempt to Trade that player. Confirm error banner mentions the live game.
2. Attempt to Release an already-free-agent player by manipulating the URL or stale UI; confirm the server returns `NOT_ON_TEAM`.

- [ ] **Step 4: If any step fails, file the bug and stop here.**

---

## Task 15: CodeRabbit review per project convention

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(league): player roster + trades" --body "..."
```

- [ ] **Step 2: Trigger CodeRabbit review**

Per `CLAUDE.md` DiamondOS Context: "Always run coderabbit review after implementing a feature." Wait for CodeRabbit's comments, then address them in a follow-up commit on the same branch.

---

## Spec coverage check

| Spec section | Covered by |
|---|---|
| `league_players` extension | Task 1 |
| `player_transfers` table + indexes | Task 1 |
| RLS policies | Task 1 |
| `fn_create_league_player` / `fn_transfer_player` / `fn_release_player` | Task 1 |
| Generated types | Task 2 |
| Zod schemas | Task 3 |
| Query helpers (`getLeaguePlayers`, `getPlayerTransfers`) | Task 4 |
| `createLeaguePlayer` / `transferPlayer` / `releasePlayer` / `updateLeaguePlayer` server actions | Task 5 |
| `/league/admin/players` page | Tasks 6, 7 |
| Add Player dialog | Task 8 |
| Trade dialog (with `JERSEY_CONFLICT` + `IN_PROGRESS_GAME` flows) | Task 9 |
| Release dialog | Task 10 |
| Player detail page + transfer history timeline | Task 11 |
| Sidebar nav link | Task 12 |
| Glossary additions | Task 13 |
| Edge-case verification (in-progress, jersey collision, double-release) | Task 14 |
| CodeRabbit review | Task 15 |
