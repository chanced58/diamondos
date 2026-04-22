# Drill-to-Deficit Tagging Implementation Plan

> **Historical — final code diverges from this plan in two places.** Document preserved as authored intent, not as current reality.
> - **Task 3 seed filename:** shipped as `supabase/migrations/20260422000004_seed_system_deficits.sql` (not `000003`). `000003` is the mid-implementation RLS-tightening migration (not in this plan), and a fifth migration `20260422000005_drill_deficit_tags_update_tighten.sql` was added post-review to mirror the hardened INSERT policy onto UPDATE.
> - **Task 11/12 tag fetch:** the inline `supabase.from('practice_drill_deficit_tags')...` shown in the Task 12 page.tsx edits was refactored into the `listTagsForTeam` helper in `packages/database/src/queries/practice-deficits.ts`. Callers now do `listTagsForTeam(supabase, teamId)` instead of the hand-rolled query + mapping.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deficits vocabulary (system + team-authored), a drill↔deficit junction with primary/secondary priority, ~30 curated system deficits, and a drill-library filter on web. Foundation for later IDPs / auto-suggest / recruit export.

**Architecture:** Two new tables (`practice_deficits`, `practice_drill_deficit_tags`) mirroring the existing `practice_drills` visibility/RLS pattern. A new junction enum `practice_drill_deficit_priority`. Shared package gets new types, a filter helper tested in isolation, and a Zod validator. Database package gets query helpers and extends `listDrills` with a tag-scoped `exists` subquery. Web gets a multi-select deficit filter on the drill library plus primary-deficit chips on drill cards and a "Fixes" section on the drill detail page. No mobile work, no tagging UI, no IDP/auto-suggest work in this plan.

**Tech Stack:** Supabase Postgres (with RLS); TypeScript monorepo (`@baseball/shared`, `@baseball/database`); Next.js 14 app router (web); Zod for validation; Jest for shared unit tests.

**Reference spec:** `docs/2026-04-22-drill-deficit-tagging-design.md`

---

## Pre-flight

All tasks assume you are in a clean `practice-engine` (or a feature branch off it) with `pnpm install` already run. `supabase start` should be running for DB work. If it isn't:

```bash
supabase start
```

Verify with:

```bash
supabase status | head -5
```

Expected: `API URL`, `DB URL`, and container IDs shown — no errors.

---

## Task 1: Schema — `practice_deficits` table

**Files:**
- Create: `supabase/migrations/20260422000001_practice_deficits.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Practice Engine — Tier 4 development layer
-- Migration: deficits vocabulary (system + team-authored)
-- ============================================================================

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

comment on table public.practice_deficits is
  'Skill-deficit vocabulary. System rows (visibility=system, team_id null) ship via seed migrations and are API-immutable; team rows are coach-authored per team.';

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_practice_deficits_team_id    on public.practice_deficits(team_id);
create index idx_practice_deficits_visibility on public.practice_deficits(visibility);
create index idx_practice_deficits_skills_gin on public.practice_deficits using gin(skill_categories);
create index idx_practice_deficits_name_trgm  on public.practice_deficits using gin(name gin_trgm_ops);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_practice_deficits_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_practice_deficits_touch_updated_at
  before update on public.practice_deficits
  for each row execute function public.touch_practice_deficits_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_deficits enable row level security;

-- Read: system rows visible to all authenticated; team rows visible to active
-- members of that team.
create policy "practice_deficits_select"
  on public.practice_deficits for select
  using (
    visibility = 'system'
    or (
      team_id is not null
      and exists (
        select 1 from public.team_members tm
        where tm.team_id = public.practice_deficits.team_id
          and tm.user_id = auth.uid()
          and tm.is_active = true
      )
    )
  );

-- Write: only coaches on the owning team may mutate team rows. System rows
-- are unreachable from the API (no team_id to match; policy denies).
create policy "practice_deficits_coach_insert"
  on public.practice_deficits for insert
  with check (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

create policy "practice_deficits_coach_update"
  on public.practice_deficits for update
  using (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  )
  with check (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

create policy "practice_deficits_coach_delete"
  on public.practice_deficits for delete
  using (
    visibility = 'team'
    and team_id is not null
    and public.is_coach(team_id, auth.uid())
  );
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db reset
```

Expected: migration runs without error; last line contains `Finished supabase db reset`.

Spot-check the table exists:

```bash
supabase db diff --linked --schema public | grep practice_deficits || \
  psql "$(supabase status --output env | grep DB_URL | cut -d= -f2-)" -c "\d public.practice_deficits"
```

Expected: column list including `id`, `team_id`, `visibility`, `slug`, `name`, `description`, `skill_categories`, `created_by`, `created_at`, `updated_at`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260422000001_practice_deficits.sql
git commit -m "feat(database): add practice_deficits vocabulary table (Tier 4)"
```

---

## Task 2: Schema — `practice_drill_deficit_tags` junction

**Files:**
- Create: `supabase/migrations/20260422000002_practice_drill_deficit_tags.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- Practice Engine — Tier 4 development layer
-- Migration: drill↔deficit junction with primary/secondary priority
-- ============================================================================

create type public.practice_drill_deficit_priority as enum ('primary', 'secondary');

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

comment on table public.practice_drill_deficit_tags is
  'Tags connecting a drill to a deficit with primary/secondary priority. team_id null = system tag (seed-only); team_id set = team-scoped tag visible only to that team.';

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index idx_drill_deficit_tags_drill_id   on public.practice_drill_deficit_tags(drill_id);
create index idx_drill_deficit_tags_deficit_id on public.practice_drill_deficit_tags(deficit_id);
create index idx_drill_deficit_tags_team_id    on public.practice_drill_deficit_tags(team_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.practice_drill_deficit_tags enable row level security;

-- Read: caller must be able to see the parent drill, and the tag must be
-- either system (team_id null) or scoped to a team the caller belongs to.
create policy "drill_deficit_tags_select"
  on public.practice_drill_deficit_tags for select
  using (
    exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_deficit_tags.drill_id
        and (
          d.visibility = 'system'
          or (
            d.team_id is not null
            and exists (
              select 1 from public.team_members tm
              where tm.team_id = d.team_id
                and tm.user_id = auth.uid()
                and tm.is_active = true
            )
          )
        )
    )
    and (
      team_id is null
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = public.practice_drill_deficit_tags.team_id
          and tm.user_id = auth.uid()
          and tm.is_active = true
      )
    )
  );

-- Write: only coaches on the scoping team, who can also read the parent drill.
-- System tags (team_id null) are seed-only; policy denies non-service-role writes.
create policy "drill_deficit_tags_coach_insert"
  on public.practice_drill_deficit_tags for insert
  with check (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
    and exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_deficit_tags.drill_id
        and (
          d.visibility = 'system'
          or d.team_id = public.practice_drill_deficit_tags.team_id
        )
    )
  );

create policy "drill_deficit_tags_coach_update"
  on public.practice_drill_deficit_tags for update
  using (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  )
  with check (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

create policy "drill_deficit_tags_coach_delete"
  on public.practice_drill_deficit_tags for delete
  using (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  );
```

- [ ] **Step 2: Apply and verify**

```bash
supabase db reset
```

Expected: no error; table and enum appear.

```bash
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2-)" -c "\dT public.practice_drill_deficit_priority"
```

Expected: enum listed with labels `primary, secondary`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260422000002_practice_drill_deficit_tags.sql
git commit -m "feat(database): add practice_drill_deficit_tags junction (Tier 4)"
```

---

## Task 3: Seed — 30 curated system deficits

**Files:**
- Create: `supabase/migrations/20260422000003_seed_system_deficits.sql`

- [ ] **Step 1: Write the seed migration**

```sql
-- ============================================================================
-- Practice Engine — Tier 4 development layer
-- Migration: seed ~30 curated system deficits (visibility='system', team_id=null)
-- ============================================================================
--
-- Deterministic UUIDs via uuid_generate_v5 with a fixed namespace so
-- `supabase db reset` is idempotent. ON CONFLICT (id) DO NOTHING lets
-- re-runs (and future additive seeds) no-op cleanly. To update an existing
-- system deficit, ship a new migration with INSERT ... ON CONFLICT DO UPDATE.

do $$
declare
  -- Stable namespace for the practice deficit vocabulary.
  -- (Random v4 value picked once; never change it.)
  ns constant uuid := 'b8f1c3d4-5a6b-4c7d-8e9f-1a2b3c4d5e6f';
begin
  perform set_config(
    'search_path',
    'public, extensions, pg_temp',
    true
  );

  insert into public.practice_deficits (
    id, team_id, visibility, slug, name, description, skill_categories
  )
  select
    uuid_generate_v5(ns, 'practice-deficit:' || d.slug),
    null,
    'system',
    d.slug,
    d.name,
    d.description,
    d.skills::public.practice_skill_category[]
  from (values
    -- ═══ HITTING (12) ══════════════════════════════════════════════════════
    ('early-bat-drag',          'Early bat drag',
     'Barrel drops below the hands too early in the swing, causing under-the-ball contact and weak fly balls.',
     '{hitting}'),
    ('front-side-flies-open',   'Front side flies open',
     'Front shoulder and hip pull open before contact, losing backside power and extension through the ball.',
     '{hitting}'),
    ('steep-swing-path',        'Steep swing path',
     'Bat travels too vertically through the zone, producing high ground balls and swing-and-miss on low pitches.',
     '{hitting}'),
    ('flat-swing-path',         'Flat swing path',
     'Swing plane stays horizontal and misses the pitch plane, producing low line drives and pop-ups.',
     '{hitting}'),
    ('late-trigger',            'Late trigger',
     'Hitter starts the load and stride too late, causing late contact and lost power to the pull side.',
     '{hitting}'),
    ('weight-gets-stuck-back',  'Weight gets stuck back',
     'Hitter fails to transfer weight to the front side, losing drive and producing weak contact.',
     '{hitting}'),
    ('poor-two-strike-approach','Poor two-strike approach',
     'Hitter maintains a pull-heavy load and long swing with two strikes instead of shortening up and battling.',
     '{hitting,mental}'),
    ('struggles-vs-off-speed',  'Struggles versus off-speed',
     'Hitter commits early on off-speed pitches, producing rollovers and swings-and-misses on changeups and breaking balls.',
     '{hitting}'),
    ('no-backside-on-breaking', 'No backside on breaking balls',
     'Hitter cannot keep the barrel in the zone through a breaking ball away, producing weak pull-side contact.',
     '{hitting}'),
    ('poor-bunt-execution',     'Poor bunt execution',
     'Sacrifice or drag bunt placement is inconsistent; deadens to the pitcher or pops up rather than rolling down the line.',
     '{hitting}'),
    ('chases-out-of-zone',      'Chases out of the zone',
     'Hitter expands with two strikes or when fooled, producing low-quality at-bats and elevated strikeout rate.',
     '{hitting,mental}'),
    ('pulls-off-at-contact',    'Pulls off at contact',
     'Hitter rotates away from the baseball at contact, losing the outside part of the plate and producing weak contact.',
     '{hitting}'),

    -- ═══ PITCHING (10) ═════════════════════════════════════════════════════
    ('glove-side-command',      'Glove-side command',
     'Pitcher struggles to execute pitches to the glove-side edge, especially at the same height as target.',
     '{pitching}'),
    ('arm-side-command',        'Arm-side command',
     'Pitcher struggles to execute to the arm-side edge; fastballs drift into the middle of the plate.',
     '{pitching}'),
    ('flat-vertical-approach-angle', 'Flat vertical approach angle',
     'Fastball approaches the zone at too shallow an angle, reducing swing-and-miss at the top of the zone.',
     '{pitching}'),
    ('drops-elbow',             'Drops elbow',
     'Throwing elbow drops below the shoulder line at release, producing arm-side miss and flat breaking balls.',
     '{pitching}'),
    ('rushes-delivery',         'Rushes delivery',
     'Lower half outpaces the arm, causing the ball to release early, miss high, and leak arm-side.',
     '{pitching}'),
    ('inconsistent-release-point','Inconsistent release point',
     'Release point varies pitch-to-pitch, hurting command and tipping off hitters to pitch type.',
     '{pitching}'),
    ('no-secondary-pitch-command','No secondary pitch command',
     'Pitcher can only execute the fastball for strikes; secondary pitches land out of the zone or in the middle.',
     '{pitching}'),
    ('tips-pitches',            'Tips pitches',
     'Delivery or glove position changes between pitch types, letting hitters sit on specific pitches.',
     '{pitching}'),
    ('slow-to-plate-with-runners','Slow to the plate with runners',
     'Pitcher takes too long from first move to release, giving baserunners free steals.',
     '{pitching,team_defense}'),
    ('poor-pfp-execution',      'Poor pitcher fielding practice (PFP) execution',
     'Pitcher is slow or out of position on comebackers, bunt coverage, and covering first base.',
     '{pitching,fielding}'),

    -- ═══ FIELDING (5) ══════════════════════════════════════════════════════
    ('slow-first-step',         'Slow first step',
     'Fielder reacts late off the bat, losing range on balls to either side.',
     '{fielding}'),
    ('poor-throw-accuracy-on-the-run','Poor throw accuracy on the run',
     'Fielder loses throw accuracy when moving laterally or charging the ball.',
     '{fielding}'),
    ('rushes-transfer',         'Rushes transfer',
     'Fielder flips the ball out of the glove early, producing bobbles and errant throws to bases.',
     '{fielding}'),
    ('misreads-routes-in-outfield','Misreads routes in outfield',
     'Outfielder takes indirect routes to fly balls, losing range and catchable outs.',
     '{fielding}'),
    ('weak-backhand',           'Weak backhand',
     'Infielder struggles to secure backhand plays, producing boots and errant throws.',
     '{fielding}'),

    -- ═══ BASERUNNING / TEAM DEFENSE (3) ═══════════════════════════════════
    ('poor-secondary-leads',    'Poor secondary leads',
     'Runner fails to extend the secondary on contact, losing the ability to advance on a wild pitch or read on a ground ball.',
     '{baserunning}'),
    ('misreads-first-to-third', 'Misreads first-to-third',
     'Runner fails to read the outfielder and coach, stopping at second on a ball that should have advanced them to third.',
     '{baserunning}'),
    ('blown-bunt-coverage',     'Blown bunt coverage',
     'Defense fails to execute assigned bunt coverage, leaving bases uncovered or unattacked bunts.',
     '{team_defense,pitching}')
  ) as d(slug, name, description, skills)
  on conflict (id) do nothing;
end $$;
```

- [ ] **Step 2: Apply and verify count**

```bash
supabase db reset
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2-)" -c \
  "select count(*) from public.practice_deficits where visibility='system';"
```

Expected: `30`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260422000003_seed_system_deficits.sql
git commit -m "feat(database): seed 30 curated system deficits (Tier 4)"
```

---

## Task 4: Regenerate Supabase TypeScript types

**Files:**
- Modify: `packages/database/src/types/supabase.ts` (regenerated output)

- [ ] **Step 1: Regenerate**

```bash
pnpm --filter @baseball/database gen-types
```

Expected: command completes without error; `packages/database/src/types/supabase.ts` is modified.

- [ ] **Step 2: Verify the new tables are present**

```bash
grep -E "practice_deficits|practice_drill_deficit_tags|practice_drill_deficit_priority" packages/database/src/types/supabase.ts | head -10
```

Expected: several matches across `Tables`, `Enums`, and `Relationships` sections.

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/types/supabase.ts
git commit -m "chore(database): regenerate Supabase types after deficit migrations"
```

---

## Task 5: Shared types — `practice-deficit.ts`

**Files:**
- Create: `packages/shared/src/types/practice-deficit.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/types/practice-drill.ts` (extend `DrillFilters`)

- [ ] **Step 1: Create the types file**

```ts
// packages/shared/src/types/practice-deficit.ts
/**
 * Deficit vocabulary and drill↔deficit tag types. Mirror the Postgres tables
 * and enum defined in:
 *   supabase/migrations/20260422000001_practice_deficits.sql
 *   supabase/migrations/20260422000002_practice_drill_deficit_tags.sql
 *
 * String values MUST match the DB enum labels exactly so values round-trip
 * through Supabase without mapping.
 */

import type {
  PracticeDrillVisibility,
  PracticeSkillCategory,
} from './practice-drill';

export enum PracticeDrillDeficitPriority {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
}

export interface PracticeDeficit {
  id: string;
  /** null for visibility='system'; owning team id otherwise. */
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
  /** null for system tags (seed-only); team id for team-scoped tags. */
  teamId: string | null;
  priority: PracticeDrillDeficitPriority;
  createdBy?: string;
  createdAt: string;
}

/** Shape returned by hydrating a tag with its resolved deficit. */
export interface DrillDeficitTagHydrated {
  tagId: string;
  deficit: PracticeDeficit;
  priority: PracticeDrillDeficitPriority;
  tagScope: 'system' | 'team';
}
```

- [ ] **Step 2: Export from types barrel**

Add to `packages/shared/src/types/index.ts` (alphabetical with existing lines):

```ts
export * from './practice-deficit';
```

- [ ] **Step 3: Extend `DrillFilters`**

In `packages/shared/src/types/practice-drill.ts`, add to the `DrillFilters` interface (end of the interface, before the closing brace at the bottom of the file):

```ts
export interface DrillFilters {
  skillCategories?: PracticeSkillCategory[];
  positions?: string[];
  ageLevels?: PracticeAgeLevel[];
  equipment?: PracticeEquipment[];
  fieldSpaces?: PracticeFieldSpace[];
  search?: string;
  minPlayers?: number;
  maxPlayers?: number;
  durationMax?: number;
  visibility?: 'system' | 'team' | 'all';
  /** OR-match: drill passes if it has a tag for ANY of these deficit ids. */
  deficitIds?: string[];
  /** 'primary' requires matching tags to be priority='primary'; default 'any'. */
  deficitPriority?: 'primary' | 'any';
}
```

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter @baseball/shared type-check
```

Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/practice-deficit.ts \
        packages/shared/src/types/index.ts \
        packages/shared/src/types/practice-drill.ts
git commit -m "feat(shared): add practice-deficit types and extend DrillFilters"
```

---

## Task 6: Shared constants — deficit priority label

**Files:**
- Modify: `packages/shared/src/constants/practice.ts`

- [ ] **Step 1: Add label map**

At the bottom of `packages/shared/src/constants/practice.ts`, add:

```ts
import { PracticeDrillDeficitPriority } from '../types/practice-deficit';

export const DEFICIT_PRIORITY_LABELS: Record<PracticeDrillDeficitPriority, string> = {
  [PracticeDrillDeficitPriority.PRIMARY]: 'Primary',
  [PracticeDrillDeficitPriority.SECONDARY]: 'Secondary',
};
```

Merge the new import into the existing `import { ... } from '../types/practice-drill'` block above if preferred — or add a new import line. Keep the new constant grouped with the other `*_LABELS` maps at the bottom of the file.

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter @baseball/shared type-check
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/constants/practice.ts
git commit -m "feat(shared): add DEFICIT_PRIORITY_LABELS constant"
```

---

## Task 7: Shared validation — Zod schemas for deficits

**Files:**
- Create: `packages/shared/src/validation/practice-deficit.ts`
- Modify: `packages/shared/src/validation/index.ts`

- [ ] **Step 1: Write the schemas**

```ts
// packages/shared/src/validation/practice-deficit.ts
import { z } from 'zod';
import {
  PracticeDrillDeficitPriority,
} from '../types/practice-deficit';
import { PracticeSkillCategory } from '../types/practice-drill';

const SLUG_RE = /^[a-z0-9-]{1,80}$/;

export const createDeficitSchema = z.object({
  slug: z.string().regex(SLUG_RE, 'slug must be 1–80 chars of [a-z0-9-]'),
  name: z.string().trim().min(1, 'name required').max(120, 'name too long'),
  description: z
    .string()
    .trim()
    .max(1000, 'description too long')
    .optional(),
  skillCategories: z
    .array(z.nativeEnum(PracticeSkillCategory))
    .min(1, 'at least one skill category required'),
});

export type CreateDeficitInput = z.infer<typeof createDeficitSchema>;

export const updateDeficitSchema = createDeficitSchema.partial();
export type UpdateDeficitInput = z.infer<typeof updateDeficitSchema>;

export const drillDeficitTagSchema = z.object({
  drillId: z.string().uuid(),
  deficitId: z.string().uuid(),
  teamId: z.string().uuid(),
  priority: z.nativeEnum(PracticeDrillDeficitPriority),
});
export type DrillDeficitTagInput = z.infer<typeof drillDeficitTagSchema>;
```

- [ ] **Step 2: Export from validation barrel**

Add to `packages/shared/src/validation/index.ts`:

```ts
export * from './practice-deficit';
```

- [ ] **Step 3: Run type-check**

```bash
pnpm --filter @baseball/shared type-check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/validation/practice-deficit.ts \
        packages/shared/src/validation/index.ts
git commit -m "feat(shared): add Zod validators for deficits"
```

---

## Task 8: Shared filter helper — `matchesDeficits` (TDD)

**Files:**
- Create: `packages/shared/src/utils/__tests__/practice-drill-deficit-filter.test.ts` (first)
- Modify: `packages/shared/src/utils/practice-drill-filter.ts` (second)

- [ ] **Step 1: Write the failing tests**

```ts
// packages/shared/src/utils/__tests__/practice-drill-deficit-filter.test.ts
import {
  matchesDeficits,
  type DeficitTagIndex,
} from '../practice-drill-filter';
import {
  PracticeDrillDeficitPriority,
  type PracticeDrill,
  type PracticeDrillDeficitTag,
} from '../../types';
import { PracticeDrillVisibility } from '../../types/practice-drill';

function drill(id: string): PracticeDrill {
  return {
    id,
    teamId: null,
    visibility: PracticeDrillVisibility.SYSTEM,
    name: `drill-${id}`,
    skillCategories: [],
    positions: [],
    ageLevels: [],
    equipment: [],
    fieldSpaces: [],
    tags: [],
    createdAt: '2026-04-22T00:00:00Z',
    updatedAt: '2026-04-22T00:00:00Z',
  };
}

function tag(
  drillId: string,
  deficitId: string,
  priority: PracticeDrillDeficitPriority,
  teamId: string | null = null,
): PracticeDrillDeficitTag {
  return {
    id: `tag-${drillId}-${deficitId}-${teamId ?? 'system'}`,
    drillId,
    deficitId,
    teamId,
    priority,
    createdAt: '2026-04-22T00:00:00Z',
  };
}

function index(tags: PracticeDrillDeficitTag[]): DeficitTagIndex {
  const map = new Map<string, PracticeDrillDeficitTag[]>();
  for (const t of tags) {
    const list = map.get(t.drillId) ?? [];
    list.push(t);
    map.set(t.drillId, list);
  }
  return map;
}

describe('matchesDeficits', () => {
  it('passes when filters.deficitIds is undefined', () => {
    expect(matchesDeficits(drill('d1'), index([]), {})).toBe(true);
  });

  it('passes when filters.deficitIds is empty', () => {
    expect(matchesDeficits(drill('d1'), index([]), { deficitIds: [] })).toBe(true);
  });

  it('matches any of the requested deficit ids', () => {
    const tags = index([
      tag('d1', 'def-a', PracticeDrillDeficitPriority.SECONDARY),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, { deficitIds: ['def-a', 'def-b'] }),
    ).toBe(true);
  });

  it('rejects a drill with no matching tag', () => {
    const tags = index([
      tag('d1', 'def-c', PracticeDrillDeficitPriority.PRIMARY),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, { deficitIds: ['def-a'] }),
    ).toBe(false);
  });

  it('rejects a drill with no tags at all', () => {
    expect(
      matchesDeficits(drill('d1'), index([]), { deficitIds: ['def-a'] }),
    ).toBe(false);
  });

  it('primary-only: rejects drill whose only match is secondary', () => {
    const tags = index([
      tag('d1', 'def-a', PracticeDrillDeficitPriority.SECONDARY),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, {
        deficitIds: ['def-a'],
        deficitPriority: 'primary',
      }),
    ).toBe(false);
  });

  it('primary-only: passes drill with a primary match', () => {
    const tags = index([
      tag('d1', 'def-a', PracticeDrillDeficitPriority.PRIMARY),
      tag('d1', 'def-b', PracticeDrillDeficitPriority.SECONDARY),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, {
        deficitIds: ['def-a'],
        deficitPriority: 'primary',
      }),
    ).toBe(true);
  });

  it('treats system and team-scoped tags equivalently for matching', () => {
    const tags = index([
      tag('d1', 'def-a', PracticeDrillDeficitPriority.PRIMARY, 'team-1'),
    ]);
    expect(
      matchesDeficits(drill('d1'), tags, { deficitIds: ['def-a'] }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests — expect them to FAIL**

```bash
pnpm --filter @baseball/shared test -- practice-drill-deficit-filter
```

Expected: failure referencing `matchesDeficits` not exported / undefined.

- [ ] **Step 3: Implement `matchesDeficits` and `DeficitTagIndex`**

Append to `packages/shared/src/utils/practice-drill-filter.ts`:

```ts
import {
  PracticeDrillDeficitPriority,
  type PracticeDrillDeficitTag,
} from '../types/practice-deficit';

/** Drill-id-keyed index of tag rows. */
export type DeficitTagIndex = Map<string, PracticeDrillDeficitTag[]>;

/**
 * Pure-data predicate used both for client-side filtering and for tests.
 * Callers that fetch from the DB typically push the same filter down via the
 * `listDrills` subquery; this helper stays pure for test coverage.
 */
export function matchesDeficits(
  drill: PracticeDrill,
  tagsByDrill: DeficitTagIndex,
  filters: Pick<DrillFilters, 'deficitIds' | 'deficitPriority'>,
): boolean {
  if (!filters.deficitIds || filters.deficitIds.length === 0) return true;

  const tags = tagsByDrill.get(drill.id) ?? [];
  if (tags.length === 0) return false;

  const wantedIds = new Set(filters.deficitIds);
  const requirePrimary = filters.deficitPriority === 'primary';

  return tags.some(
    (t) =>
      wantedIds.has(t.deficitId) &&
      (!requirePrimary || t.priority === PracticeDrillDeficitPriority.PRIMARY),
  );
}
```

- [ ] **Step 4: Run the tests — expect PASS**

```bash
pnpm --filter @baseball/shared test -- practice-drill-deficit-filter
```

Expected: all tests pass, exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/__tests__/practice-drill-deficit-filter.test.ts \
        packages/shared/src/utils/practice-drill-filter.ts
git commit -m "feat(shared): add matchesDeficits helper with unit tests"
```

---

## Task 9: Database queries — deficit CRUD and listing

**Files:**
- Create: `packages/database/src/queries/practice-deficits.ts`
- Modify: `packages/database/src/queries/index.ts`

- [ ] **Step 1: Write the queries file**

```ts
// packages/database/src/queries/practice-deficits.ts
import {
  createDeficitSchema,
  updateDeficitSchema,
  type CreateDeficitInput,
  type UpdateDeficitInput,
  type PracticeDeficit,
  type PracticeDrillDeficitTag,
  type DrillDeficitTagHydrated,
  PracticeDrillDeficitPriority,
  type PracticeSkillCategory,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const DEFICITS_TABLE = 'practice_deficits' as never;
const TAGS_TABLE = 'practice_drill_deficit_tags' as never;

interface RawDeficitRow {
  id: string;
  team_id: string | null;
  visibility: 'system' | 'team';
  slug: string;
  name: string;
  description: string | null;
  skill_categories: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function mapDeficit(row: RawDeficitRow): PracticeDeficit {
  return {
    id: row.id,
    teamId: row.team_id,
    visibility: row.visibility as PracticeDeficit['visibility'],
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    skillCategories: row.skill_categories as PracticeSkillCategory[],
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface RawTagRow {
  id: string;
  drill_id: string;
  deficit_id: string;
  team_id: string | null;
  priority: 'primary' | 'secondary';
  created_by: string | null;
  created_at: string;
}

function mapTag(row: RawTagRow): PracticeDrillDeficitTag {
  return {
    id: row.id,
    drillId: row.drill_id,
    deficitId: row.deficit_id,
    teamId: row.team_id,
    priority: row.priority as PracticeDrillDeficitPriority,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * System deficits UNION the team's own deficits. Ordering puts the first
 * skill category first (so hitting deficits group together), then name.
 */
export async function listDeficitsForTeam(
  supabase: TypedSupabaseClient,
  teamId: string,
): Promise<PracticeDeficit[]> {
  const { data, error } = await supabase
    .from(DEFICITS_TABLE)
    .select('*')
    .or(`team_id.eq.${teamId},visibility.eq.system`)
    .order('name', { ascending: true });
  if (error) throw error;
  return ((data as unknown as RawDeficitRow[]) ?? []).map(mapDeficit);
}

/**
 * Team-scoped slug wins over a system slug of the same name when both exist.
 */
export async function getDeficitBySlug(
  supabase: TypedSupabaseClient,
  teamId: string,
  slug: string,
): Promise<PracticeDeficit | null> {
  const { data, error } = await supabase
    .from(DEFICITS_TABLE)
    .select('*')
    .eq('slug', slug)
    .or(`team_id.eq.${teamId},visibility.eq.system`);
  if (error) throw error;
  const rows = ((data as unknown as RawDeficitRow[]) ?? []).map(mapDeficit);
  if (rows.length === 0) return null;
  const teamRow = rows.find((r) => r.teamId === teamId);
  return teamRow ?? rows[0] ?? null;
}

export async function createTeamDeficit(
  supabase: TypedSupabaseClient,
  teamId: string,
  createdBy: string,
  input: CreateDeficitInput,
): Promise<PracticeDeficit> {
  const parsed = createDeficitSchema.parse(input);
  const payload = {
    team_id: teamId,
    visibility: 'team',
    slug: parsed.slug,
    name: parsed.name,
    description: parsed.description ?? null,
    skill_categories: parsed.skillCategories,
    created_by: createdBy,
  };
  const { data, error } = await supabase
    .from(DEFICITS_TABLE)
    .insert(payload as never)
    .select('*')
    .single();
  if (error) throw error;
  return mapDeficit(data as unknown as RawDeficitRow);
}

export async function updateTeamDeficit(
  supabase: TypedSupabaseClient,
  deficitId: string,
  patch: UpdateDeficitInput,
): Promise<PracticeDeficit> {
  const parsed = updateDeficitSchema.parse(patch);
  const payload: Record<string, unknown> = {};
  const has = (k: keyof UpdateDeficitInput) =>
    Object.prototype.hasOwnProperty.call(parsed, k);
  if (has('slug')) payload.slug = parsed.slug;
  if (has('name')) payload.name = parsed.name;
  if (has('description')) payload.description = parsed.description ?? null;
  if (has('skillCategories')) payload.skill_categories = parsed.skillCategories;

  const { data, error } = await supabase
    .from(DEFICITS_TABLE)
    .update(payload as never)
    .eq('id', deficitId)
    .select('*')
    .single();
  if (error) throw error;
  return mapDeficit(data as unknown as RawDeficitRow);
}

export async function deleteTeamDeficit(
  supabase: TypedSupabaseClient,
  deficitId: string,
): Promise<void> {
  const { error } = await supabase.from(DEFICITS_TABLE).delete().eq('id', deficitId);
  if (error) throw error;
}

/** Returns system + team-scoped tags on the drill, hydrated with the deficit row. */
export async function listDrillDeficitTags(
  supabase: TypedSupabaseClient,
  drillId: string,
  teamId: string,
): Promise<DrillDeficitTagHydrated[]> {
  const { data, error } = await supabase
    .from(TAGS_TABLE)
    .select('*, deficit:practice_deficits(*)')
    .eq('drill_id', drillId)
    .or(`team_id.is.null,team_id.eq.${teamId}`);
  if (error) throw error;

  interface Joined extends RawTagRow {
    deficit: RawDeficitRow;
  }
  const rows = (data as unknown as Joined[]) ?? [];
  return rows.map((r) => ({
    tagId: r.id,
    deficit: mapDeficit(r.deficit),
    priority: r.priority as PracticeDrillDeficitPriority,
    tagScope: r.team_id === null ? 'system' : 'team',
  }));
}

export async function upsertDrillDeficitTag(
  supabase: TypedSupabaseClient,
  input: {
    drillId: string;
    deficitId: string;
    teamId: string;
    priority: PracticeDrillDeficitPriority;
    createdBy: string;
  },
): Promise<PracticeDrillDeficitTag> {
  const payload = {
    drill_id: input.drillId,
    deficit_id: input.deficitId,
    team_id: input.teamId,
    priority: input.priority,
    created_by: input.createdBy,
  };
  const { data, error } = await supabase
    .from(TAGS_TABLE)
    .upsert(payload as never, {
      onConflict: 'drill_id,deficit_id,team_id',
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapTag(data as unknown as RawTagRow);
}

export async function removeDrillDeficitTag(
  supabase: TypedSupabaseClient,
  tagId: string,
): Promise<void> {
  const { error } = await supabase.from(TAGS_TABLE).delete().eq('id', tagId);
  if (error) throw error;
}
```

- [ ] **Step 2: Add to the queries barrel**

In `packages/database/src/queries/index.ts`, add:

```ts
export * from './practice-deficits';
```

- [ ] **Step 3: Run type-check**

```bash
pnpm --filter @baseball/database type-check
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/queries/practice-deficits.ts \
        packages/database/src/queries/index.ts
git commit -m "feat(database): add practice_deficits query helpers"
```

---

## Task 10: Extend `listDrills` with deficit filter subquery

**Files:**
- Modify: `packages/database/src/queries/practice-drills.ts`

- [ ] **Step 1: Update `listDrills`**

Replace the current `listDrills` implementation (around line 96) with:

```ts
export async function listDrills(
  supabase: TypedSupabaseClient,
  teamId: string,
  filters: DrillFilters = {},
): Promise<PracticeDrill[]> {
  let query = supabase
    .from(DRILLS_TABLE)
    .select('*')
    .or(`team_id.eq.${teamId},visibility.eq.system`)
    .order('name', { ascending: true });

  if (filters.deficitIds && filters.deficitIds.length > 0) {
    // Fetch matching drill_ids from the tag table, then IN-filter. RLS on the
    // tag table handles system-vs-team visibility so we don't re-encode it.
    const tagQuery = supabase
      .from('practice_drill_deficit_tags' as never)
      .select('drill_id')
      .in('deficit_id', filters.deficitIds);

    const { data: tagRows, error: tagError } =
      filters.deficitPriority === 'primary'
        ? await tagQuery.eq('priority', 'primary')
        : await tagQuery;
    if (tagError) throw tagError;
    const drillIds = Array.from(
      new Set(
        ((tagRows as unknown as { drill_id: string }[]) ?? []).map((r) => r.drill_id),
      ),
    );
    if (drillIds.length === 0) return [];
    query = query.in('id', drillIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as unknown as RawDrillRow[]) ?? [];
  const mapped = rows.map(mapDrill);
  return applyClientFilters(mapped, filters);
}
```

Note: existing non-deficit filters still apply via the existing `applyClientFilters(mapped, filters)` call. No change needed there.

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter @baseball/database type-check
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/queries/practice-drills.ts
git commit -m "feat(database): extend listDrills with deficit-id filter"
```

---

## Task 11: Web — load deficits on drill library page

**Files:**
- Modify: `apps/web/src/app/(app)/practices/drills/page.tsx`
- Modify: `apps/web/src/app/(app)/practices/drills/DrillLibraryClient.tsx`

- [ ] **Step 1: Load deficits server-side**

In `page.tsx`, after the `drills` fetch around line 68, add:

```ts
import { listDeficitsForTeam } from '@baseball/database';
import type { PracticeDeficit } from '@baseball/shared';

// ...inside the default export, parallel to listDrills:
const [drills, deficits]: [PracticeDrill[], PracticeDeficit[]] = await Promise.all([
  listDrills(supabase, activeTeam.id),
  listDeficitsForTeam(supabase, activeTeam.id),
]);
```

Replace the single `const drills: PracticeDrill[] = await listDrills(...)` line with the `Promise.all` block above.

Update the `<DrillLibraryClient drills={drills} />` call site to:

```tsx
<DrillLibraryClient drills={drills} deficits={deficits} />
```

- [ ] **Step 2: Update the client component to accept and pass through deficits**

In `DrillLibraryClient.tsx`:

```tsx
import type { PracticeDeficit } from '@baseball/shared';

interface Props {
  drills: PracticeDrill[];
  deficits: PracticeDeficit[];
}

export function DrillLibraryClient({ drills, deficits }: Props): JSX.Element {
  // ...existing state...
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <DrillFiltersPanel filters={filters} onChange={setFilters} deficits={deficits} />
      </aside>
      {/* ...rest unchanged... */}
    </div>
  );
}
```

- [ ] **Step 3: Run web type-check**

```bash
pnpm --filter web type-check
```

Expected: will fail on `DrillFiltersPanel` prop mismatch (picked up in next task). That failure is acceptable — proceed.

- [ ] **Step 4: No commit yet — pair with Task 12**

Leave uncommitted; Task 12 completes the flow before the next commit.

---

## Task 12: Web — deficit multi-select in `DrillFiltersPanel`

**Files:**
- Modify: `apps/web/src/app/(app)/practices/drills/DrillFilters.tsx`

- [ ] **Step 1: Add deficit section and primary toggle**

Replace the `Props` interface at the top of the file with:

```tsx
import type { JSX } from 'react';
import {
  AGE_LEVEL_LABELS,
  DrillFilters,
  EQUIPMENT_LABELS,
  FIELD_SPACE_LABELS,
  PracticeAgeLevel,
  PracticeDeficit,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
  SKILL_CATEGORY_LABELS,
} from '@baseball/shared';

interface Props {
  filters: DrillFilters;
  onChange: (next: DrillFilters) => void;
  deficits: PracticeDeficit[];
}
```

Update the destructuring on the function signature:

```tsx
export function DrillFiltersPanel({ filters, onChange, deficits }: Props): JSX.Element {
```

Extend `hasAnyFilter` to include the new filters:

```tsx
const hasAnyFilter =
  (filters.skillCategories?.length ?? 0) > 0 ||
  (filters.ageLevels?.length ?? 0) > 0 ||
  (filters.equipment?.length ?? 0) > 0 ||
  (filters.fieldSpaces?.length ?? 0) > 0 ||
  (filters.deficitIds?.length ?? 0) > 0 ||
  filters.deficitPriority === 'primary' ||
  (filters.visibility !== undefined && filters.visibility !== 'all') ||
  filters.durationMax !== undefined ||
  !!filters.search;
```

Add a new section just above the "Source" section (near the end of the JSX):

```tsx
<section className="border-t border-gray-100 pt-3 mt-3">
  <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
    Addresses deficit
  </h3>
  {deficits.length === 0 ? (
    <p className="text-xs text-gray-400">No deficits available.</p>
  ) : (
    <>
      <label className="flex items-center gap-2 text-sm text-gray-700 py-1 cursor-pointer mb-1">
        <input
          type="checkbox"
          checked={filters.deficitPriority === 'primary'}
          onChange={(e) =>
            onChange({
              ...filters,
              deficitPriority: e.target.checked ? 'primary' : 'any',
            })
          }
          className="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
        />
        Primary tags only
      </label>
      <div className="max-h-48 overflow-y-auto pr-1 border border-gray-100 rounded">
        {deficits.map((d) => {
          const checked = filters.deficitIds?.includes(d.id) ?? false;
          return (
            <label
              key={d.id}
              className="flex items-center gap-2 text-sm text-gray-700 py-1 px-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const current = filters.deficitIds ?? [];
                  const next = checked
                    ? current.filter((id) => id !== d.id)
                    : [...current, d.id];
                  onChange({ ...filters, deficitIds: next });
                }}
                className="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
              />
              <span className="truncate" title={d.description ?? d.name}>
                {d.name}
              </span>
            </label>
          );
        })}
      </div>
    </>
  )}
</section>
```

- [ ] **Step 2: Run type-check + lint on web**

```bash
pnpm --filter web type-check
```

Expected: exits 0 for new code (pre-existing UI type errors unrelated to these files stay pre-existing).

- [ ] **Step 3: Ensure the page actually wires filters through**

`DrillLibraryClient.tsx` currently runs `filterDrills(drills, filters)` client-side. Since deficit filtering is enforced server-side via `listDrills`, the client still needs to re-fetch when `deficitIds` changes. Simplest: leave the server-side filter unused by the current client flow and rely on post-filtering client-side using tag data. We'll keep the server subquery for future consumers, and client-filter via `matchesDeficits` to keep the drill library reactive without a round-trip.

In `page.tsx` alongside `drills` and `deficits`, also load tag rows for every visible drill (small set — 120 system + team drills) once:

```ts
import { supabase as _unused } from '@/lib/...'; // no change, just a marker

// Replace the Promise.all block with:
const [drills, deficits] = await Promise.all([
  listDrills(supabase, activeTeam.id),
  listDeficitsForTeam(supabase, activeTeam.id),
]);

const { data: tagRows, error: tagError } = await supabase
  .from('practice_drill_deficit_tags')
  .select('*')
  .or(`team_id.is.null,team_id.eq.${activeTeam.id}`);
if (tagError) throw tagError;
const tags = (tagRows ?? []) as {
  id: string;
  drill_id: string;
  deficit_id: string;
  team_id: string | null;
  priority: 'primary' | 'secondary';
  created_at: string;
  created_by: string | null;
}[];
```

Convert to the shared type and pass down:

```ts
import type { PracticeDrillDeficitTag } from '@baseball/shared';
import { PracticeDrillDeficitPriority } from '@baseball/shared';

const hydratedTags: PracticeDrillDeficitTag[] = tags.map((r) => ({
  id: r.id,
  drillId: r.drill_id,
  deficitId: r.deficit_id,
  teamId: r.team_id,
  priority: r.priority as PracticeDrillDeficitPriority,
  createdBy: r.created_by ?? undefined,
  createdAt: r.created_at,
}));

// ...render:
<DrillLibraryClient drills={drills} deficits={deficits} tags={hydratedTags} />
```

Update `DrillLibraryClient` accordingly:

```tsx
import {
  DrillFilters,
  PracticeDeficit,
  PracticeDrill,
  PracticeDrillDeficitTag,
  filterDrills,
  matchesDeficits,
  sortDrills,
  type DrillSort,
} from '@baseball/shared';

interface Props {
  drills: PracticeDrill[];
  deficits: PracticeDeficit[];
  tags: PracticeDrillDeficitTag[];
}

export function DrillLibraryClient({ drills, deficits, tags }: Props): JSX.Element {
  const [filters, setFilters] = useState<DrillFilters>({});
  const [sort, setSort] = useState<DrillSort>('name');

  const tagIndex = useMemo(() => {
    const map = new Map<string, PracticeDrillDeficitTag[]>();
    for (const t of tags) {
      const list = map.get(t.drillId) ?? [];
      list.push(t);
      map.set(t.drillId, list);
    }
    return map;
  }, [tags]);

  const visible = useMemo(() => {
    const filtered = filterDrills(drills, filters).filter((d) =>
      matchesDeficits(d, tagIndex, filters),
    );
    return sortDrills(filtered, sort);
  }, [drills, filters, tagIndex, sort]);

  // ...rest unchanged, but pass deficits down:
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <DrillFiltersPanel filters={filters} onChange={setFilters} deficits={deficits} />
      </aside>
      {/* ...unchanged... */}
    </div>
  );
}
```

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter web type-check
```

Expected: no new errors introduced in these files.

- [ ] **Step 5: Commit Tasks 11 + 12 together**

```bash
git add apps/web/src/app/\(app\)/practices/drills/page.tsx \
        apps/web/src/app/\(app\)/practices/drills/DrillLibraryClient.tsx \
        apps/web/src/app/\(app\)/practices/drills/DrillFilters.tsx
git commit -m "feat(web): add deficit filter to drill library"
```

---

## Task 13: Web — primary-deficit chips on `DrillCard`

**Files:**
- Modify: `apps/web/src/app/(app)/practices/drills/DrillCard.tsx`
- Modify: `apps/web/src/app/(app)/practices/drills/DrillLibraryClient.tsx` (pass tag index to card)

- [ ] **Step 1: Extend `DrillCard` props and render chips**

Replace the file with:

```tsx
import type { JSX } from 'react';
import {
  PracticeDeficit,
  PracticeDrill,
  PracticeDrillDeficitPriority,
  PracticeDrillDeficitTag,
  PracticeDrillVisibility,
  SKILL_CATEGORY_LABELS,
  FIELD_SPACE_LABELS,
} from '@baseball/shared';

interface Props {
  drill: PracticeDrill;
  tags: PracticeDrillDeficitTag[];
  deficitById: Map<string, PracticeDeficit>;
}

export function DrillCard({ drill, tags, deficitById }: Props): JSX.Element {
  const isSystem = drill.visibility === PracticeDrillVisibility.SYSTEM;
  const primaryTags = tags
    .filter((t) => t.priority === PracticeDrillDeficitPriority.PRIMARY)
    .slice(0, 2);

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:border-brand-400 hover:shadow-sm transition-all p-4 h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 leading-tight">{drill.name}</h3>
        {isSystem ? (
          <span className="text-[10px] uppercase tracking-wide font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full whitespace-nowrap">
            Curated
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">
            Team
          </span>
        )}
      </div>

      {drill.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-3">{drill.description}</p>
      )}

      <div className="flex flex-wrap gap-1 mb-3">
        {drill.skillCategories.map((sc) => (
          <span
            key={sc}
            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700"
          >
            {SKILL_CATEGORY_LABELS[sc] ?? sc}
          </span>
        ))}
      </div>

      {primaryTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {primaryTags.map((t) => {
            const d = deficitById.get(t.deficitId);
            if (!d) return null;
            return (
              <span
                key={t.id}
                className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800"
                title={d.description ?? d.name}
              >
                Fixes: {d.name}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-auto text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
        {drill.defaultDurationMinutes !== undefined && (
          <span>⏱ {drill.defaultDurationMinutes} min</span>
        )}
        {drill.minPlayers !== undefined && (
          <span>
            👥 {drill.minPlayers}
            {drill.maxPlayers !== undefined && drill.maxPlayers !== drill.minPlayers
              ? `–${drill.maxPlayers}`
              : ''}
          </span>
        )}
        {drill.fieldSpaces.length > 0 && (
          <span className="truncate" title={drill.fieldSpaces.join(', ')}>
            🏟 {drill.fieldSpaces.map((fs) => FIELD_SPACE_LABELS[fs] ?? fs).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `deficitById` map in `DrillLibraryClient`**

Add the map and pass both down to each card:

```tsx
const deficitById = useMemo(() => {
  const m = new Map<string, PracticeDeficit>();
  for (const d of deficits) m.set(d.id, d);
  return m;
}, [deficits]);
```

Inside the `<ul>` list of cards:

```tsx
{visible.map((d) => (
  <li key={d.id}>
    <Link href={`/practices/drills/${d.id}`} className="block h-full">
      <DrillCard
        drill={d}
        tags={tagIndex.get(d.id) ?? []}
        deficitById={deficitById}
      />
    </Link>
  </li>
))}
```

- [ ] **Step 3: Run web type-check**

```bash
pnpm --filter web type-check
```

Expected: no new errors in these files.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/practices/drills/DrillCard.tsx \
        apps/web/src/app/\(app\)/practices/drills/DrillLibraryClient.tsx
git commit -m "feat(web): render primary-deficit chips on drill cards"
```

---

## Task 14: Web — "Fixes" section on drill detail page

**Files:**
- Modify: `apps/web/src/app/(app)/practices/drills/[drillId]/page.tsx`

- [ ] **Step 1: Load and render hydrated tags**

Update imports at the top of the file:

```tsx
import {
  AGE_LEVEL_LABELS,
  DrillDeficitTagHydrated,
  EQUIPMENT_LABELS,
  FIELD_SPACE_LABELS,
  PracticeDrillDeficitPriority,
  PracticeDrillVisibility,
  SKILL_CATEGORY_LABELS,
} from '@baseball/shared';
import {
  getDrillAttachmentSignedUrl,
  getDrillById,
  listDrillAttachments,
  listDrillDeficitTags,
} from '@baseball/database';
```

After the `attachments` fetch, add:

```ts
const hydratedTags: DrillDeficitTagHydrated[] = await listDrillDeficitTags(
  supabase,
  drill.id,
  activeTeam.id,
);
const primary = hydratedTags.filter(
  (t) => t.priority === PracticeDrillDeficitPriority.PRIMARY,
);
const secondary = hydratedTags.filter(
  (t) => t.priority === PracticeDrillDeficitPriority.SECONDARY,
);
```

Add a new JSX section after `TagSection title="Skills"` and before the Equipment section:

```tsx
{(primary.length > 0 || secondary.length > 0) && (
  <section className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
    <h2 className="text-sm font-semibold text-gray-900 mb-3">Fixes</h2>
    {primary.length > 0 && (
      <>
        <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
          Primary
        </h3>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {primary.map((t) => (
            <span
              key={t.tagId}
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800"
              title={t.deficit.description ?? t.deficit.name}
            >
              {t.deficit.name}
            </span>
          ))}
        </div>
      </>
    )}
    {secondary.length > 0 && (
      <>
        <h3 className="text-xs uppercase tracking-wide font-semibold text-gray-500 mb-1">
          Secondary
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {secondary.map((t) => (
            <span
              key={t.tagId}
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-50 text-gray-700"
              title={t.deficit.description ?? t.deficit.name}
            >
              {t.deficit.name}
            </span>
          ))}
        </div>
      </>
    )}
  </section>
)}
```

- [ ] **Step 2: Run web type-check**

```bash
pnpm --filter web type-check
```

Expected: no new errors in this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/practices/drills/\[drillId\]/page.tsx
git commit -m "feat(web): add Fixes section to drill detail page"
```

---

## Task 15: Full verification + manual RLS smoke

**Files:**
- No file changes; verification only.

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass; shared package includes the new `practice-drill-deficit-filter` suite.

- [ ] **Step 2: Run shared + database type-check**

```bash
pnpm --filter @baseball/shared type-check
pnpm --filter @baseball/database type-check
```

Expected: both exit 0.

- [ ] **Step 3: RLS smoke (manual)**

Start `supabase start` if not running, then run via SQL editor or psql:

```sql
-- As service role: count system deficits
select count(*) from public.practice_deficits where visibility='system';
-- Expected: 30

-- As a regular authenticated user with team membership (replace :user and :team):
set local role authenticated;
set local request.jwt.claims to '{"sub":"<user-uuid>"}'::jsonb;
select count(*) from public.practice_deficits;
-- Expected: 30 (system) + any team-created rows visible to that user
```

Document any surprise in `docs/2026-04-22-drill-deficit-tagging-design.md` under "Testing strategy".

- [ ] **Step 4: Web smoke (manual)**

```bash
pnpm dev:web
```

Open `http://localhost:3000/practices/drills` as a coach on a seeded team. Verify:
- "Addresses deficit" section appears in the left filter panel with 30 deficit rows (scroll-in-section).
- Selecting a deficit filters the drill list (today it will produce zero results because no drill-tag rows are seeded — expected).
- Inserting a tag row in SQL (e.g. `insert into practice_drill_deficit_tags (drill_id, deficit_id, priority) select id, (select id from practice_deficits where slug='early-bat-drag'), 'primary' from practice_drills where visibility='system' limit 1;`) causes the associated drill to appear when filtered.
- Drill detail page for a tagged drill shows "Fixes" with the deficit name.

- [ ] **Step 5: No commit — this task verifies prior commits**

---

## Self-review notes

This plan covers the spec end-to-end:

| Spec section | Task(s) |
|---|---|
| `practice_deficits` schema + RLS | Task 1 |
| `practice_drill_deficit_tags` schema + RLS | Task 2 |
| Seed 30 system deficits | Task 3 |
| Regenerate Supabase types | Task 4 |
| Shared types + `DrillFilters` extension | Task 5 |
| Label constants | Task 6 |
| Zod validators | Task 7 |
| `matchesDeficits` filter helper + tests | Task 8 |
| Database query helpers | Task 9 |
| Extend `listDrills` | Task 10 |
| Web drill library — filter panel | Tasks 11–12 |
| Web drill card — primary chips | Task 13 |
| Web drill detail — "Fixes" section | Task 14 |
| Full verification + manual RLS smoke | Task 15 |

**Type consistency check:** `PracticeDrillDeficitPriority`, `PracticeDeficit`, `PracticeDrillDeficitTag`, `DrillDeficitTagHydrated`, `matchesDeficits`, `DeficitTagIndex`, `listDeficitsForTeam`, `getDeficitBySlug`, `createTeamDeficit`, `updateTeamDeficit`, `deleteTeamDeficit`, `listDrillDeficitTags`, `upsertDrillDeficitTag`, `removeDrillDeficitTag`, `DEFICIT_PRIORITY_LABELS`, `createDeficitSchema`, `updateDeficitSchema`, `drillDeficitTagSchema` — names used consistently across tasks.

**Out-of-scope reminders (from spec):** no drill-tagging UI, no team-deficit admin UI, no mobile changes, no IDP / auto-suggest / recruit export. Plan does not include those tasks.
