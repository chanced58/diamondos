# iOS Phase 3 — UI and Scorekeeping Shakedown

**Date:** 2026-09-19
**Branch:** `claude/ios-phase-3-ui-scorekeeping-c1f158`
**Status:** Design — awaiting review

---

## Goal

Phase 1 made the iOS app build and sync. Phase 2 ([#207](https://github.com/chanced58/diamondos/pull/207)) made its scoring output *correct*. Phase 3 makes the app **usable end to end** — every tab, driven by hand in the simulator, with every defect found fixed in this branch.

The instrument is different from phase 2. Phase 2 was two code audits plus one confirming shakedown game. Phase 3 inverts that: **the primary mechanism is operating the app in the iOS Simulator**, with code reading in support of what the screen shows. Static analysis finds wrong rules; only driving the app finds a tap target under a safe-area inset, a modal that cannot be dismissed, an empty state that reads as a failure, or a keyboard that covers the field it is typing into.

**Done means:** a coach can open the app cold, walk every tab, score a full game, and never hit a screen that blocks them, lies to them, or records the wrong thing.

---

## Approach considered

**A. Static parity audit (phase 2's method).** Diff mobile against web route by route, fix the divergences. Rejected as the primary method: it cannot see layout, focus, gesture, or timing defects, which is most of what "troubleshooting the UI" means. Retained as a *secondary* check once a finding is on the screen — web is still the reference for behaviour.

**B. Hands-on simulator sweep with a findings ledger (recommended, chosen).** Drive all 13 routes on one device against real prod data, record every defect in a versioned ledger with a repro and evidence, then fix them in severity order with a test per fix. Slower per finding, but it is the only method that sees what a coach sees, and the ledger makes "fix everything found" a checkable claim rather than a feeling.

**C. Instrument-and-replay (automated UI tests first).** Stand up Detox/Maestro, encode the golden paths, let the suite find regressions. Rejected for *this* phase: it prices in a large harness before finding a single bug, and an automated runner asserts what you told it to assert — it would have passed every phase 2 defect. Worth revisiting once the app is stable.

---

## Method

### Device and data

**One device: iPad Pro 11-inch (M5), iOS 26.5.** Already booted. It is the game-day scorekeeping form factor and the device phase 2 was verified on, so findings are comparable across phases. iPad mini and iPhone are explicitly **not** in this sweep — phone-width layout is a separate problem with its own findings cluster, and mixing it in would double the ledger without doubling the value. Both orientations of the iPad *are* in scope; orientation is a layout dimension, not a second device.

**Data: `diamondos-prod`, under the shakedown protocol** established in phase 2 and reaffirmed here (see Assumptions). Every row the sweep creates is synthetic, identifiable, and deleted when the pass completes:

- games carry an `opponent_name` beginning with `SHAKEDOWN`
- the game id is recorded before any event is scored
- teardown deletes the created game and its `game_events`, and nothing else
- **no row the pass did not create is modified or deleted**

`game_events` is append-only by design, so corrections during the sweep are made by voiding and re-recording, never by mutation — the same discipline the app itself enforces.

### The two passes

**Pass A — cold walk (structural).** No game in progress. Every route, in both orientations, checking the things that have nothing to do with baseball:

- first paint: does it load, and does a slow load look like loading or like breakage
- empty state: a team with no games, no messages, no practices — does absence read as absence or as an error
- error state: airplane mode on, then off — does the app recover, and does it say what is wrong
- layout: safe-area insets, clipping, content reachable without a scroll that hides something else (the phase 2 H2 class of bug)
- text scaling: largest accessible Dynamic Type size — what breaks
- dark mode, if the app claims to support it
- tap targets: anything smaller than 44pt, anything overlapping
- keyboard: does it cover the input it is serving; is there a way to dismiss it
- navigation: back out of every screen; can any screen trap you
- role gating: what a non-coach sees, since RLS is the real boundary and the UI gate is cosmetic

**Pass B — hot walk (scorekeeping).** One full `SHAKEDOWN` game, scored by hand start to finish: create the game, run the lineup wizard, score at least two full innings each way, exercise every in-play path the UI offers (hit, out, error, fielder's choice, sacrifice, HBP, double play, courtesy runner, guest player, runner outcome, hit location), use the play feed to void and re-record a play from an earlier inning, then End Game and confirm finalize.

The hot walk checks two things at once: **does the interaction work**, and **is the resulting row correct**. Every scoring finding is verified against the actual `game_events` / `games` rows via Supabase MCP before it enters the ledger — the same standard phase 2 held, which is what made its findings actionable. A UI complaint with no row behind it is still a valid finding; a correctness claim without a row is not.

### Route inventory

All 13, swept in this order (sign-in first because everything depends on it, scoring last because it depends on everything):

| # | Route | Pass |
|---|-------|------|
| 1 | `(auth)/sign-in` | A |
| 2 | `(tabs)/index` — home | A |
| 3 | `(tabs)/schedule` | A |
| 4 | `(tabs)/games/index` | A |
| 5 | `(tabs)/roster/index` | A |
| 6 | `(tabs)/messages/index` | A |
| 7 | `(tabs)/messages/[channelId]` | A |
| 8 | `(tabs)/practices/index` | A |
| 9 | `(tabs)/practices/[practiceId]/card` | A |
| 10 | `(tabs)/practices/[practiceId]/attendance` | A |
| 11 | `(tabs)/games/[gameId]/attendance` | A |
| 12 | `(tabs)/games/[gameId]/lineup` | A + B |
| 13 | `(tabs)/games/[gameId]/score` | B |

Note there is no mobile game-*detail* route — web has one, mobile jumps straight from the games list into score/lineup/attendance. Whether that is a gap is itself a Pass A question.

---

## The findings ledger

Findings live in `docs/superpowers/specs/2026-09-19-ios-phase-3-findings.md`, committed and updated as the sweep runs. One row per finding:

```
### <ID>. <one-line symptom>
**Route:** <route>  **Severity:** <S|H|M>  **Status:** open | fixed | won't fix
**Repro:** numbered steps from a cold launch
**Observed / Expected:** what the screen or the row actually did, and what it should do
**Evidence:** screenshot path, accessibility-tree excerpt, or the offending DB row
**Cause:** file:line, once known
```

IDs are `S1`, `H1`, `M1`… matching phase 2's scheme so the two documents read as one series.

### Severity ladder

- **Severe (S)** — the app records something wrong, loses data, or cannot complete a game. Phase 2's S1 (pitch count omitted in-play balls) and S2 (games never finalized) are the calibration points.
- **High (H)** — a coach is blocked from a task, or is actively misled, but no data is corrupted. Phase 2's H2 (clipped strike-zone grid that reads as complete) is the calibration point: the bug was cosmetic, the consequence was a scorer who never learns zones 7-9 exist.
- **Medium (M)** — friction, inconsistency, or a parity gap with web that a coach can work around.

### The defect bar

A finding enters the ledger only if it meets one of three tests:

1. it produces a **wrong or missing record**
2. it **blocks** a task a coach needs to do on game day
3. it **misleads** — the screen asserts something untrue, or a partial state reads as complete

Everything else is a redesign preference, and preferences are out of scope. This bar is what makes "fix everything found" a bounded commitment rather than an open one. Visual-polish observations that fail all three tests are not logged, not fixed, and not carried as debt.

---

## Fix loop

Per finding, in severity order (all S, then all H, then all M):

1. **Reproduce** in the simulator and capture evidence.
2. **Locate** the cause and decide where the fix belongs. If the defect is a *rule*, it belongs in `packages/shared/src/rules/` behind the seam phase 2 built — not in a mobile JSX conditional. The seam exists precisely so the next rule does not diverge; re-opening it is a regression.
3. **Write the failing test first**, per the project's TDD discipline. Rules get unit tests in `@baseball/shared`; event emission and component behaviour get tests under `apps/mobile`.
4. **Fix**, and confirm the test goes green.
5. **Verify in the simulator** — the same repro, now passing. For scoring findings, confirm the DB row too.
6. **Commit**, one commit per finding, Conventional Commits, scope naming the surface: `fix(mobile): …`.
7. **Update the ledger** row to `fixed`.

Commit-per-finding is deliberate. A whole-app sweep produces a large PR, and the only thing that keeps it reviewable is that each commit is one symptom, one cause, one fix, one test.

### Structural work, carried not deferred

`score.tsx` (3,430 lines) and `PitchInput.tsx` (1,843) are where most of this phase's edits land. Phase 2 planned to decompose them incrementally and they grew instead, so this phase treats decomposition as a **precondition of each fix, not a follow-up**: when a fix touches a region of either file, that region is extracted into `features/scoring/` first, then fixed. No big-bang refactor, no fix left in place because the file was too large to edit safely.

Target shape is unchanged from phase 2: `score.tsx` as composition only, panes and sheets and hooks in `features/scoring/`.

---

## Testing strategy

- **Rules** — unit tests in `@baseball/shared` (50 test files today), one per rule, covering boundaries. This is where correctness lives.
- **Event emission** — mobile tests asserting exact event sequence and payload for each scoring path touched.
- **Component behaviour** — React Native Testing Library tests for the specific defect: that all nine zones render, that the modal dismisses, that the empty state renders empty rather than erroring. Mobile has 17 test files today; every fix adds one.
- **Manual** — the Pass B shakedown game, re-run in full once all Severe and High fixes have landed, to confirm the fixes compose and none reintroduced another.

Gates that must be green before the PR: `pnpm test`, `pnpm type-check`, `pnpm lint`.

---

## Exit criteria

1. All 13 routes swept in both orientations, ledger complete.
2. Every ledger finding at `fixed` — or, for anything judged out of bounds after the fact, explicitly renegotiated with the owner rather than silently dropped.
3. A clean full shakedown game: created, scored both ways, a play voided and re-recorded, ended, `games.status = completed` with `completed_at` set, and the line score matching what was tapped.
4. All synthetic prod rows deleted; a query confirming zero remaining `SHAKEDOWN%` games.
5. `pnpm test`, `pnpm type-check`, `pnpm lint` green.
6. CodeRabbit review run and its findings addressed, per CLAUDE.md.

---

## Risks

**PR size.** A 13-route sweep with fix-everything scope will produce a large PR. Mitigations: commit-per-finding, the defect bar, and severity-ordered work so that if the branch has to be split, the split falls on a severity boundary and the Severe/High half can merge alone.

**Ledger overrun.** If the sweep exceeds ~25 findings, the phase stops and the ledger goes to the owner for prioritisation before fixing continues. Discovering that the scope was larger than expected is information, not a reason to quietly narrow.

**Prod writes.** The shakedown protocol bounds but does not eliminate the risk of writing to the only live environment. Teardown is verified by query, not by assumption, and no destructive operation runs against a row the sweep did not create.

---

## Assumptions and open questions

1. **Verification target — decided: production, under protocol.** Unchanged from phase 2. `diamondos-dev` is empty rather than stale and Supabase branching requires a paid plan, so `diamondos-prod` is the only environment this project uses. Confirmed again for this phase by the owner.
2. **One device — decided: iPad Pro 11-inch only.** iPhone and iPad mini are out of scope for phase 3. Phone-width scoring is likely its own phase.
3. **Fix scope — decided: everything the sweep finds**, bounded by the defect bar above, with a ledger-overrun escape hatch back to the owner.
4. **Open: does dark mode count?** If the app has no dark-mode support today, absent support is a feature request, not a defect, and drops out of scope. If it half-supports it, half-support is a *misleading* state and is in scope. Resolved by observation during Pass A.
5. **Open: role gating coverage.** Pass A checks what a non-coach sees, but the sweep runs on one signed-in account. Testing a second role means a second prod account; whether that is worth it is a decision for the plan.
