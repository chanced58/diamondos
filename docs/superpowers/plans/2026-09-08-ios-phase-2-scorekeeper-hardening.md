# iOS Phase 2 — Scorekeeper Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the iPad scorekeeper trustworthy — correct pitch counts, correct sacrifice rules, a game that finalizes, and a log a coach can review and fix.

**Architecture:** Scoring rules currently live inside web JSX conditionals, so mobile cannot inherit them. This plan adds a pure, tested rules seam at `packages/shared/src/rules/`, migrates both clients onto it, and fixes the defects through it. Mobile's twelve separate in-play handlers get a single choke point so the next in-play outcome cannot forget to record its pitch.

**Tech Stack:** TypeScript, Expo SDK 51 + Expo Router v3, WatermelonDB, Next.js 14, Supabase, Jest + ts-jest (shared), Jest + React Native Testing Library (mobile, added by Task 1), Turborepo + pnpm.

**Design spec:** [2026-09-08-ios-phase-2-scorekeeper-hardening-design.md](../specs/2026-09-08-ios-phase-2-scorekeeper-hardening-design.md)

## Global Constraints

- **`game_events` is append-only.** Never UPDATE or DELETE a row. Corrections are made by appending `EVENT_VOIDED`.
- **No historical backfill.** Existing games keep their undercounted pitch totals. Do not write a migration that infers pitches.
- **Web behaviour must not change** except where provably wrong (the sac-bunt gate). Every other web edit is a refactor to consume the shared rule with identical output.
- **Do not bump `apps/mobile/src/db/schema.ts` `version`** without a matching step in `apps/mobile/src/db/migrations.ts`. No task here requires a schema bump.
- **Conventional Commits** for every commit: `<type>(<scope>): <summary>`.
- **Manual verification runs against `diamondos-prod`, under a strict protocol.** This reverses the original constraint. `diamondos-dev` turned out to be an empty project (zero tables, no migration history) and Supabase branching requires the Pro plan, which this org is not on; the repo owner decided on 2026-09-08 to accept prod with discipline rather than spend the phase standing up an environment. The protocol is not optional:
  1. Every manual test uses a **new game whose `opponent_name` begins with `SHAKEDOWN`**. Never a real fixture, never an existing game — including the three currently sitting in `in_progress`.
  2. Record the game's `id` before scoring anything.
  3. When the check is done, **delete that game and its events, scoped by that id only.** This is the sanctioned exception to the append-only rule and applies to shakedown games alone.
  4. Never modify, finalize, or score any row you did not create.
  If a verification step cannot be done under this protocol, skip it and say so in your report rather than improvising.
- Mobile events must match web's event shape exactly so both clients write identical logs.
- Enum values are fixed: `HitTrajectory` is `GROUND_BALL | LINE_DRIVE | FLY_BALL` — there is no `POP_UP`. `BattedOutType` is `'groundout' | 'flyout' | 'lineout' | 'popout'`.

---

## File Structure

**Created:**
- `packages/shared/src/rules/index.ts` — barrel re-export for the rules seam
- `packages/shared/src/rules/sacrifice.ts` — sacrifice eligibility (OBR 9.08)
- `packages/shared/src/rules/pitch-events.ts` — which outcomes require a `PITCH_THROWN`
- `packages/shared/src/rules/__tests__/sacrifice.test.ts`
- `packages/shared/src/rules/__tests__/pitch-events.test.ts`
- `apps/mobile/jest.config.js`, `apps/mobile/jest.setup.js`
- `apps/mobile/src/features/scoring/in-play-pitch.ts` — in-play pitch choke point
- `apps/mobile/src/features/scoring/__tests__/in-play-pitch.test.ts`
- `apps/mobile/src/features/scoring/PlayFeed.tsx` — play-by-play list
- `apps/mobile/src/features/scoring/use-play-feed.ts` — derives feed rows from events

**Modified:**
- `apps/mobile/src/features/scoring/PitchInput.tsx` — gate SF/SH; zone-grid layout
- `apps/mobile/app/(tabs)/games/[gameId]/score.tsx` — in-play choke point, feed wiring, lineup wizard, End Game copy
- `apps/web/src/app/(app)/games/[gameId]/score/ScoringBoard.tsx:805-812, 2126-2145` — consume shared rule
- `apps/mobile/src/sync/sync-engine.ts:773-840` — honest finalize failure
- `apps/mobile/app/(tabs)/practices/index.tsx:78` — typecheck fix
- `apps/mobile/tsconfig.json` — enable `experimentalDecorators` (WatermelonDB)
- `packages/ui/tsconfig.json` + new `packages/ui/nativewind-env.d.ts` — NativeWind `className` typing
- `docs/baseball-rules.md` §9.08(a), Appendix A.5
- `.env.example`, `CLAUDE.md`
- `packages/shared/src/index.ts` — export `./rules`

**Boundary rule:** everything in `packages/shared/src/rules/` is pure — no React, no I/O, no platform types. It takes `LiveGameState` plus plain arguments and returns plain data.

---

## Sequencing

Task 0 is cancelled (see below). Task 1 unblocks all mobile tests. Tasks 2→4 are the sacrifice chain; 6→7 the pitch-count chain; both depend on Task 1 only for their mobile halves. Tasks 8–12 are independent of each other.

`score.tsx` (3,017 lines) is split **incrementally** — each task extracts only what it touches. There is no big-bang refactor task.

---

## Task 0: (superseded — no action)

**Status: cancelled on 2026-09-08.** This task was to restore `diamondos-dev` and seed it. On execution `diamondos-dev` proved to be an entirely empty project — zero public tables and no `supabase_migrations` schema — so it would have meant replaying all 127 migrations (493 KB of SQL) from scratch. Supabase branching, the clean alternative, returned `PaymentRequiredException`: it needs the Pro plan and this org is not on it.

The repo owner chose to verify against `diamondos-prod` under the shakedown protocol now recorded in Global Constraints. **Do not perform this task.** `diamondos-dev` has been returned to its paused state.

Every later task's manual-verification step runs against prod under that protocol. Read it before you run one.

---

## Task 1: Mobile test harness and green typecheck

**Files:**
- Create: `apps/mobile/jest.config.js`, `apps/mobile/jest.setup.js`
- Create: `apps/mobile/src/features/scoring/__tests__/smoke.test.ts`
- Modify: `apps/mobile/package.json`, `turbo.json`, `apps/mobile/app/(tabs)/practices/index.tsx:78`

**Interfaces:**
- Consumes: nothing
- Produces: `pnpm --filter mobile test` runs Jest; `pnpm type-check` is green repo-wide

**Amended 2026-09-08.** The brief originally said one pre-existing typecheck error existed, trusting PR #206. That was incomplete — there are **101**: 90 × `TS1240` in `apps/mobile/src/db/models/*.ts` (WatermelonDB legacy decorators; `experimentalDecorators` is set nowhere in the chain) and 11 × `TS2769` in `packages/ui` (NativeWind `className` not type-augmented). Both are in scope for this task. Set `experimentalDecorators` in `apps/mobile/tsconfig.json` only — never in `tsconfig.base.json`, which would change semantics for web and shared. For ui, add a `nativewind-env.d.ts` holding `/// <reference types="nativewind/types" />` and list it in that package's tsconfig `include`.

- [ ] **Step 1: Install dev dependencies**

```bash
pnpm --filter mobile add -D jest@^29.7.0 jest-expo@~51.0.0 @testing-library/react-native@^12.4.0 @types/jest@^29.5.0
```

- [ ] **Step 2: Add the Jest config**

Create `apps/mobile/jest.config.js`:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|@nozbe/watermelondb|@baseball/.*))',
  ],
};
```

- [ ] **Step 3: Add the Jest setup file**

WatermelonDB and expo-crypto need stubs so scoring modules import cleanly under Node. Create `apps/mobile/jest.setup.js`:

```js
jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));
```

- [ ] **Step 4: Add the test script**

In `apps/mobile/package.json`, add to `"scripts"`:

```json
"test": "jest"
```

Confirm `turbo.json` has a `test` pipeline entry. If it does not, add:

```json
"test": { "dependsOn": ["^build"], "outputs": [] }
```

- [ ] **Step 5: Write a smoke test that proves the harness runs shared code**

Create `apps/mobile/src/features/scoring/__tests__/smoke.test.ts`:

```ts
import { EventType } from '@baseball/shared';

describe('mobile test harness', () => {
  it('resolves @baseball/shared from a mobile test', () => {
    expect(EventType.PITCH_THROWN).toBe('pitch_thrown');
  });
});
```

- [ ] **Step 6: Run it**

Run: `pnpm --filter mobile test`
Expected: 1 passing test. If module resolution fails, widen `transformIgnorePatterns` — do not stub `@baseball/shared`.

- [ ] **Step 7: Fix the pre-existing typecheck error**

`apps/mobile/app/(tabs)/practices/index.tsx:78` passes a template-literal route where `Href<string>` is expected. Read the surrounding lines and replace the string route with the object form Expo Router expects:

```tsx
router.push({ pathname: '/(tabs)/practices/[practiceId]/card', params: { practiceId: practice.id } });
```

- [ ] **Step 8: Verify typecheck is green**

Run: `pnpm type-check`
Expected: no errors in any workspace.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/jest.config.js apps/mobile/jest.setup.js apps/mobile/package.json apps/mobile/src/features/scoring/__tests__/smoke.test.ts "apps/mobile/app/(tabs)/practices/index.tsx" turbo.json pnpm-lock.yaml
git commit -m "test(mobile): add jest harness and fix practices route typecheck error"
```

---

## Task 2: Sacrifice eligibility rule in shared

**Files:**
- Create: `packages/shared/src/rules/sacrifice.ts`, `packages/shared/src/rules/index.ts`
- Create: `packages/shared/src/rules/__tests__/sacrifice.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `LiveGameState` from `../types/game`, `HitTrajectory` from `../types/game-event`
- Produces:
  ```ts
  export interface SacrificeEligibility { sacFly: boolean; sacBunt: boolean }
  export function sacrificeEligibility(
    state: Pick<LiveGameState, 'outs' | 'runnersOnBase'>,
    trajectory?: HitTrajectory,
  ): SacrificeEligibility
  ```
  Tasks 3 and 4 both call this. `trajectory` omitted means "not yet known" and does **not** disqualify a sac fly — the pre-out-type sheet uses that form.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/rules/__tests__/sacrifice.test.ts`:

```ts
import { sacrificeEligibility } from '../sacrifice';
import { HitTrajectory } from '../../types/game-event';

const bases = (o: Partial<{ first: string; second: string; third: string }> = {}) => ({
  first: o.first ?? null,
  second: o.second ?? null,
  third: o.third ?? null,
});

describe('sacrificeEligibility', () => {
  it('allows both with 0 outs and a runner on third', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases({ third: 'r1' }) }))
      .toEqual({ sacFly: true, sacBunt: true });
  });

  it('denies both with 2 outs (OBR 9.08 "before two are out")', () => {
    expect(sacrificeEligibility({ outs: 2, runnersOnBase: bases({ third: 'r1' }) }))
      .toEqual({ sacFly: false, sacBunt: false });
  });

  it('denies a sac fly with nobody past first', () => {
    const r = sacrificeEligibility({ outs: 1, runnersOnBase: bases({ first: 'r1' }) });
    expect(r.sacFly).toBe(false);
    expect(r.sacBunt).toBe(true);
  });

  it('denies both with the bases empty — nobody to advance (OBR 9.08(a))', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases() }))
      .toEqual({ sacFly: false, sacBunt: false });
  });

  it('allows a sac bunt with a runner on first only', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases({ first: 'r1' }) }).sacBunt).toBe(true);
  });

  it('allows both at exactly one out — the boundary below two', () => {
    expect(sacrificeEligibility({ outs: 1, runnersOnBase: bases({ third: 'r1' }) }))
      .toEqual({ sacFly: true, sacBunt: true });
  });

  it('allows a sac fly on a runner from second', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases({ second: 'r1' }) }).sacFly).toBe(true);
  });

  it('denies a sac fly on a ground ball', () => {
    expect(
      sacrificeEligibility({ outs: 0, runnersOnBase: bases({ third: 'r1' }) }, HitTrajectory.GROUND_BALL).sacFly,
    ).toBe(false);
  });

  it('allows a sac fly on a fly ball or a line drive (OBR 9.08(d))', () => {
    const st = { outs: 0, runnersOnBase: bases({ third: 'r1' }) };
    expect(sacrificeEligibility(st, HitTrajectory.FLY_BALL).sacFly).toBe(true);
    expect(sacrificeEligibility(st, HitTrajectory.LINE_DRIVE).sacFly).toBe(true);
  });

  it('treats an unknown trajectory as not disqualifying', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases({ third: 'r1' }) }, undefined).sacFly).toBe(true);
  });

  it('denies a sac bunt with 2 outs even on a ground ball', () => {
    expect(
      sacrificeEligibility({ outs: 2, runnersOnBase: bases({ first: 'r1' }) }, HitTrajectory.GROUND_BALL).sacBunt,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @baseball/shared test -- sacrifice`
Expected: FAIL — cannot find module `../sacrifice`.

- [ ] **Step 3: Implement the rule**

Create `packages/shared/src/rules/sacrifice.ts`:

```ts
import type { LiveGameState } from '../types/game';
import { HitTrajectory } from '../types/game-event';

export interface SacrificeEligibility {
  sacFly: boolean;
  sacBunt: boolean;
}

/**
 * OBR 9.08 — no sacrifice of either kind is credited with two out, because
 * the batter's out ends the inning and nothing productive can follow.
 *
 * 9.08(a) sacrifice bunt: "when, before two are out, the batter advances one
 * or more runners with a bunt" — so it needs fewer than two outs AND at least
 * one runner on base to advance. Whether the runner actually advanced on the
 * play is the scorer's judgment and is not decided here.
 *
 * 9.08(d) sacrifice fly: additionally requires a fly ball or line drive, and
 * a runner able to score on the catch (second or third).
 *
 * `trajectory` is optional because the in-play sheet offers Sac Fly before
 * the batted-ball type is known; an omitted trajectory does not disqualify.
 */
export function sacrificeEligibility(
  state: Pick<LiveGameState, 'outs' | 'runnersOnBase'>,
  trajectory?: HitTrajectory,
): SacrificeEligibility {
  const beforeTwoOuts = state.outs < 2;
  if (!beforeTwoOuts) return { sacFly: false, sacBunt: false };

  const runnerCanScore =
    !!state.runnersOnBase.second || !!state.runnersOnBase.third;
  const trajectoryAllowsFly =
    trajectory === undefined ||
    trajectory === HitTrajectory.FLY_BALL ||
    trajectory === HitTrajectory.LINE_DRIVE;

  // A bunt can only be a sacrifice if there is somebody to advance. With the
  // bases empty a bunt out is an ordinary out, never an SH.
  const anyRunnerOn =
    !!state.runnersOnBase.first ||
    !!state.runnersOnBase.second ||
    !!state.runnersOnBase.third;

  return {
    sacFly: runnerCanScore && trajectoryAllowsFly,
    sacBunt: anyRunnerOn,
  };
}
```

- [ ] **Step 4: Add the barrel and export it from the package root**

Create `packages/shared/src/rules/index.ts`:

```ts
export * from './sacrifice';
```

Add to `packages/shared/src/index.ts`, following the existing `export * from './utils'` style:

```ts
export * from './rules';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @baseball/shared test`
Expected: all 9 new tests pass, and the existing 476 still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/rules packages/shared/src/index.ts
git commit -m "feat(shared): add sacrifice eligibility rule per OBR 9.08"
```

---

## Task 3: Gate sacrifice buttons on mobile

**Files:**
- Modify: `apps/mobile/src/features/scoring/PitchInput.tsx:52-160` (props), `:520-527` (in-play sheet buttons)
- Modify: `apps/mobile/app/(tabs)/games/[gameId]/score.tsx` (pass the flags), `:1880-1900` (PitchInput props)

**Interfaces:**
- Consumes: `sacrificeEligibility` from `@baseball/shared` (Task 2)
- Produces: `PitchInput` props `sacFlyEligible?: boolean` and `sacBuntEligible?: boolean`, defaulting to `true` so existing call sites are unchanged in behaviour

- [ ] **Step 1: Add the props to PitchInput**

In the props interface alongside the existing `fcEligible`, add:

```tsx
  /** Sac fly may be credited — OBR 9.08(d). Hidden when false. */
  sacFlyEligible?: boolean;
  /** Sac bunt may be credited — OBR 9.08(a). Hidden when false. */
  sacBuntEligible?: boolean;
```

Destructure with defaults in the component signature, matching how `trackPitchLocation = false` is done:

```tsx
  sacFlyEligible = true,
  sacBuntEligible = true,
```

- [ ] **Step 2: Gate the two buttons**

Replace the unconditional Sac Fly and Sac Bunt buttons at `PitchInput.tsx:523-524` with gated ones, matching the existing `fcEligible` pattern:

```tsx
{sacFlyEligible && (
  <OutcomeButton label="Sac Fly" emoji="SF" onPress={() => runFromSheet(setShowInPlaySheet, onRecordSacFly)} color="bg-teal-600" />
)}
{sacBuntEligible && (
  <OutcomeButton label="Sac Bunt" emoji="SH" onPress={() => runFromSheet(setShowInPlaySheet, onRecordSacBunt)} color="bg-teal-700" />
)}
```

- [ ] **Step 3: Compute and pass the flags from score.tsx**

Add near the other derived values (beside `runCapReached`, around `score.tsx:111`):

```tsx
const sacEligibility = gameState
  ? sacrificeEligibility({ outs: gameState.outs, runnersOnBase: gameState.runnersOnBase })
  : { sacFly: false, sacBunt: false };
```

Add `sacrificeEligibility` to the existing `@baseball/shared` import at `score.tsx:23`. Pass to `PitchInput` beside `trackPitchLocation`:

```tsx
sacFlyEligible={sacEligibility.sacFly}
sacBuntEligible={sacEligibility.sacBunt}
```

- [ ] **Step 4: Gate the post-out sacrifice prompt**

The "Groundout — sacrifice?" sheet offers Sacrifice fly and Sacrifice bunt after an out type is chosen. Compute eligibility there **with** the trajectory, using the same mapping `handleOut` uses (`score.tsx:682-687`):

```tsx
const pendingTrajectory: HitTrajectory | undefined =
  pendingOutType === 'groundout' ? HitTrajectory.GROUND_BALL
  : pendingOutType === 'flyout' ? HitTrajectory.FLY_BALL
  : pendingOutType === 'lineout' ? HitTrajectory.LINE_DRIVE
  : pendingOutType === 'popout' ? HitTrajectory.FLY_BALL
  : undefined;
const outSac = sacrificeEligibility(
  { outs: gameState.outs, runnersOnBase: gameState.runnersOnBase },
  pendingTrajectory,
);
```

Hide each option when its flag is false. **When both are false, skip the prompt entirely and record the regular out directly** — this is the behaviour from the unmerged `eb8cfdb`, and without it the sheet renders with only a "Regular out" button.

- [ ] **Step 5: Verify on the simulator**

Against dev (Task 0), start a game and check:
- 0 outs, bases empty → Sac Fly hidden, Sac Bunt shown
- 0 outs, runner on 2nd → both shown
- 2 outs → both hidden in the in-play sheet
- choose Out → Groundout with a runner on 3rd and 0 outs → Sacrifice fly **not** offered; Sacrifice bunt offered
- 2 outs → Out → Groundout goes straight to a recorded out with no sacrifice prompt

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/scoring/PitchInput.tsx "apps/mobile/app/(tabs)/games/[gameId]/score.tsx"
git commit -m "fix(mobile): gate sac fly and sac bunt on OBR 9.08 eligibility"
```

---

## Task 4: Migrate web onto the shared sacrifice rule

**Files:**
- Modify: `apps/web/src/app/(app)/games/[gameId]/score/ScoringBoard.tsx:805-812`, `:2126-2145`

**Interfaces:**
- Consumes: `sacrificeEligibility` from `@baseball/shared` (Task 2)
- Produces: no new exports. Deletes the inline `sacFlyEligible` conditional.

- [ ] **Step 1: Replace the inline rule**

Delete the comment and expression at `ScoringBoard.tsx:805-812` and replace with:

```ts
// OBR 9.08 — see sacrificeEligibility in @baseball/shared. Kept in shared so
// the mobile scorer enforces exactly the same rule.
const sacEligibility = sacrificeEligibility({
  outs: gameState.outs,
  runnersOnBase: gameState.runnersOnBase,
});
const sacFlyEligible = sacEligibility.sacFly;
const sacBuntEligible = sacEligibility.sacBunt;
const anySacEligible = sacFlyEligible || sacBuntEligible;
```

Add `sacrificeEligibility` to the existing `@baseball/shared` import.

- [ ] **Step 2: Gate the sac bunt button**

At `ScoringBoard.tsx:2129-2141` the Sacrifice bunt button is unconditional. Wrap it, mirroring the adjacent `sacFlyEligible &&` block:

```tsx
{sacBuntEligible && (
  <button
    onClick={() =>
      handleInPlaySacrifice(
        'sacrifice_bunt',
        pendingTrajectory ?? 'ground_ball',
        stashedSacFieldingSequence,
      )
    }
    className="py-2 text-sm font-semibold rounded-lg border border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 transition-colors"
  >
    Sacrifice bunt
  </button>
)}
```

- [ ] **Step 3: Skip the prompt when neither is eligible**

Find the branch that sets the sacrifice prompt when `stashedOutResult === 'out'` (near `ScoringBoard.tsx:2205`). Guard it with `anySacEligible`; when false, record the regular out directly instead of opening a modal whose only option is "Regular out".

- [ ] **Step 4: Verify web is unchanged except for the bunt gate**

Run: `pnpm --filter web test`
Expected: the existing 62 tests pass.

Then manually: at 0 outs with a runner on 3rd, web behaves exactly as before. At 2 outs, Sacrifice bunt is now hidden (this is the intended change) and the prompt is skipped.

- [ ] **Step 5: Leave `feat/sac-fly-scoring` in place**

Its logic now lives in shared, so the branch is superseded — but **do not delete it**. Branch deletion is the repository owner's decision and is handled outside this plan. Note in your report that the branch is now obsolete so it can be cleaned up separately.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/games/[gameId]/score/ScoringBoard.tsx"
git commit -m "refactor(web): consume shared sacrifice rule and gate sac bunt at 2 outs"
```

---

## Task 5: Correct the rules documentation

**Files:**
- Modify: `docs/baseball-rules.md` §9.08(a) (line ~721), Appendix A.5 (line ~959)

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by code. This is the doc gap that produced the code gap.

- [ ] **Step 1: Add the missing clause to 9.08(a)**

Replace the 9.08(a) paragraph with:

```markdown
**9.08(a) — Sacrifice Bunt (SH).** A batter who, **before two are out**, is put out on a bunt that advances at least one runner is credited with a sacrifice bunt. With two out no sacrifice is credited — the batter's out ends the inning. The scorer must judge that the batter's intent was to advance the runner (not to reach base). No SH if the batter is bunting for a hit. SH does not count as an AB but does count as a PA.
```

- [ ] **Step 2: Add the out constraint to both columns of A.5**

In the A.5 table, add a row after "Runner advance required":

```markdown
| Outs required | Fewer than 2 | Fewer than 2 |
```

And change the Sac Fly "Common scenarios" cell from "Runner on 3rd, fewer than 2 outs" to "Runner on 3rd tagging up" so the constraint is not implied to be fly-only.

- [ ] **Step 3: Commit**

```bash
git add docs/baseball-rules.md
git commit -m "docs: add OBR 9.08(a) two-out constraint for sacrifice bunts"
```

---

## Task 6: Pitch-event rule in shared

**Files:**
- Create: `packages/shared/src/rules/pitch-events.ts`
- Create: `packages/shared/src/rules/__tests__/pitch-events.test.ts`
- Modify: `packages/shared/src/rules/index.ts`

**Interfaces:**
- Consumes: `EventType`, `PitchOutcome` from `../types/game-event`
- Produces:
  ```ts
  export const IN_PLAY_TERMINAL_EVENTS: readonly EventType[]
  export function requiresPitchEvent(terminal: EventType): boolean
  ```
  Task 7 uses `requiresPitchEvent` to decide whether a mobile handler must emit a `PITCH_THROWN` first.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/rules/__tests__/pitch-events.test.ts`:

```ts
import { requiresPitchEvent, IN_PLAY_TERMINAL_EVENTS } from '../pitch-events';
import { EventType } from '../../types/game-event';

describe('requiresPitchEvent', () => {
  it.each([
    EventType.HIT,
    EventType.OUT,
    EventType.SACRIFICE_FLY,
    EventType.SACRIFICE_BUNT,
    EventType.FIELD_ERROR,
    EventType.DOUBLE_PLAY,
    EventType.TRIPLE_PLAY,
  ])('requires a pitch for %s', (t) => {
    expect(requiresPitchEvent(t)).toBe(true);
  });

  it.each([
    EventType.WALK,
    EventType.STRIKEOUT,
    EventType.DROPPED_THIRD_STRIKE,
    EventType.HIT_BY_PITCH,
    EventType.CATCHER_INTERFERENCE,
    EventType.STOLEN_BASE,
    EventType.CAUGHT_STEALING,
    EventType.BALK,
    EventType.PITCH_THROWN,
    EventType.SUBSTITUTION,
    EventType.INNING_CHANGE,
  ])('does not require a pitch for %s', (t) => {
    expect(requiresPitchEvent(t)).toBe(false);
  });

  it('lists exactly the seven in-play terminals', () => {
    expect([...IN_PLAY_TERMINAL_EVENTS].sort()).toEqual(
      [
        EventType.DOUBLE_PLAY,
        EventType.FIELD_ERROR,
        EventType.HIT,
        EventType.OUT,
        EventType.SACRIFICE_BUNT,
        EventType.SACRIFICE_FLY,
        EventType.TRIPLE_PLAY,
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @baseball/shared test -- pitch-events`
Expected: FAIL — cannot find module `../pitch-events`.

- [ ] **Step 3: Implement**

Create `packages/shared/src/rules/pitch-events.ts`:

```ts
import { EventType } from '../types/game-event';

/**
 * Terminal events that can only happen on a batted ball, and therefore must
 * be preceded by a PITCH_THROWN with outcome `in_play`.
 *
 * Excluded deliberately:
 *  - WALK / STRIKEOUT / DROPPED_THIRD_STRIKE / HIT_BY_PITCH — the pitch that
 *    produced them was already recorded by the pitch-outcome path.
 *  - CATCHER_INTERFERENCE — not a ball put in play, and deriveGameState
 *    groups it with WALK / HIT_BY_PITCH as an event a scorer may jump
 *    straight to with no preceding pitch. The web scorer records no pitch
 *    for it either, so including it would make the two clients disagree.
 *  - STOLEN_BASE / CAUGHT_STEALING / BALK and other runner plays — mirrors
 *    the web scorer, which records no in_play pitch for these.
 *
 * Pitch counting reads PITCH_THROWN only (see utils/pitch-count.ts), so an
 * in-play terminal without its pitch silently undercounts the pitcher.
 */
export const IN_PLAY_TERMINAL_EVENTS: readonly EventType[] = [
  EventType.HIT,
  EventType.OUT,
  EventType.SACRIFICE_FLY,
  EventType.SACRIFICE_BUNT,
  EventType.FIELD_ERROR,
  EventType.DOUBLE_PLAY,
  EventType.TRIPLE_PLAY,
] as const;

export function requiresPitchEvent(terminal: EventType): boolean {
  return IN_PLAY_TERMINAL_EVENTS.includes(terminal);
}
```

- [ ] **Step 4: Export from the barrel**

Add to `packages/shared/src/rules/index.ts`:

```ts
export * from './pitch-events';
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @baseball/shared test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/rules
git commit -m "feat(shared): declare which terminal events require a pitch event"
```

---

## Task 7: Emit PITCH_THROWN for every ball put in play

**Files:**
- Create: `apps/mobile/src/features/scoring/in-play-pitch.ts` — the choke point, extracted so it is directly testable
- Create: `apps/mobile/src/features/scoring/__tests__/in-play-pitch.test.ts`
- Modify: `apps/mobile/app/(tabs)/games/[gameId]/score.tsx:1880-1920` (wrap handlers at the prop boundary)

**Interfaces:**
- Consumes: `requiresPitchEvent` from `@baseball/shared` (Task 6); `recordEvent` from `useRecordEvent`
- Produces:
  ```ts
  export interface InPlayPitchContext {
    inning: number;
    isTopOfInning: boolean;
    attribution: HalfAttribution;
  }
  export type RecordEventFn = (
    eventType: EventType, inning: number, isTopOfInning: boolean, payload: GameEventPayload,
  ) => Promise<string>;

  export function makeInPlayPitchWrapper(
    recordEvent: RecordEventFn,
    getContext: () => InPlayPitchContext | null,
  ): <A extends unknown[]>(terminal: EventType, fn: (...a: A) => Promise<void>) => (...a: A) => Promise<void>
  ```
  The wrapper is a standalone module rather than a closure inside `score.tsx` **so the test imports and exercises the real function.** A test that re-declares a local copy of the logic verifies nothing.

**Why a choke point:** web funnels all in-play results through four functions and emits the pitch in each. Mobile has twelve separate handlers, which is exactly why the pitch event was missed. Wrapping once at the prop boundary makes the covered set a single auditable list.

- [ ] **Step 1: Write the failing test against the real module**

Create `apps/mobile/src/features/scoring/__tests__/in-play-pitch.test.ts`. It imports the module under test — do **not** re-declare the wrapper locally:

```ts
import { EventType, PitchOutcome } from '@baseball/shared';
import { makeInPlayPitchWrapper, type InPlayPitchContext } from '../in-play-pitch';

const ctx: InPlayPitchContext = {
  inning: 3,
  isTopOfInning: false,
  attribution: { batterId: 'b1', pitcherId: 'p1' },
};

function harness(context: InPlayPitchContext | null = ctx) {
  const calls: { type: EventType; payload: Record<string, unknown> }[] = [];
  const recordEvent = async (
    type: EventType, _i: number, _t: boolean, payload: Record<string, unknown>,
  ) => { calls.push({ type, payload }); return 'evt-1'; };
  return { calls, wrap: makeInPlayPitchWrapper(recordEvent as never, () => context) };
}

describe('makeInPlayPitchWrapper', () => {
  it('records the pitch before the terminal event', async () => {
    const { calls, wrap } = harness();
    await wrap(EventType.HIT, async () => {
      calls.push({ type: EventType.HIT, payload: {} });
    })();
    expect(calls.map((c) => c.type)).toEqual([EventType.PITCH_THROWN, EventType.HIT]);
  });

  it('tags the pitch outcome in_play and carries the half attribution', async () => {
    const { calls, wrap } = harness();
    await wrap(EventType.OUT, async () => {})();
    expect(calls[0].payload).toMatchObject({
      outcome: PitchOutcome.IN_PLAY,
      batterId: 'b1',
      pitcherId: 'p1',
    });
  });

  it('records the pitch at the current inning and half', async () => {
    const calls: { inning: number; isTop: boolean }[] = [];
    const recordEvent = async (_e: EventType, inning: number, isTop: boolean) => {
      calls.push({ inning, isTop }); return 'evt-1';
    };
    const wrap = makeInPlayPitchWrapper(recordEvent as never, () => ctx);
    await wrap(EventType.HIT, async () => {})();
    expect(calls[0]).toEqual({ inning: 3, isTop: false });
  });

  it('adds no pitch for a walk or a strikeout', async () => {
    for (const t of [EventType.WALK, EventType.STRIKEOUT]) {
      const { calls, wrap } = harness();
      await wrap(t, async () => { calls.push({ type: t, payload: {} }); })();
      expect(calls.map((c) => c.type)).toEqual([t]);
    }
  });

  it('still runs the terminal handler when there is no game context', async () => {
    const { calls, wrap } = harness(null);
    await wrap(EventType.HIT, async () => {
      calls.push({ type: EventType.HIT, payload: {} });
    })();
    expect(calls.map((c) => c.type)).toEqual([EventType.HIT]);
  });

  it('forwards arguments to the wrapped handler', async () => {
    const { wrap } = harness();
    const seen: unknown[] = [];
    await wrap(EventType.FIELD_ERROR, async (by: number) => { seen.push(by); })(6);
    expect(seen).toEqual([6]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter mobile test -- in-play-pitch`
Expected: FAIL — cannot find module `../in-play-pitch`.

- [ ] **Step 3: Implement the choke point module**

Create `apps/mobile/src/features/scoring/in-play-pitch.ts`:

```ts
import {
  EventType,
  PitchOutcome,
  requiresPitchEvent,
  type GameEventPayload,
  type PitchThrownPayload,
} from '@baseball/shared';
import type { HalfAttribution } from '@baseball/shared';

export interface InPlayPitchContext {
  inning: number;
  isTopOfInning: boolean;
  attribution: HalfAttribution;
}

export type RecordEventFn = (
  eventType: EventType,
  inning: number,
  isTopOfInning: boolean,
  payload: GameEventPayload,
) => Promise<string>;

/**
 * Wraps an in-play terminal handler so the PITCH_THROWN that every batted
 * ball implies is recorded first.
 *
 * Pitch counting reads PITCH_THROWN only (packages/shared/src/utils/
 * pitch-count.ts), so an in-play terminal without its pitch silently
 * undercounts the pitcher — and NFHS / Little League compliance is enforced
 * against that number.
 *
 * This exists as one choke point because the web scorer funnels every
 * in-play result through four functions while mobile has twelve separate
 * handlers; wrapping at the single prop boundary is what keeps the twelve
 * from drifting again.
 */
export function makeInPlayPitchWrapper(
  recordEvent: RecordEventFn,
  getContext: () => InPlayPitchContext | null,
) {
  return function withInPlayPitch<A extends unknown[]>(
    terminal: EventType,
    fn: (...args: A) => Promise<void>,
  ): (...args: A) => Promise<void> {
    return async (...args: A) => {
      const ctx = getContext();
      if (ctx && requiresPitchEvent(terminal)) {
        const pitchPayload: PitchThrownPayload = {
          ...ctx.attribution,
          outcome: PitchOutcome.IN_PLAY,
        };
        await recordEvent(
          EventType.PITCH_THROWN,
          ctx.inning,
          ctx.isTopOfInning,
          pitchPayload,
        );
      }
      await fn(...args);
    };
  };
}
```

If `HalfAttribution` is not exported from `@baseball/shared`, find its declaration (it is used as `halfAttribution` in `score.tsx`) and import it from wherever it lives, or inline its shape — do not use `any`.

- [ ] **Step 3b: Wire it into score.tsx**

Near the other derived values in `score.tsx`, construct the wrapper once:

```tsx
const withInPlayPitch = useMemo(
  () => makeInPlayPitchWrapper(recordEvent, () =>
    gameState
      ? { inning: gameState.inning, isTopOfInning: gameState.isTopOfInning, attribution: halfAttribution }
      : null,
  ),
  [recordEvent, gameState, halfAttribution],
);
```

- [ ] **Step 4: Wrap every in-play handler at the prop boundary**

Where the handlers are passed to `PitchInput`, wrap each one. This is the complete list — all eleven. `onRecordCatcherInterference` is deliberately NOT wrapped: catcher's interference is not a ball put in play, the web scorer records no pitch for it, and `deriveGameState` groups it with WALK / HIT_BY_PITCH as an event reachable with no preceding pitch.

```tsx
onRecordHit={withInPlayPitch(EventType.HIT, handleHit)}
onRecordHitWithRunnerOutcomes={withInPlayPitch(EventType.HIT, handleHitWithRunnerOutcomes)}
onRecordOut={withInPlayPitch(EventType.OUT, handleOut)}
onRecordError={withInPlayPitch(EventType.FIELD_ERROR, handleError)}
onRecordSacFly={withInPlayPitch(EventType.SACRIFICE_FLY, handleSacrificeFly)}
onRecordSacBunt={withInPlayPitch(EventType.SACRIFICE_BUNT, handleSacrificeBunt)}
onRecordSacFlyFromOut={withInPlayPitch(EventType.SACRIFICE_FLY, handleSacrificeFlyFromOut)}
onRecordSacBuntFromOut={withInPlayPitch(EventType.SACRIFICE_BUNT, handleSacrificeBuntFromOut)}
onRecordFieldersChoice={withInPlayPitch(EventType.OUT, handleFieldersChoice)}
onRecordDoublePlay={withInPlayPitch(EventType.DOUBLE_PLAY, handleDoublePlay)}
onRecordTriplePlay={withInPlayPitch(EventType.TRIPLE_PLAY, handleTriplePlay)}
```

Read the existing prop names at the `PitchInput` call site first and match them exactly — the names above follow the `onRecord*` convention already in `PitchInput.tsx`, but verify each against the file rather than assuming.

**Do not wrap** `onRecordWalk`, `onRecordStrikeout`, `onRecordDroppedThirdStrike`, HBP, or any runner play — their pitch is already recorded, or no pitch was thrown.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter mobile test && pnpm --filter @baseball/shared test`
Expected: all pass.

- [ ] **Step 6: Verify against the database**

On the simulator against dev, score one half-inning: a called strike, a ball, a double, and three groundouts. Then:

```sql
select event_type, count(*) from game_events where game_id = '<dev game id>' group by event_type;
```

Expected: `pitch_thrown` = 6 (2 taken + 4 in play), `hit` = 1, `out` = 3. Before this task the same sequence produced `pitch_thrown` = 2.

Also confirm the on-screen pitch count strip advances when a ball is put in play.

- [ ] **Step 7: Commit**

```bash
git add "apps/mobile/app/(tabs)/games/[gameId]/score.tsx" apps/mobile/src/features/scoring/__tests__/in-play-events.test.ts
git commit -m "fix(mobile): record a pitch for every ball put in play"
```

---

## Task 8: Make finalize work, and fail honestly when it cannot

**Files:**
- Modify: `apps/mobile/src/sync/sync-engine.ts:773-840`
- Modify: `apps/mobile/app/(tabs)/games/[gameId]/score.tsx:1006-1016` (alert copy), game header (banner)
- Modify: `.env.example`, `CLAUDE.md`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `export function isFinalizeConfigured(): boolean` from `sync-engine.ts`, used by the score screen to decide whether to show the banner

**Decision recorded:** the spec left "HTTP vs Postgres RPC" open. **This plan keeps the HTTP call and fixes the configuration and the silent failure.** Moving finalize to an RPC alongside `fn_start_game` is the better long-term shape — it would remove mobile's dependency on the Next.js deployment entirely — but it needs a new migration, a Deno/PLpgSQL port of `finalizeGame`, and prod coordination. That is its own plan, not a step inside this one. Task 0 already sets `EXPO_PUBLIC_API_BASE_URL`, so the immediate defect is closed either way.

- [ ] **Step 1: Export a configuration check**

Add to `sync-engine.ts`:

```ts
/** True when the app can reach the finalize endpoint at all. */
export function isFinalizeConfigured(): boolean {
  return !!process.env.EXPO_PUBLIC_API_BASE_URL;
}
```

- [ ] **Step 2: Stop the silent retry loop**

At `sync-engine.ts:798-804` the missing-URL branch logs and `continue`s every cycle forever. Replace the `console.warn` with a one-shot warning plus a module-level flag so the log is not spammed each cycle, and leave the game unreconciled so it still finalizes if the app is later rebuilt with the variable set:

```ts
if (!apiBaseUrl) {
  if (!warnedMissingApiBase) {
    warnedMissingApiBase = true;
    console.warn(
      'sync: EXPO_PUBLIC_API_BASE_URL is not set — completed games cannot finalize',
    );
  }
  continue;
}
```

Declare `let warnedMissingApiBase = false;` beside the other module-level state.

- [ ] **Step 3: Correct the End Game alert copy**

At `score.tsx:1009-1011` the message promises finalization unconditionally. Make it conditional:

```tsx
Alert.alert(
  'End game?',
  isFinalizeConfigured()
    ? `Final score ${lineScore.homeRuns}–${lineScore.awayRuns}. The result finalizes automatically when the device is back online.`
    : `Final score ${lineScore.homeRuns}–${lineScore.awayRuns}. The game will be marked complete on this device, but this build cannot finalize the result — it has no server address configured.`,
  [
    { text: 'Cancel', style: 'cancel' },
    { text: 'End Game', style: 'destructive', onPress: () => { handleEndGame().catch(console.warn); } },
  ],
);
```

- [ ] **Step 4: Show a persistent not-finalized banner**

On the completed-game view (`score.tsx:1444`, the read-only Final view), render a warning when the game has a `GAME_END` event but `game.status !== 'completed'`:

```tsx
{gameState.isFinal && game?.status !== 'completed' && (
  <View className="mx-4 mt-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
    <Text className="text-sm font-semibold text-amber-900">Not finalized yet</Text>
    <Text className="text-xs text-amber-800 mt-0.5">
      {isFinalizeConfigured()
        ? 'The result will finalize once this device syncs.'
        : 'This build has no server address configured, so the result cannot finalize.'}
    </Text>
  </View>
)}
```

- [ ] **Step 5: Document the variable**

Confirm `EXPO_PUBLIC_API_BASE_URL` is in `.env.example` (added in Task 0) and that CLAUDE.md's environment table still describes it accurately.

- [ ] **Step 6: Verify end to end**

With `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000` and `pnpm dev:web` running against dev, end a game on the simulator. Then:

```sql
select status, completed_at from games where id = '<dev game id>';
```

Expected: `completed`, with a non-null `completed_at`. Then unset the variable, rebuild, end another game, and confirm the banner appears and the alert copy changes.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/sync/sync-engine.ts "apps/mobile/app/(tabs)/games/[gameId]/score.tsx" CLAUDE.md
git commit -m "fix(mobile): finalize games and surface the failure when unconfigured"
```

---

## Task 9: Play-by-play feed

**Files:**
- Create: `apps/mobile/src/features/scoring/use-play-feed.ts`, `apps/mobile/src/features/scoring/PlayFeed.tsx`
- Modify: `apps/mobile/app/(tabs)/games/[gameId]/score.tsx` (render the feed in the read pane)
- Create: `packages/shared/src/utils/__tests__/format-event.test.ts` if the formatter moves

**Interfaces:**
- Consumes: `events` from `useGameState(gameId, teamId)` (already available at `score.tsx:92`)
- Produces:
  ```ts
  export interface PlayFeedRow {
    eventId: string;
    inning: number;
    isTopOfInning: boolean;
    description: string;
    isVoided: boolean;
  }
  export function usePlayFeed(events: GameEvent[], playerNames: Record<string, string>): PlayFeedRow[]
  ```
  Task 10 consumes `PlayFeedRow.eventId` and `isVoided`.

- [ ] **Step 1: Locate the existing formatter**

Read `apps/web/src/lib/live/format-event-ticker.ts`. If it is pure and has no Next.js or DOM imports, move it to `packages/shared/src/utils/format-event.ts`, re-export it from `packages/shared/src/utils/index.ts`, and update web's import. If it is not pure, extract the pure formatting core into shared and leave the web wrapper.

- [ ] **Step 2: Write the failing test for the feed hook**

Create `apps/mobile/src/features/scoring/__tests__/use-play-feed.test.ts` asserting that a HIT event yields one row with a human description, that an `EVENT_VOIDED` marks its target `isVoided: true`, and that rows come back newest-first. Use the same `mkEvent` factory style as `packages/shared/src/utils/__tests__/pitch-count.test.ts`.

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm --filter mobile test -- use-play-feed`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `use-play-feed.ts`**

Derive rows from `events`: skip `PITCH_THROWN` unless it is the only event in its plate appearance, collapse linked runner-outcome events into a parenthetical on their parent (the `relatedEventId` convention already used by `handleHitWithRunnerOutcomes`), and mark any event targeted by an `EVENT_VOIDED` as voided rather than removing it.

- [ ] **Step 5: Implement `PlayFeed.tsx`**

A `FlatList` of rows grouped by half-inning, newest first, with voided rows struck through and dimmed. It renders in the left read pane beneath the batting order, so it must scroll independently.

- [ ] **Step 6: Render it in score.tsx**

Add to the `BookPane`, below the batting-order card.

- [ ] **Step 7: Verify**

Score half an inning on the simulator and confirm every play appears with a readable description, in the right order, under the right half-inning.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/features/scoring/PlayFeed.tsx apps/mobile/src/features/scoring/use-play-feed.ts apps/mobile/src/features/scoring/__tests__/use-play-feed.test.ts "apps/mobile/app/(tabs)/games/[gameId]/score.tsx"
git commit -m "feat(mobile): add a play-by-play feed to the scoring screen"
```

---

## Task 10: Void any event from the feed

**Files:**
- Modify: `apps/mobile/src/features/scoring/PlayFeed.tsx`, `apps/mobile/app/(tabs)/games/[gameId]/score.tsx:1182-1243`

**Interfaces:**
- Consumes: `PlayFeedRow` (Task 9); the existing cascade logic inside `handleUndo`
- Produces: `voidEvent(eventId: string): Promise<void>` in `score.tsx`, passed to `PlayFeed` as `onVoid`

- [ ] **Step 1: Extract the cascade from handleUndo**

`handleUndo` at `score.tsx:1182` already finds child events by `relatedEventId` and voids them with the parent. Extract that into a standalone `voidEvent(eventId)` that takes an explicit id instead of walking back to find the most recent event, and reimplement `handleUndo` to call it with the id it finds. Behaviour of Undo must not change.

- [ ] **Step 2: Write the test**

Assert that voiding a parent HIT also emits `EVENT_VOIDED` for its linked `BASERUNNER_OUT`, and that voiding an already-voided event is a no-op.

- [ ] **Step 3: Run it, confirm it fails, then implement**

Run: `pnpm --filter mobile test -- void-event`

- [ ] **Step 4: Add the affordance to PlayFeed**

Long-press a row → confirmation alert naming the play → `onVoid(row.eventId)`. Voided rows are not actionable.

- [ ] **Step 5: Verify**

Score three innings, void a play from the first, and confirm the line score, outs, and baserunners all recompute — and that `game_events` gained an `EVENT_VOIDED` row rather than losing the original.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/scoring/PlayFeed.tsx "apps/mobile/app/(tabs)/games/[gameId]/score.tsx" apps/mobile/src/features/scoring/__tests__
git commit -m "feat(mobile): void any play from the feed, not just the last"
```

---

## Task 11: Lineup wizard writes a real batting order

**Files:**
- Modify: `apps/mobile/app/(tabs)/games/[gameId]/score.tsx:2835-3017` (LineupSetupModal), `:896-960` (handleStartGame)

**Interfaces:**
- Consumes: `useGameLineups` / `prepareLineupRow` from `apps/mobile/src/features/lineup/`, `apps/mobile/src/sync/lineup-sync.ts`
- Produces: no new exports. `handleStartGame` gains a `battingOrder: string[]` parameter.

- [ ] **Step 1: Change wizard step 2 to collect an order**

Step 2 currently asks "Who's batting first?" and returns one id. Change it to build an ordered list: tapping a player appends them to the order and shows their slot number; tapping again removes them. Require at least one; allow up to `getMaxBattingOrder(leagueSettings)`.

Relabel the step "Set your batting order" — the current wording is also wrong on a home game, where the team batting first is the opponent.

- [ ] **Step 2: Write `game_lineups` rows on start**

In `handleStartGame`, write one `game_lineups` row per slot through the existing offline-first lineup path, so the rows sync via `lineup-sync.ts` and work with no network. Reuse `prepareLineupRow` rather than writing WatermelonDB records directly.

- [ ] **Step 3: Keep the GAME_START payload backward compatible**

Continue setting `homeLeadoffBatterId` / `awayLeadoffBatterId` in the `GAME_START` payload, derived as slot 1 of the order. `deriveGameState` reads it (`packages/shared/src/utils/game-state.ts:109`) and games recorded before this change still depend on it.

- [ ] **Step 4: Verify the rail populates**

Start a game on the simulator with a 9-deep order, then check:

```sql
select batting_order, player_id from game_lineups where game_id = '<dev game id>' order by batting_order;
```

Expected: 9 rows. On screen, the order rail shows all nine, "No batting order set" is gone, and "Up next" advances correctly through a full turn without any "+ Batter" tap.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(tabs)/games/[gameId]/score.tsx"
git commit -m "fix(mobile): lineup wizard writes a real batting order"
```

---

## Task 12: Strike-zone grid layout

**Files:**
- Modify: `apps/mobile/src/features/scoring/PitchInput.tsx:402-450`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Reproduce**

With pitch type and pitch location both enabled, start a game. The `ScrollView` at `PitchInput.tsx:408` has `style={{ flexShrink: 1 }}`; once the pitch-count strip appears the pane shrinks and the grid's third row scrolls out of view with no affordance, reading as a complete two-column grid.

- [ ] **Step 2: Give the pane a real height budget**

The grid is 3 × 48pt cells plus borders ≈ 150pt, and the pitch-type row wraps to ~2 rows ≈ 80pt. Give the modifiers `ScrollView` a `minHeight` sufficient for both, and let the outcome buttons below keep `mt-auto`. If the iPad landscape pane genuinely cannot fit both, make the scroll affordance explicit (`persistentScrollbar`, or a visible fade) rather than leaving a grid that looks whole.

- [ ] **Step 3: Verify at both sizes**

iPad landscape: all nine zones visible without scrolling, pitch-type row still visible. Phone portrait: nothing clipped in a way that looks complete. Check both by tapping zone 7 and confirming the recorded `zoneLocation` is 7:

```sql
select payload->>'zoneLocation' from game_events
where game_id = '<dev game id>' and event_type = 'pitch_thrown'
order by sequence_number desc limit 1;
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/features/scoring/PitchInput.tsx
git commit -m "fix(mobile): stop clipping the bottom row of the strike-zone grid"
```

---

## Task 13: Full-game regression pass

**Files:**
- Modify: none expected

**Interfaces:**
- Consumes: everything above
- Produces: a verified build

- [ ] **Step 1: Run every check**

```bash
pnpm lint && pnpm type-check && pnpm test
```

Expected: green. Shared should report 476 + ~20 new; mobile should report its new tests.

- [ ] **Step 2: Score a complete game on the simulator against dev**

Full flow: create the game on web, set the lineup in the wizard, score at least three innings including a double with runners on, a sacrifice attempt at 0 and at 2 outs, a fielder's choice, a pitching change, and an undo of a play from an earlier inning. Then End Game.

- [ ] **Step 3: Verify the log**

```sql
select event_type, count(*) from game_events where game_id = '<dev game id>' group by event_type order by 2 desc;
select status, completed_at, home_score, away_score from games where id = '<dev game id>';
```

Expected: `pitch_thrown` ≥ the number of plate appearances plus taken pitches; `games.status = 'completed'` with `completed_at` set; the score matching what the app displayed.

- [ ] **Step 4: Confirm the pitch count is believable**

Compare the app's displayed pitch total against a hand count of the plays you scored. They must match exactly.

- [ ] **Step 5: Stop before pushing**

**Do not `git push` and do not open a PR.** Both are outward-facing actions reserved for the repository owner and are handled outside this plan. Leave the branch local and report that it is ready to push.

- [ ] **Step 6: Report readiness**

Summarise in your report: the full check output from Step 1, the event counts from Step 3, and the hand-count comparison from Step 4. The `coderabbit review` required by CLAUDE.md runs after the owner opens the PR.

---

## Self-Review

**Spec coverage.** Workstream 1 → Tasks 2–7 (rules seam, sacrifice, pitch counting) plus Task 5 for the doc root cause. Workstream 2 → Task 8, with the RPC question settled and deferred, and reasons given. Workstream 3 → Tasks 9–10. Workstream 4 → Task 11. Workstream 5 → Task 12. Workstream 6 → Task 1 (harness, typecheck) with the `score.tsx` split folded into Tasks 3, 7, 9, 10, 11 as the spec requires. Spec open question #1 (non-prod target) → Task 0. Medium parity gaps (rundown, advance reasons, RBI/ER) are correctly absent — they are listed in the spec as findings but are not in its workstreams.

**Corrections made while writing.** The spec's sac-fly trajectory clause named `pop_up`, which is not a `HitTrajectory` value; the plan uses `FLY_BALL | LINE_DRIVE`, and notes that `popout` maps to `FLY_BALL`. The spec implied HBP needed a pitch event added; it does not — the in-play sheet's HBP routes through `handlePitchOutcome`, which already emits one, so HBP is excluded from `IN_PLAY_TERMINAL_EVENTS`.

**Type consistency.** `sacrificeEligibility` returns `{ sacFly, sacBunt }` in Task 2 and is destructured under those names in Tasks 3 and 4. `requiresPitchEvent(terminal: EventType): boolean` is defined in Task 6 and called with that signature in Task 7. `PlayFeedRow.eventId` defined in Task 9 is consumed by `voidEvent(eventId)` in Task 10. `isFinalizeConfigured()` is defined and used within Task 8.

**Known soft spot.** Task 7 Step 4 lists prop names following the `onRecord*` convention, but only seven of the twelve are confirmed present in `PitchInput.tsx`; the step instructs the implementer to read the actual call site and match exactly rather than trust the list. Task 9 Step 1 is conditional on whether the web formatter is pure, with both branches specified.
