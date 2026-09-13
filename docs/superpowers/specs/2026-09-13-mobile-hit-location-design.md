# Mobile Hit Location Capture — Design

**Date:** 2026-09-13
**Branch:** `claude/ios-app-phase-2-cbd758`
**Status:** Revision 1 awaiting spec review (outcome-first, after the first device test)

## Problem

The mobile scorekeeper records what happened on a ball in play but not where
it went or who fielded it. Web already captures both: an inline tap-the-field
picker writes normalized `sprayX` / `sprayY`, and outs carry a
`fieldingSequence` of position numbers that fielding stats credit putouts and
assists from. A game scored on mobile has no spray data and no fielding stats.

The coach asked for a pop-up of the field that appears once a ball in play is
indicated, where the scorer marks where the ball went and which defensive
position caught, picked up, or first touched it.

## Decisions already made

| Question | Decision |
|---|---|
| What to record for outs | The first fielder, then the throw sequence (e.g. 6 → 3) — the same `fieldingSequence` web records, so putouts and assists credit correctly |
| When the pop-up appears | Controlled by a per-game "Hit location" tracking toggle; when on, every ball in play shows it, always with Skip |
| Order | **Revised:** outcome first, then field. The original order (field first) was reversed after the first device test — see Revision 1 below |
| Home runs | **Revised:** a home run records location only; no fielder is offered or recorded |

### Why the throw sequence, not just the first fielder

`fielding-stats.ts` credits the **last** position in `fieldingSequence` with
the putout and every earlier position with an assist, on OUT, DOUBLE_PLAY,
TRIPLE_PLAY, SACRIFICE_FLY, SACRIFICE_BUNT and CAUGHT_STEALING. For a caught fly
the first fielder is the putout, so one tap is correct. For a 6-3 groundout,
recording only the shortstop would credit him a putout he did not make and the
first baseman with nothing.

## Revision 1 — outcome first (2026-09-13, after the first device test)

Scoring real plays on the iPad showed two problems with field-first:

1. **A home run recorded a fielder.** Tapping past the wall auto-selected the
   nearest fielder, and the coach had to clear it by hand. Nobody touches a
   home run; the scorer should never have to say so.
2. **The pop-up could not know what it was for.** Opened before the outcome,
   it had to appear for every ball in play — including hit batsmen and
   catcher's interference, which are not batted balls and could only be
   Skipped — and it could not tailor itself to a home run.

The coach chose to reverse the order. Choosing the outcome first lets the
pop-up appear only for batted balls and adapt to the play. This supersedes
Approach A below; B's stated drawback (holding the location in memory while
choosing the outcome) was judged less costly than a pop-up that cannot
distinguish a home run from a groundout.

## Approaches considered

**A — Field first, then outcome (originally chosen; superseded by Revision 1).** In play → field pop-up → existing
outcome sheet → throw step on outs only. Matches the coach's order and the
scorer's experience of the play: see it, tap it, then say what happened.

**B — Outcome first, then field (adopted in Revision 1).** One pop-up that
already knows the outcome can adapt to it. Originally rejected for reversing
the requested order and asking the scorer to hold the location in memory while
choosing the outcome; adopted after the device test showed field-first could
not handle home runs or non-batted balls.

**C — One combined screen.** Field and outcome buttons together, like web's
inline picker. Fewest taps. Rejected: too dense for an iPad mini in landscape,
the narrowest device this app targets.

## Flow

1. Scorer taps **In play**. The **outcome sheet** opens, exactly as it did
   before this feature.
2. The scorer picks the outcome and completes any detail it already asks for —
   the out type and sacrifice follow-up, the per-runner outcomes on a hit, the
   runner on a fielder's choice or double play, the charged position on an
   error.
3. If `hitLocationEnabled` is on **and** the outcome is a batted ball, the
   **field pop-up** opens as the last step before recording:
   - **Batted balls:** HIT (single, double, triple, home run; fielder's choice
     records as a HIT), OUT, SACRIFICE_FLY, SACRIFICE_BUNT, DOUBLE_PLAY,
     TRIPLE_PLAY, FIELD_ERROR.
   - **Not batted balls — no pop-up ever:** HIT_BY_PITCH, CATCHER_INTERFERENCE.
   - Tapping the field places a marker and highlights the nearest fielder.
   - Tapping any of the nine position markers changes the fielder; tapping the
     highlighted one clears it.
   - **On a home run, the fielder markers are not shown and no fielder is
     recorded** — the pop-up records location only.
   - **On an error, the charged position is pre-selected** as the first fielder
     instead of the nearest one; the scorer can still change it. `errorBy` is
     unaffected.
   - **Next** proceeds with the location and fielder. **Skip** records the play
     with no batted-ball fields. Next is enabled once a location is placed.
4. If the outcome is OUT, SACRIFICE_FLY, SACRIFICE_BUNT, DOUBLE_PLAY or
   TRIPLE_PLAY, **and** a first fielder was chosen, the **throw step** opens:
   - The sequence starts with the first fielder: `6`.
   - Tapping positions appends them in order: `6 → 4 → 3`.
   - **Undo** removes the last position (never the first). **Done** records.
   - Maximum five positions, matching `OutPayload.fieldingSequence`.
   - A caught fly is simply **Done** with `[8]`.
   - If a location was placed but the fielder was cleared, there is no throw
     step: the event records `sprayX` / `sprayY` and omits `fieldingSequence`.
5. The terminal event is recorded with the batted-ball fields attached.

Because the pop-up now opens only at the moment of recording, there is no
captured location that can outlive its play: nothing is held between the
outcome sheet opening and the play being recorded.

## Data

No migration: `game_events.payload` is JSONB. Type additions only, in
`packages/shared/src/types/game-event.ts`.

| Event | Fields written when captured |
|---|---|
| HIT | `sprayX`, `sprayY` (existing), `fieldingSequence: [firstFielder]` (new on `HitPayload`) |
| OUT | `sprayX`, `sprayY` (new on `OutPayload`; web already writes them), `fieldingSequence` (existing) |
| SACRIFICE_FLY / SACRIFICE_BUNT | `sprayX`, `sprayY`, `fieldingSequence` (all existing) |
| DOUBLE_PLAY / TRIPLE_PLAY | `sprayX`, `sprayY`, `fieldingSequence` |
| HIT (home run) | `sprayX`, `sprayY` only — never `fieldingSequence` |
| FIELD_ERROR | `sprayX`, `sprayY`, `fieldingSequence: [firstFielder]`; the field pop-up pre-selects the charged position (`errorBy`) as the first fielder, and `errorBy` stays the charged position |

When the scorer skips, no batted-ball field is written at all — never a null
or a zero, which would plot as a real location at home plate.

`fieldingSequence` on a HIT or FIELD_ERROR credits nothing:
`fielding-stats.ts` does not read it for those events. Its first element means
"first fielder" on every in-play event, which is what makes it safe to reuse.

A fielder's choice records its location and first fielder on the HIT only.
Crediting the force-out putout through the linked BASERUNNER_OUT is out of
scope (see below).

### Tracking toggle

`GAME_START` payload gains `hitLocationEnabled`, alongside the existing
`pitchTypeEnabled` and `pitchLocationEnabled`, read with the same `!== false`
defaulting — so a game started before this change treats it as on. The lineup
wizard's tracking step gains a third `TrackingToggle`.

## Components

### Shared — `packages/shared/src/rules/batted-ball.ts`

Pure, no React.

- `SPRAY_FIELD` — the field geometry web's `SprayChartPicker` hard-codes today:
  viewBox 240×200, home plate at (120, 185), radius 150.
- `sprayFromFieldPoint(x, y)` / `fieldPointFromSpray(sprayX, sprayY)` — convert
  between viewBox points and normalized spray coordinates, clamped to 0–1,
  identical to web's `handleClick` math.
- `FIELDER_SPRAY_POSITIONS` — the standard spot for each position 1–9 in spray
  coordinates.
- `nearestFielder(sprayX, sprayY)` — the position whose standard spot is
  closest to the tap.
- `appendThrow(sequence, position)` / `undoThrow(sequence)` — the throw-step
  sequence rules: a maximum of five, the first fielder never removed.

Web is not refactored onto these in this change; its math is the reference the
tests hold the shared functions to.

### Mobile — `apps/mobile/src/features/scoring/`

- `FieldDiagram.tsx` — the field drawn with `react-native-svg`, mirroring web's
  shapes. Converts a touch to a viewBox point from its measured layout, then to
  spray coordinates. Renders the marker and the nine position markers.
- `FieldLocationModal.tsx` — the pop-up: `FieldDiagram`, fielder
  highlight/override, Next and Skip. Emits `BattedBall | null`. **Revision 1:**
  takes `fielderApplies` (false for a home run: markers hidden,
  `firstFielder` always null) and `initialFielder` (the charged position on an
  error, pre-selected instead of the nearest fielder).
- `ThrowSequenceModal.tsx` — the throw step: the sequence readout, position
  buttons, Undo, Done.
- `batted-ball-fields.ts` — `battedBallPayloadFields(battedBall, throws)`
  returns `{ sprayX?, sprayY?, fieldingSequence? }`, the one place payload
  fields are built so every handler writes the same shape.

### Mobile — changes to existing files

- `PitchInput.tsx` — **Revision 1:** In play opens the outcome sheet directly.
  Every in-play terminal handler is invoked through `commitInPlay`, which —
  when `trackHitLocation` is set — opens the field pop-up as the last step,
  configured for the outcome (no fielder for a home run, the charged position
  pre-selected on an error), then the throw step for the qualifying outcomes,
  then passes the batted-ball fields through `onBattedBall` and records.
  HIT_BY_PITCH and CATCHER_INTERFERENCE never pass through `commitInPlay`.
- `score.tsx` — holds the current batted ball in a ref set by `onBattedBall`;
  each in-play terminal handler spreads `takeBattedBallFields()` into its
  payload, which returns the fields and clears the ref. The ref is also
  cleared whenever a non-in-play pitch is recorded, so a location abandoned
  mid-flow can never attach to a later play.
- `lineup-wizard.ts` / the wizard's tracking step — the `hitLocation` toggle
  and `hitLocationEnabled` in `buildGameStartPayload`.
- `apps/mobile/package.json` — `react-native-svg` 15.2.0 via `expo install`.
  This is a native dependency: the app must be rebuilt, not just reloaded.

## Error handling

- Skip is always available; a skipped play writes no batted-ball fields.
- The field pop-up opens only at the moment of recording, so no location is
  ever held across an abandoned outcome sheet.
- The throw step cannot remove the first fielder or exceed five positions.
- With the toggle off, no new UI appears and no new fields are written —
  scoring behaves exactly as it does today.

## Testing

**Shared (unit):**
- Spray conversion matches web's math at home plate, the foul poles, deep
  center, and a point beyond the wall; out-of-field taps clamp to 0–1.
- Round trip: point → spray → point.
- `nearestFielder` for a deep fly to center (8), a ball up the third-base line
  (5), a ground ball at the shortstop's standard spot, nudged toward second
  but still nearer short (6), and a bunt near the plate (2).
- `appendThrow` / `undoThrow` limits.
- Fielding stats replay: an OUT with `[6, 3]` credits SS an assist and 1B a
  putout; a HIT with `[8]` credits no fielding stat.

**Mobile (unit / RNTL):**
- `battedBallPayloadFields` omits every field when skipped.
- `FieldLocationModal`: a tap at a known point emits the expected spray
  coordinates (layout mocked); the nearest fielder is pre-selected; override
  and clear work; Skip emits null. **Revision 1:** with `fielderApplies=false`
  no marker renders and Next emits `firstFielder: null`; `initialFielder`
  wins over the nearest fielder.
- `ThrowSequenceModal`: sequence building, Undo, Done.
- **Revision 1 flow** (`PitchInput`): In play opens the outcome sheet, not the
  field; a groundout opens the field, then the throw step, then records
  `[6, 3]`; a home run opens the field with no markers and records no
  `fieldingSequence`; an error pre-selects the charged position; a hit batsman
  and catcher's interference never open the field; Skip records `{}`; with
  tracking off nothing opens.

**Device:** tap accuracy and marker size on the iPad mini in landscape, and a
skip-heavy inning to confirm the flow stays fast.

## Out of scope

- Refactoring web's `SprayChartPicker` onto the shared geometry.
- Web honoring `hitLocationEnabled` (web reads the pitch-type and pitch-location toggles in `score/page.tsx`, but a hit-location toggle there is not part of this change).
- A spray chart view on mobile.
- Putout credit for the force on a fielder's choice via its BASERUNNER_OUT.
- Hit distance or exit direction beyond the spray point.
