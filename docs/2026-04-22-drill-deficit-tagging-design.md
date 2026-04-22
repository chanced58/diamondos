# Drill-to-Deficit Tagging — Design

Date: 2026-04-22
Tier: 4 (Development layer)
Scope: First unit of Tier 4. Deficit tagging is the foundation that IDPs, auto-suggest, practice history, and recruit export will later build on.

## Summary

Drills today are tagged with descriptive labels (`'tee-work-basic'`, `'bunt-drag'`) that describe *what a drill is*. Coaches also need to record *what deficit a drill fixes* (e.g. "early bat drag", "glove-side command"). This spec adds a deficits vocabulary, a drill↔deficit junction with primary/secondary priority, and a drill-library filter on web. It ships ~30 curated system deficits and leaves team-authored deficit creation and drill-tagging UIs as explicit follow-ups.

## Decisions (brainstorming outcome)

| # | Decision | Chosen |
|---|---|---|
| 1 | Vocabulary source | System-curated **plus** team-authored (`visibility` mirrors `practice_drills`) |
| 2 | Skill-category linkage | Multiple `skill_categories[]` per deficit |
| 3 | Who can tag which drills | Team-scoped tags on *any* drill (system or team-authored) via a separate junction table; system drills remain immutable |
| 4 | Tag metadata | `priority enum ('primary','secondary')` per tag |
| 5 | Seed scope | Schema + ~30 curated system deficits; empty team vocabulary |

## Schema

Single forward migration `supabase/migrations/20260422000001_practice_deficits.sql`.

### `practice_deficits`

```sql
create table public.practice_deficits (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid references public.teams(id) on delete cascade,
  visibility       public.practice_drill_visibility not null default 'team',
  slug             text not null,
  name             text not null,
  description      text,
  skill_categories public.practice_skill_category[] not null default '{}',
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint practice_deficits_visibility_team_coherent check (
    (visibility = 'system' and team_id is null)
    or (visibility = 'team' and team_id is not null)
  ),
  constraint practice_deficits_slug_scope unique nulls not distinct (team_id, slug),
  constraint practice_deficits_skills_non_empty check (
    array_length(skill_categories, 1) >= 1
  )
);
```

`slug` uniqueness is scoped: `(null, 'early-bat-drag')` (system) and `(team-uuid, 'early-bat-drag')` (team override with same slug) can coexist. `nulls not distinct` forces system uniqueness on `null`-scoped rows.

Indexes:
- `idx_practice_deficits_team_id (team_id)`
- `idx_practice_deficits_visibility (visibility)`
- `idx_practice_deficits_skills_gin using gin(skill_categories)`
- `idx_practice_deficits_name_trgm using gin(name gin_trgm_ops)`

Updated-at trigger mirroring `touch_practice_drills_updated_at`.

### `practice_drill_deficit_tags`

```sql
create type public.practice_drill_deficit_priority as enum ('primary','secondary');

create table public.practice_drill_deficit_tags (
  id          uuid primary key default gen_random_uuid(),
  drill_id    uuid not null references public.practice_drills(id) on delete cascade,
  deficit_id  uuid not null references public.practice_deficits(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete cascade,
  priority    public.practice_drill_deficit_priority not null default 'primary',
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  constraint drill_deficit_tags_unique unique nulls not distinct (drill_id, deficit_id, team_id)
);
```

`team_id is null` ⇒ system-scoped tag (shipped via seed migration, visible to every team). `team_id` set ⇒ team-scoped tag. A team's effective view of a drill's deficits is: system tags UNION their own team tags.

Indexes:
- `idx_drill_deficit_tags_drill_id (drill_id)`
- `idx_drill_deficit_tags_deficit_id (deficit_id)`
- `idx_drill_deficit_tags_team_id (team_id)`

### RLS

Mirrors `practice_drills`; reuses the existing `public.is_coach(team_id, auth.uid())` helper.

`practice_deficits`:
- `select` — `visibility = 'system'` OR caller is an active member of `team_id`.
- `insert` / `update` / `delete` — `visibility = 'team'` AND `is_coach(team_id, auth.uid())`. System rows are unreachable through the API; only seed migrations (service role) can write them.

`practice_drill_deficit_tags`:
- `select` — caller can read the parent drill AND (`team_id is null` OR caller is a member of `team_id`).
- `insert` / `update` / `delete` — `team_id is not null` AND `is_coach(team_id, auth.uid())` AND caller can read the parent drill. System tags (`team_id is null`) are seed-only.

### Invariants

- A team-scoped deficit cannot be referenced by a system tag (FK + visibility check enforced by the application layer; the DB permits it, but the seed migration will only reference system deficits).
- Deleting a drill or a deficit cascades to the tag.
- Deleting a team cascades to its deficits and its tags (via `on delete cascade` on `team_id`).

## Shared package

New types in `packages/shared/src/types/practice-deficit.ts`, exported from `types/index.ts`:

```ts
export enum PracticeDrillDeficitPriority {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
}

export interface PracticeDeficit {
  id: string;
  teamId: string | null;
  visibility: PracticeDrillVisibility;
  slug: string;
  name: string;
  description?: string;
  skillCategories: PracticeSkillCategory[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeDrillDeficitTag {
  id: string;
  drillId: string;
  deficitId: string;
  teamId: string | null;
  priority: PracticeDrillDeficitPriority;
  createdBy?: string;
  createdAt: string;
}

export interface DrillDeficitTagHydrated {
  deficit: PracticeDeficit;
  priority: PracticeDrillDeficitPriority;
  tagScope: 'system' | 'team';
}
```

Extend `DrillFilters` in `types/practice-drill.ts`:

```ts
deficitIds?: string[];                   // OR-match against tagged deficits
deficitPriority?: 'primary' | 'any';     // default 'any'
```

Validation in `packages/shared/src/validation/practice-deficit.ts`:
- `createDeficitSchema` — `name` 1–120 chars, `slug` matches `^[a-z0-9-]{1,80}$`, `skillCategories` non-empty array of `PracticeSkillCategory`, `description` optional, max 1000 chars.
- `updateDeficitSchema` — `createDeficitSchema.partial()`.
- `drillDeficitTagSchema` — `drillId`, `deficitId` UUIDs; `teamId` UUID or null; `priority` enum.

Pure-filter logic in `packages/shared/src/utils/filter-drills.ts` is extended with a helper `matchesDeficits(drill, tagsByDrill, filters)` so the shared package can be unit-tested without a DB.

Tests in `packages/shared/src/utils/__tests__/drill-deficit-filter.test.ts`:
- Drill matches when any tagged deficit is in `deficitIds`.
- `deficitPriority: 'primary'` filters out drills whose only matching tags are secondary.
- System and team tags both count toward matching.
- Empty `deficitIds` is a pass-through (no filtering applied).

## Database package

New file `packages/database/src/queries/practice-deficits.ts` exported from `queries/index.ts`.

- `listDeficitsForTeam(supabase, teamId: string): Promise<PracticeDeficit[]>` — returns system + team rows; ordered by `skill_categories[0]` then `name`.
- `getDeficitBySlug(supabase, teamId, slug): Promise<PracticeDeficit | null>` — team-scoped row wins when both exist.
- `createTeamDeficit(supabase, input)` / `updateTeamDeficit(supabase, id, input)` / `deleteTeamDeficit(supabase, id)` — thin wrappers that run input through Zod schemas before hitting the DB. `createTeamDeficit` sets `created_by = auth.uid()` on insert. RLS gates coach authorization.
- `listDrillDeficitTags(supabase, drillId, teamId): Promise<DrillDeficitTagHydrated[]>` — joins the tag rows to their deficits, filters to `team_id is null OR team_id = :teamId`.
- `upsertDrillDeficitTag(supabase, { drillId, deficitId, teamId, priority })` / `removeDrillDeficitTag(supabase, id)` — foundation for a later tagging UI; used by seed migration for system tags.

Extend `listDrills(supabase, filters)`: when `filters.deficitIds?.length > 0`, add an `exists` subquery on `practice_drill_deficit_tags` filtered by `deficit_id = any(:deficitIds)` and (if `deficitPriority = 'primary'`) `priority = 'primary'`. Visibility is enforced by the tag table's RLS policy (not re-encoded in the query), so the subquery naturally surfaces system tags + the caller's team tags and nothing else.

Regenerate `packages/database/src/types/supabase.ts` after the migration.

## Seed — ~30 system deficits

New migration `supabase/migrations/20260422000002_seed_system_deficits.sql`. Uses the same deterministic UUIDv5 pattern as the drill seed, with a fresh namespace UUID. Each row: `slug`, `name`, `description`, `skill_categories[]`. No drill-to-deficit tags are seeded in this round.

Distribution (names and skill_categories):

**Hitting (12):**
- `early-bat-drag` — [hitting]
- `front-side-flies-open` — [hitting]
- `steep-swing-path` — [hitting]
- `flat-swing-path` — [hitting]
- `late-trigger` — [hitting]
- `weight-gets-stuck-back` — [hitting]
- `poor-two-strike-approach` — [hitting, mental]
- `struggles-vs-off-speed` — [hitting]
- `no-backside-on-breaking` — [hitting]
- `poor-bunt-execution` — [hitting]
- `chases-out-of-zone` — [hitting, mental]
- `pulls-off-at-contact` — [hitting]

**Pitching (10):**
- `glove-side-command` — [pitching]
- `arm-side-command` — [pitching]
- `flat-vertical-approach-angle` — [pitching]
- `drops-elbow` — [pitching]
- `rushes-delivery` — [pitching]
- `inconsistent-release-point` — [pitching]
- `no-secondary-pitch-command` — [pitching]
- `tips-pitches` — [pitching]
- `slow-to-plate-with-runners` — [pitching, team_defense]
- `poor-pfp-execution` — [pitching, fielding]

**Fielding (5):**
- `slow-first-step` — [fielding]
- `poor-throw-accuracy-on-the-run` — [fielding]
- `rushes-transfer` — [fielding]
- `misreads-routes-in-outfield` — [fielding]
- `weak-backhand` — [fielding]

**Baserunning / team defense (3):**
- `poor-secondary-leads` — [baserunning]
- `misreads-first-to-third` — [baserunning]
- `blown-bunt-coverage` — [team_defense, pitching]

## Web UI — drill library filter only

Scope kept narrow deliberately.

- `apps/web/src/app/(app)/practices/drills/DrillFilters.tsx`: add a multi-select "Addresses deficit" populated by `listDeficitsForTeam`. Grouped visually by `skill_categories[0]` for readability. Wires into `DrillFilters.deficitIds`. Secondary checkbox "Primary tags only" sets `deficitPriority = 'primary'`.
- `DrillCard.tsx`: render up to 2 primary deficit chips per drill (team-visible tags). Renders nothing when the drill has no matching tags.
- `apps/web/src/app/(app)/practices/drills/[drillId]/page.tsx`: "Fixes" section grouped by `primary` / `secondary`.

No mobile UI changes. No drill-tagging UI. No deficit-admin UI.

## Out of scope

- Drill-tagging UI (coaches cannot create drill↔deficit tags through the app in this round; only system seed and direct SQL).
- Team-deficit vocabulary admin UI.
- Individual Development Plans, auto-suggest, practice history filtering, recruit export — all later Tier 4 units; this spec just lays the foundation.
- Mobile surfaces (player practice card deficit display, coach-side tagging on mobile).
- Migrating existing free-form `tags text[]` values into deficits; deficits are a separate namespace.

## Testing strategy

- Shared package: unit tests for `matchesDeficits` filter helper covering system/team tag mixing and priority filtering.
- Database package: integration tests are not yet wired up in this repo; rely on RLS tests added manually via `supabase db reset` and psql.
- Web: coach smoke path — open drill library, filter by one hitting deficit, expect matching drills. Not in CI today; documented in the plan as manual verification.

## Migration + rollout notes

- Two forward-only migrations in a single PR: schema + seed.
- `supabase db reset && pnpm --filter @baseball/database gen-types` must be run after applying to keep generated types current.
- No destructive changes; the feature is additive and hidden behind a new filter control that defaults to "no deficit filter applied".

## Success criteria

- Migration applies cleanly on a fresh `supabase db reset`; `pnpm type-check` on `@baseball/shared` and `@baseball/database` stays clean.
- `pnpm test` adds the new filter-helper tests and all existing tests continue to pass.
- A coach on a seeded team can open the drill library, filter by "early-bat-drag", and see zero results (no tags seeded); after manually inserting a tag row in SQL, the drill appears. Proves the read path works end-to-end even without tagging UI.
