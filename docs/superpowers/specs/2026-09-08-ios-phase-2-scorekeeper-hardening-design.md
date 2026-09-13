# iOS Phase 2 — Scorekeeper Hardening

**Date:** 2026-09-08
**Branch:** `claude/ios-app-phase-2-cbd758`
**Status:** Design — awaiting review

---

## Goal

After phase 1 ([#206](https://github.com/chanced58/diamondos/pull/206)) the iOS app builds, signs in, syncs offline-first, and is a usable iPad scorekeeper. Phase 2 makes it **trustworthy**: a coach can score a full season on it unsupervised and the output is correct.

This phase is narrow and deep. It adds no new pillars — no messaging, practices, roster management, or parent-facing features.

**Done means:** every pitch a coach taps produces a correct, reviewable, correctable record; the game finalizes; and the rules the app enforces are the same rules on both clients.

---

## What the audit found

Two code audits (rules-doc and web-parity) plus a live shakedown on an iPad Pro simulator against `diamondos-prod`. The shakedown scored a synthetic game — lineup wizard, a half-inning of opponent batting, a half-inning of ours, End Game — and every claim below was verified against the resulting rows before the game was deleted.

### Severe — the output is wrong or unusable

**S1. Pitch count omits every ball put in play.**
Mobile emits `PITCH_THROWN` only from the Ball / Called / Foul / Swinging buttons ([score.tsx:846](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>), :860). Web emits one with `outcome: 'in_play'` ahead of every in-play result ([ScoringBoard.tsx:1215](<../../../apps/web/src/app/(app)/games/[gameId]/score/ScoringBoard.tsx>), :1362, :1401, :1435).

Verified in prod: the shakedown put 4 balls in play (1 hit, 3 outs) and produced **zero** additional pitch events — 3 recorded against ≥7 actual. The error is always in the same direction (under).

This is the app's regulatory pillar. `getPitchComplianceStatus` counts only `PITCH_THROWN` ([pitch-count.ts:13](../../../packages/shared/src/utils/pitch-count.ts)), so NFHS / Little League limits are enforced against a number that is structurally too low. It also corrupts strike %, pitches-per-PA, and QAB detection ([batting-stats.ts:349](../../../packages/shared/src/utils/batting-stats.ts)).

**S2. Games can never be finalized.**
`EXPO_PUBLIC_API_BASE_URL` is not set in `apps/mobile/.env.local`, though CLAUDE.md documents it as required. The lifecycle reconciler logs `"cannot finalize game"` and `continue`s ([sync-engine.ts:800](<../../../apps/mobile/src/sync/sync-engine.ts>)), retrying every cycle forever.

Verified: after End Game, the `game_end` event synced, but `games.status` stayed `in_progress` and `completed_at` stayed `null`. Meanwhile the confirmation alert tells the coach *"The result finalizes automatically when the device is back online."*

Note the asymmetry: **starting** a game works, because it goes through the `fn_start_game` RPC and needs no web app. Only finalize depends on an HTTP round trip to Next.js.

**S3. Sacrifice rules are ungated on mobile.**
[PitchInput.tsx:523-524](<../../../apps/mobile/src/features/scoring/PitchInput.tsx>) renders Sac Fly and Sac Bunt unconditionally. Observed in the shakedown:

- both offered at **2 outs**
- Sac Fly offered on a **groundout** (its own copy says "Runner scored from 3rd on the catch")
- Sac Fly offered with the only runner on **2nd**, and again with **no runner on base**

Web has half the rule ([ScoringBoard.tsx:809](<../../../apps/web/src/app/(app)/games/[gameId]/score/ScoringBoard.tsx>)):

```ts
const sacFlyEligible =
  gameState.outs < 2 &&
  (!!gameState.runnersOnBase.second || !!gameState.runnersOnBase.third);
```

The other half — gating sac **bunt** on `outs < 2` — was written, committed, and **never merged**. It sits on `feat/sac-fly-scoring` as `eb8cfdb`, which also skips the "was this a sacrifice?" prompt entirely when neither option is eligible. Main still carries the pre-`eb8cfdb` comment asserting "Sac bunt stays unconditional."

Root cause worth fixing too: [docs/baseball-rules.md](../../baseball-rules.md) §9.08(a) omits OBR's explicit **"before two are out"** clause for the sacrifice bunt, and Appendix A.5 lists "fewer than 2 outs" only as a sac-*fly* common scenario. The doc gap is what let the code gap through.

**S4. No way to review or correct any play but the last.**
Mobile renders no play-by-play; `events` is used only to test whether the game started. Undo walks back one event within a 64-event window and explicitly declines un-undo ([score.tsx:1176-1230](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>)). A mis-tap in the 3rd noticed in the 6th cannot be seen, let alone fixed. Web has [history/page.tsx](<../../../apps/web/src/app/(app)/games/[gameId]/history/page.tsx>) and [format-event-ticker.ts](<../../../apps/web/src/lib/live/format-event-ticker.ts>).

### High — workflow blockers

**H1. The lineup wizard creates no batting order.**
Step 2 ("Who's batting first?") writes `homeLeadoffBatterId` into the `game_start` payload. `deriveGameState` consumes it ([game-state.ts:109](../../../packages/shared/src/utils/game-state.ts)), so batter #1 attributes correctly — verified: the double showed "ON BASE 2B #13 Griffin Baldwin".

But the order rail reads `game_lineups`, which had **zero rows**, so the screen says "No batting order set" and there is no #2 to advance to. From the second batter on, the coach types names in mid-game. Web inverts this correctly: it derives leadoff *from* the lineup ([actions.ts:283](<../../../apps/web/src/app/(app)/games/[gameId]/actions.ts>)).

**H2. The strike-zone grid is clipped.**
The modifiers pane is a `ScrollView` with `flexShrink: 1` ([PitchInput.tsx:408](<../../../apps/mobile/src/features/scoring/PitchInput.tsx>)). Before the game starts it shows all nine zones; once the pitch-count strip appears the pane shrinks and the bottom row scrolls out with no affordance. The clipped state reads as a *complete* two-column grid, so a scorer would never learn zones 7/8/9 exist — and scrolling to reach them pushes the pitch-type row out of view.

**H3. No game creation on mobile.**
There is no create-game UI; mobile only reads games through sync. Web has [games/new](<../../../apps/web/src/app/(app)/games/new/page.tsx>). A coach at the field with only an iPad cannot start a scrimmage or a makeup game.

### Medium — parity gaps
- `EventType.RUNDOWN` is unreachable on mobile (46 references in web's ScoringBoard, zero in mobile).
- Advance reasons: mobile offers `ERROR`, `ON_PLAY`, `WILD_PITCH`, `PASSED_BALL`; missing `OVERTHROW`, `BALK`, `VOLUNTARY`. An overthrow logged as a generic error changes error and earned-run attribution.
- RBI and earned runs are computed in shared and shown on web but never surfaced on mobile, so a coach cannot sanity-check the line they just scored.

### Structural
- **Zero test files under `apps/mobile`**, and no `test` script — against 476 in `@baseball/shared`.
- [score.tsx](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>) is 3,017 lines: ~1,960 of screen state and handlers, then 18 components.
- Housekeeping: pre-existing typecheck error at [practices/index.tsx:78](<../../../apps/mobile/app/(tabs)/practices/index.tsx>).

### Explicitly out of scope
Missing platform-wide (web too), each needing schema + shared + web + mobile: winning/losing pitcher, saves, DH, NFHS starter re-entry, infield fly, obstruction/interference calls, forfeit and suspended games, batters faced, inherited runners. Separate phase.

---

## The organising idea

S1, S3 and H1 are the same defect wearing three hats: **scoring rules live inside web JSX conditionals, so mobile cannot inherit them.** Web knows a sac fly needs a runner in scoring position; mobile does not. Web knows an in-play result is a pitch; mobile does not. Web derives leadoff from the lineup; mobile invents its own path.

Fixing the three bugs individually leaves the seam open and the next rule will diverge the same way. So phase 2 introduces the seam first and fixes the bugs *through* it.

### Architecture: a rules seam in `@baseball/shared`

New module `packages/shared/src/rules/`, exporting pure functions over `GameState` + `LeagueScoringSettings`. No React, no I/O, no platform types — so both clients call the same code and it is testable in the existing 476-test suite.

```
packages/shared/src/rules/
├── sacrifice.ts      sacrificeEligibility(state) -> { sacFly: boolean, sacBunt: boolean }
├── pitch-events.ts   pitchEventFor(outcome, ctx) -> PitchThrownPayload | null
├── reached-base.ts   fieldersChoiceEligible(state), etc.
├── index.ts
└── __tests__/
```

Each function answers one question, takes state in and returns a decision out. Consumers render from the decision; neither client re-derives a rule.

Migration is incremental: add the function with tests, switch mobile to it, switch web to it, delete the inline conditional. Web's behaviour must not change except where it is provably wrong (the sac-bunt gate).

---

## Workstreams

Ordered by dependency. 1 unblocks 2–3; 6 runs throughout.

### 1. Rules seam + pitch counting + sacrifice eligibility

**Pitch counting (S1).** Add `pitchEventFor()` and emit `PITCH_THROWN` with `outcome: 'in_play'` from every mobile in-play path — hit, out, sac fly, sac bunt, error, fielder's choice, double/triple play, catcher's interference — plus `outcome: 'hit_by_pitch'` for HBP, matching web's shape exactly so the two clients write identical logs.

Ordering matters: the pitch event must be recorded *before* the outcome event, as web does, so replay sees the pitch first.

*Historical data is not backfilled.* Existing games keep their undercounted totals; a migration inferring pitches would be guesswork, and `game_events` is append-only. Call this out in the PR.

**Sacrifice eligibility (S3).** Port `eb8cfdb`'s logic into `sacrificeEligibility()`:

```
sacBunt: outs < 2                              // OBR 9.08(a) "before two are out"
sacFly:  outs < 2 && (runnerOn2nd || runnerOn3rd)   // OBR 9.08(b)
         && trajectory is fly_ball | line_drive | pop_up
```

The trajectory clause is new and fixes the groundout case. Both clients hide ineligible buttons; when neither is eligible, skip the sacrifice prompt entirely and record a regular out (also from `eb8cfdb`).

Update [docs/baseball-rules.md](../../baseball-rules.md) §9.08(a) to include "before two are out," and A.5 to list the out constraint for both columns.

**Acceptance:** a ball in play increments the pitch count on both clients; SF/SH are unavailable at 2 outs; SF is unavailable on a groundout or with nobody past 1st; `pnpm test` covers each rule directly.

### 2. Finalize (S2)

Set `EXPO_PUBLIC_API_BASE_URL` and document it in `.env.example`. Then make the failure mode honest, because a missing base URL will happen again:

- surface a persistent, visible "not finalized" state on the game rather than a `console.warn` no one sees
- stop promising "finalizes automatically when the device is back online" when the app has no endpoint configured — the alert copy must reflect actual capability
- bound the retry and report terminal failure

Worth evaluating: move finalize behind a Postgres RPC the way `fn_start_game` already works, removing mobile's dependency on the Next.js deployment entirely. That is the more robust shape and would delete this whole class of failure. Flagged as a decision for the plan, not settled here.

**Acceptance:** ending a game on mobile drives `games.status` to `completed` with `completed_at` set; a misconfigured build says so plainly on screen.

### 3. Review and correct (S4)

A play-by-play list on the scoring screen, newest first, rendering the derived event feed — reuse web's [format-event-ticker.ts](<../../../apps/web/src/lib/live/format-event-ticker.ts>) formatter, moving it to shared if needed.

From that list, void any event, not just the most recent, reusing the existing `EVENT_VOIDED` + cascade logic that Undo already implements ([score.tsx:1214-1230](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>)) so linked child events retire with their parent. Correction stays append-only: void and re-record, never mutate.

**Acceptance:** a coach can scroll the full game, find a play from three innings ago, void it, and see state and the line score recompute.

### 4. Lineup wizard writes a real lineup (H1)

Wizard step 2 becomes "set your batting order" and writes `game_lineups` rows through the existing offline-first lineup sync ([lineup-sync.ts](<../../../apps/mobile/src/sync/lineup-sync.ts>)), with leadoff derived from the order the way web does. Keep `homeLeadoffBatterId` in the `game_start` payload for backward compatibility with games already recorded.

Reuse the existing lineup screen ([lineup.tsx](<../../../apps/mobile/app/(tabs)/games/[gameId]/lineup.tsx>)) rather than building a second order editor.

**Acceptance:** completing the wizard leaves a populated order rail and a correct "Up next" through a full turn of the lineup, with no mid-game "+ Batter" required.

### 5. Strike-zone layout (H2)

Give the modifiers pane a real height budget so pitch type and all nine zones coexist once the pitch-count strip is present, or make the clipped state visibly scrollable. Verify on both iPad landscape and phone portrait.

**Acceptance:** all nine zones reachable without scrolling on iPad landscape; nothing renders as a complete-looking partial grid.

### 6. Tests and file structure (cross-cutting)

Stand up Jest + React Native Testing Library under `apps/mobile` with a `test` script wired into Turborepo.

The bulk of coverage should land in `@baseball/shared` — every rule from workstream 1 gets direct unit tests where the existing suite already runs. Mobile-side tests cover the event-emission paths: that an in-play tap writes both a `PITCH_THROWN` and its outcome, in order, with the right payload.

Split [score.tsx](<../../../apps/mobile/app/(tabs)/games/[gameId]/score.tsx>) **incrementally, as a side effect of workstreams 1–5** — extract what each change touches, not a big-bang refactor. Target shape: `score.tsx` as composition only, with `features/scoring/` holding the panes, sheets, and hooks. Its 18 embedded components move out first since they carry no screen state.

Fix the typecheck error at [practices/index.tsx:78](<../../../apps/mobile/app/(tabs)/practices/index.tsx>) so `pnpm type-check` is green and can gate CI.

---

## Testing strategy

- **Rules** — pure unit tests in `@baseball/shared`, one per rule, covering the boundaries (0/1/2 outs; each base state; each trajectory).
- **Event emission** — mobile unit tests asserting the exact event sequence and payloads for each in-play path.
- **Cross-client equivalence** — for each ported rule, a test asserting web and mobile derive the same decision from the same `GameState`. This is the test that keeps the seam closed.
- **Manual** — one full shakedown game per workstream, against `diamondos-prod` under the shakedown protocol (see assumption 1): a new game whose `opponent_name` begins with `SHAKEDOWN`, its id recorded before scoring, deleted with its events when the pass completes, and no row touched that the pass did not create.

---

## Assumptions and open questions

1. **Verification target — decided: production, under protocol.** This audit ran against `diamondos-prod` because `diamondos-dev` is paused. The original assumption was to restore dev for phase 2. Sizing it showed `diamondos-dev` is empty rather than stale (no public tables, no migration history), so restoring it means replaying every migration, and Supabase branching requires a paid plan. The owner decided to verify against production with discipline instead: manual verification uses the shakedown protocol described under Testing strategy. `diamondos-prod` is the only Supabase environment this project uses.
2. **Finalize transport** (workstream 2) — keep the HTTP call or move to an RPC. Recommendation is RPC; needs a decision.
3. **No pitch-count backfill** for existing games. Stated, not negotiated.
4. **`eb8cfdb` disposition** — cherry-pick into the shared rule rather than merging `feat/sac-fly-scoring`, since the logic is moving modules anyway. The branch can then be deleted.
5. Phase 2 does not touch web except where a rule moves to shared or is provably wrong.
