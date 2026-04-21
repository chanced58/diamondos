# Editable Runner + Between-Pitch Events in GameHistoryTree

**Status:** draft — 2026-04-20
**Area:** `apps/web` post-game editor

## Problem

When a coach edits a game in the web GameHistoryTree UI, the per-event
edit pencil and the "Add Play" button only surface pitch-related and
plate-appearance-outcome events. Any runner or between-pitch event
(stolen base, caught stealing, baserunner advance, pickoff, rundown,
balk, substitution, pitching change, catcher interference, explicit
score) renders read-only with no edit control, and there is no way to
add one after the fact.

The backend is already permissive: `replaceEventAction`
(`apps/web/src/app/(app)/games/[gameId]/actions.ts:994`) validates the
submitted `eventType` against the full `EventType` enum and accepts
any valid type. The gap is entirely in
`apps/web/src/components/game/GameHistoryTree.tsx`:

- `EDITABLE_EVENT_TYPES` (line 498) omits runner and substitution
  events.
- `ReplaceEventPanel` has no branches for runner payload shapes
  (`BaserunnerMovePayload`, `PickoffPayload`, `SubstitutionPayload`,
  etc.).
- `AddEventPanel` only emits PA-outcome events; no entry point for
  adding a runner action between pitches.

## Scope

**In scope (this spec):**

- Editing **existing** runner/between-pitch events in the history
  tree. The runner identity (`runnerId`) is held fixed; the edit
  scope is correcting the **reason / base / outcome** of the event
  the coach already entered.
- Adding a new runner/between-pitch event at a specific history
  position (mid-at-bat or interstitial).
- Event types covered: `stolen_base`, `caught_stealing`,
  `baserunner_advance`, `baserunner_out`, `pickoff_attempt`,
  `rundown`, `balk`, `score`, `substitution`, `pitching_change`,
  `catcher_interference`.

**Out of scope:**

- Reassigning which runner the event applies to. If the coach got
  the runner wrong, they delete and re-add.
- Mobile-side changes. The mobile surface is live-scoring; it
  already exposes these actions via `BaserunnerDisplay` and the
  standalone WP/PB/balk/DP/TP/sub buttons.
- Any schema/migration work. Payloads and the `EventType` enum
  already support every field we need.

## Design

### Extend `EDITABLE_EVENT_TYPES`

Add every in-scope event type to the existing set. That alone lights
up the edit pencil for every row that currently renders read-only;
tapping it opens `ReplaceEventPanel`, which needs new branches.

### Add branches to `ReplaceEventPanel`

`ReplaceEventPanel` already reads `originalEvent` and extracts
batter/pitcher IDs. For runner events it will additionally extract
the existing `runnerId`, `fromBase`, `toBase`, `reason`, `errorBy`,
and similar fields from the original payload and re-submit a
corrected payload with the same `runnerId` preserved.

UI branches by `originalEvent.eventType`:

| Event type | Fields coach can edit |
|---|---|
| `stolen_base`, `caught_stealing` | `fromBase` (1/2/3), `toBase` derived = fromBase+1 |
| `baserunner_advance` | `fromBase`, `toBase`, `reason` (overthrow / error / wild_pitch / passed_ball / balk / voluntary / on_play), `errorBy` when reason is error |
| `baserunner_out` | `fromBase` only |
| `pickoff_attempt` | `base`, `outcome` (safe / out), `fieldingSequence` |
| `rundown` | `outcome` (safe / out) + `safeAtBase` when safe |
| `balk` | no editable fields — delete + re-add if the balk needs to move |
| `score` | `rbis` (OBR 9.04(b) judgment call override) |
| `substitution` | `substitutionType`, `newPosition`, `battingOrderPosition` |
| `pitching_change` | no editable fields — incoming pitcher changes are rare enough that re-add is fine |
| `catcher_interference` | no editable fields (PA-level event with only batter/pitcher IDs) |

Each branch renders a small set of buttons/toggles scoped to the
fields above and calls the existing `submitReplacement(eventType,
payload)` helper with the merged payload.

### Add a "+ Runner Event" picker

A second panel, `AddRunnerEventPanel`, analogous to the existing
`AddEventPanel` but for runner/between-pitch events. It accepts an
`insertAfterSequence` so the new event lands at the right history
position:

- Inside an at-bat, it appears in the mid-at-bat event block with
  `insertAfterSequence = <last pitch's sequenceNumber>`.
- Between at-bats, it appears in the interstitial slot with
  `insertAfterSequence = <previous at-bat's last sequenceNumber>`.

Picker flow:

1. **Pick runner** — the list is `gameState.runnersOnBase` at the
   insertion point, derived from replaying events up through
   `insertAfterSequence`. If no runners are on base, the picker
   falls back to a generic "what happened" picker (balk,
   pitching change, substitution, catcher interference, score).
2. **Pick action** — one of: steal / CS / advance (+reason) /
   pickoff / balk / CI.
3. **Emit event** via `insertCorrectionEventAction` with
   `insertAfterSequence` already in the payload (same pattern the
   existing add-flow uses).

### Delete behavior

Unchanged. `voidEventAction` already works for every event type;
the per-row ✕ button already appears on pitches. This spec extends
the same ✕ affordance to interstitial and mid-at-bat rows.

## Data flow

Edit / add / delete all go through the existing server actions:

- `replaceEventAction` — void + insert-new-with-
  `insertAfterSequence = targetEvent.sequence_number - 1`
- `insertCorrectionEventAction` — append a new event with a
  specific `insertAfterSequence`
- `voidEventAction` — append an `event_voided` row targeting the
  event's id

The replay filter (`applyCorrections` /
`packages/shared/src/utils/event-filters.ts`) already interprets
`insertAfterSequence` and `event_voided`, so downstream state
(`deriveGameState`, stats modules, MaxPreps export) automatically
reflects the corrections without any backend changes.

## Testing plan

Code-level check:

- `pnpm --filter web type-check` must stay clean.
- `pnpm --filter @baseball/shared type-check` must stay clean.
- Mobile type-check error count must not increase (baseline
  ~234 pre-existing NativeWind / WDB noise).

Manual walkthrough in the web app (after `pnpm dev:web`):

1. Open a completed game → history tree.
2. On a stolen base row, click the edit pencil → change fromBase
   → verify stats update.
3. On a baserunner-advance row, change reason from WILD_PITCH to
   ERROR with an errorBy fielder → verify ERA / earned-run
   classification shifts for that runner.
4. Between two at-bats, click "+ Runner Event" → steal a base →
   verify it lands in the interstitial slot at the right
   sequence number and stats update.
5. Delete a newly-added event → verify it disappears from the
   tree and stats roll back.

End-to-end validation: pick a representative game and compare the
post-edit `game_events` rows + derived state against a hand-kept
scorebook.

## Files touched

Primary:

- `apps/web/src/components/game/GameHistoryTree.tsx` — extend
  `EDITABLE_EVENT_TYPES`, add runner branches to
  `ReplaceEventPanel`, add `AddRunnerEventPanel`, wire the new
  buttons into `InterstitialRow`, `MidAtBatRow`, and the at-bat
  rendering loop.

No changes required in:

- `apps/web/src/app/(app)/games/[gameId]/actions.ts` — already
  accepts any EventType.
- `packages/shared/src/utils/event-filters.ts` — correction
  filter already covers `EVENT_VOIDED` and `insertAfterSequence`.
- `packages/shared/src/utils/game-history.ts` — tree builder
  already slots runner events into mid-at-bat / interstitial
  buckets.
- Mobile — unchanged.
