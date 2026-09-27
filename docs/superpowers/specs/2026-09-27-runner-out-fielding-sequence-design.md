# Runner Thrown Out — Putout Sequence Capture (Mobile) — Design

**Date:** 2026-09-27
**Branch:** `claude/ipad-scorekeeping-testing-3c4ca9`
**Status:** Implemented

## Problem

Found during the iPad scorekeeping test session. When the scorer marks a
runner thrown out on the basepaths during a ball in play, the app records the
out but never asks who made the play. The resulting `BASERUNNER_OUT` has no
`fieldingSequence`, so there is no record of the relay (e.g. 8-6-2), and no
fielder is credited with the putout or assists.

The coach asked for a pop-up to enter the order of the putout whenever a
runner is indicated as thrown out on a ball in play.

## Decisions already made

| Question | Decision |
|---|---|
| Which entry points | **Both**: the per-runner **Thrown out** choice in the hit's runner-outcome prompt, and the standalone **Runner Thrown Out** sheet |
| Which picker | **Approach A** — reuse `ThrowSequenceModal` (the existing "tap each fielder in order" sheet shown after batted outs), not the caught-stealing picker (its presets are keyed to the stolen base, and a runner out on a hit can be out at 2B, 3B or home, which the event doesn't record) and not inline buttons in the runner prompt |
| Required? | No. **Done** with nothing tapped records the out without a sequence. The play is never blocked |

## Current state (what exists)

- `BaserunnerMovePayload.fieldingSequence?: number[]` already exists
  (`packages/shared/src/types/game-event.ts`). No schema or migration change.
- `ThrowSequenceModal` (`apps/mobile/src/features/scoring/ThrowSequenceModal.tsx`)
  takes `visible`, `firstFielder`, `onDone(sequence)`; has a position pad,
  Undo, Done; title is hard-coded "Where was it thrown?".
- Hit path: `PitchInput.handleHitTap` → runner-outcome prompt
  (`RunnerOutcome` choices `auto | held | advanced | thrown_out`) →
  `confirmHitWithRunners` → `commitInPlay` → `onRecordHitWithRunnerOutcomes`
  → `score.tsx handleHitWithRunnerOutcomes`, which writes the `HIT` and then a
  linked `BASERUNNER_OUT` (`relatedEventId`, `reason: ON_PLAY`) per thrown-out
  runner. The batted ball captured by `FieldLocationModal` (incl.
  `firstFielder`) is held in `battedBallRef` until `commitInPlay`.
- Standalone path: **Runner Thrown Out** sheet → `handleRunnerOutPick` →
  `onRecordRunnerOut(runnerId, fromBase)` → `score.tsx handleRunnerOut`,
  which writes a `BASERUNNER_OUT`.
- `fielding-stats.ts` credits `fieldingSequence` (last = PO, rest = A) for
  `OUT`, `DROPPED_THIRD_STRIKE`, `CAUGHT_STEALING`, `DOUBLE_PLAY`,
  `TRIPLE_PLAY`, `SACRIFICE_FLY/BUNT` — **not** `BASERUNNER_OUT`.
- Play feed: a linked out renders "Alice thrown out advancing"
  (`use-play-feed.ts describeLinkedOutcome`); a standalone out renders
  "Alice out on the basepaths" (`format-event.ts`).

## Design

### 1. `ThrowSequenceModal` — optional title, subtitle, unlocked first fielder

Add optional `title` and `subtitle` props (defaults are today's strings) and
`lockFirstFielder` (default `true`). The batted-out throw step is unchanged:
its Undo never removes the first fielder, which came from the field pop-up.
The runner-out step passes `lockFirstFielder={false}` because its first
fielder is only a guess from the batted ball (or absent) — without this the
prefill, or the scorer's own first tap, could not be undone.
An unlocked prefill is a *suggestion*, shown gray: it is returned only once
the scorer taps a fielder or Undo. Done on an untouched suggestion returns
`[]`, so skipping never credits the fielder of the hit with an unassisted
putout (CodeRabbit finding). An unassisted tag by that fielder is still one
Undo + tap away.

### 2. Hit with a runner thrown out (`PitchInput`)

- `RunnerOutcome`'s `thrown_out` variant gains
  `fieldingSequence?: number[]`.
- `confirmHitWithRunners`, instead of recording immediately when any runner
  is `thrown_out`, builds a queue of those runners (in base order, lead
  runner first) and opens `ThrowSequenceModal` for the head of the queue:
  - Title: "Runner on {1st|2nd|3rd} thrown out — who made the play?" (the
    runner prompt identifies runners by base; `PitchInput` has no names).
  - Subtitle: "Tap each fielder in order. Not sure? Just tap Done."
  - `firstFielder`: the batted ball's `firstFielder` from `battedBallRef`
    (e.g. the CF who fielded the double → sequence opens at `8`); `null` when
    hit location was skipped or disabled.
- Each **Done** stores the sequence on that runner's outcome (omitted when
  empty) and advances the queue. When the queue is empty, the existing
  `commitInPlay(EventType.HIT, () => onRecordHitWithRunnerOutcomes(...))`
  runs with the enriched outcomes. Nothing is written until every thrown-out
  runner has been through the popup, so a play is never half-recorded.
- The popup has no cancel: the hit was already confirmed. The Android
  back / `onRequestClose` path behaves as Done (the modal's current
  behavior).
- Hits with no thrown-out runner are unchanged — no extra popup.

### 3. Standalone Runner Thrown Out sheet (`PitchInput`)

- `handleRunnerOutPick` closes the sheet and opens `ThrowSequenceModal` for
  that runner (same title/subtitle; `firstFielder: null` — there is no batted
  ball to seed from).
- **Done** calls `onRecordRunnerOut(runnerId, fromBase, fieldingSequence)`.
- Prop signature: `onRecordRunnerOut: (runnerId, fromBase, fieldingSequence: number[]) => void`.

### 4. Recording (`score.tsx`)

- `handleHitWithRunnerOutcomes`: the linked `BASERUNNER_OUT` payload spreads
  `...(outcome.fieldingSequence?.length ? { fieldingSequence } : {})`.
- `handleRunnerOut(runnerId, fromBase, fieldingSequence)`: same spread.
- Absent, never empty, when skipped — matching `recordCaughtStealing`, where
  an absent sequence means "not recorded".

### 5. Fielding stats (`packages/shared/src/utils/fielding-stats.ts`)

- Add `BASERUNNER_OUT` → `creditFieldingSequence(fieldingSequence, 1)`,
  inside the existing "we are fielding" gate. 8-6-2 credits C with the PO and
  CF + SS with assists.
- No sequence → no credit (same as sacrifice outs).
- No double counting: the parent `HIT`'s batted-ball `fieldingSequence` is not
  credited by fielding-stats (hits earn no putouts), so the relay is counted
  once, on the `BASERUNNER_OUT`.
- Update the file's header comment listing which events credit a sequence.

### 6. Play feed

- Linked (hit) out: "Alice thrown out advancing, 8-6-2" — append
  `formatFieldingSequence(seq)` in `describeLinkedOutcome` when present, so
  the parent row reads "Double (Alice thrown out advancing, 8-6-2)".
- Standalone out: "Alice out on the basepaths (8-6-2)" in `format-event.ts`
  when present. This shared formatter is also used by web, where the change
  only adds detail to events that carry a sequence.
- Unchanged wording when no sequence.

## Edge cases

| Case | Behavior |
|---|---|
| Two runners thrown out on one hit | Two popups, lead runner first; one write after both |
| Hit location skipped / tracking off | Popup opens empty (no prefill) |
| Prefilled fielder is wrong | Undo clears it (unlocked first fielder); tap the real chain |
| Scorer taps Done immediately (even with a prefill) | Out recorded with no `fieldingSequence` |
| Undo (void) of the hit afterward | Unchanged — linked outs are already voided with the parent (`void-event.ts`) |
| We are batting (opponent fielding) | Sequence recorded; fielding-stats ignores it (not our defensive half) |
| Home run | No runner prompt today, so no popup |

## Testing (written first)

- **Shared `fielding-stats`**: `BASERUNNER_OUT` with `[8, 6, 2]` in our
  defensive half → PO to the catcher, A to CF and SS; no sequence → no
  credit; our offensive half → no credit.
- **Shared `format-event`**: standalone out with and without a sequence.
- **Mobile `use-play-feed`**: linked out clause with and without a sequence.
- **Mobile `ThrowSequenceModal`**: custom title/subtitle render; defaults
  unchanged.
- **Mobile `PitchInput`** (component tests, existing
  `pitch-input-*.test.tsx` style):
  - hit with one thrown-out runner opens the popup once, prefilled with the
    batted-ball fielder, and `onRecordHitWithRunnerOutcomes` receives the
    sequence on that outcome;
  - two thrown-out runners → two popups in lead-runner order, one record call;
  - Done with nothing tapped → outcome has no `fieldingSequence`;
  - hit with no thrown-out runner → no popup;
  - standalone sheet → popup (no prefill) → `onRecordRunnerOut` receives the
    sequence.

## Out of scope

- Web ScoringBoard runner-out UI (records runner outs through its own flow).
- Recording which base the runner was out at.
- Presets for common relays.
