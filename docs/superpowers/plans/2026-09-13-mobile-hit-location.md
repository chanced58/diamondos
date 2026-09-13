# Mobile Hit Location Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a ball is put in play on mobile, let the scorer tap where it went on a field diagram, confirm which position first touched it, and — on outs — tap the throw sequence, recording `sprayX` / `sprayY` / `fieldingSequence` on the in-play event.

**Architecture:** Pure geometry, nearest-fielder and throw-sequence rules live in `@baseball/shared` (`rules/batted-ball.ts`). Mobile adds a `react-native-svg` field diagram inside a pop-up, a throw-step modal, and a payload-field builder with a one-shot "slot". `PitchInput` routes every in-play terminal handler through one `commitInPlay` helper that emits the batted-ball fields to `score.tsx` immediately before the handler runs; each handler spreads `battedBallSlot.take()` into its payload.

**Tech Stack:** TypeScript, Expo SDK 51, React Native 0.74, `react-native-svg` 15.2.0, NativeWind, Jest (ts-jest for shared, jest-expo + React Native Testing Library for mobile), pnpm + Turborepo.

**Spec:** `docs/superpowers/specs/2026-09-13-mobile-hit-location-design.md`

## Global Constraints

- `diamondos-prod` (`ktxjbjfwrmquohipimjn`) is the ONLY Supabase environment. No task in this plan touches the database; only Task 6's manual check writes to it, under the shakedown protocol.
- No migration. `game_events.payload` is JSONB; changes are TypeScript type additions only. Never UPDATE or DELETE `game_events`.
- `react-native-svg` version is exactly `15.2.0` (the Expo SDK 51 pin), installed with `pnpm --filter mobile exec expo install react-native-svg`.
- Spray math must be identical to web's `SprayChartPicker` (`apps/web/src/app/(app)/games/[gameId]/score/ScoringBoard.tsx`): viewBox 240×200, home plate at (120, 185), radius 150; `sprayX = clamp01((x − 120) / 150 + 0.5)`, `sprayY = clamp01((185 − y) / 150)`.
- When the scorer skips, **no** batted-ball field is written — never `null`, never `0`.
- `fieldingSequence` holds at most 5 positions; the first fielder is never removed by Undo.
- The throw step appears only for `OUT`, `SACRIFICE_FLY`, `SACRIFICE_BUNT`, `DOUBLE_PLAY`, `TRIPLE_PLAY`, and only when a first fielder was chosen.
- HIT_BY_PITCH and CATCHER_INTERFERENCE never record a location.
- `GAME_START` carries `hitLocationEnabled`, read as `gsp.hitLocationEnabled !== false`.
- Web code is not changed by this plan.
- Verification gate for every task: `pnpm type-check` exits 0 and `pnpm test` passes. `pnpm lint` fails identically on `main` (pre-existing, `packages/shared/src/utils/` stats files) and is **not** a gate.
- Commit messages use Conventional Commits and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Do not push.

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/rules/batted-ball.ts` (create) | Field geometry, spray ↔ field-point conversion, fielder spots, `nearestFielder`, `appendThrow` / `undoThrow`, `requiresThrowStep`, `BattedBall` type |
| `packages/shared/src/rules/__tests__/batted-ball.test.ts` (create) | Unit tests for the above |
| `packages/shared/src/rules/index.ts` (modify) | Export the new module |
| `packages/shared/src/types/game-event.ts` (modify) | `HitPayload.fieldingSequence`, `OutPayload.sprayX` / `sprayY` |
| `packages/shared/src/utils/__tests__/fielding-stats.test.ts` (modify) | Guard: `fieldingSequence` on a HIT credits nothing |
| `apps/mobile/src/features/scoring/batted-ball-fields.ts` (create) | `battedBallPayloadFields`, `createBattedBallSlot` |
| `apps/mobile/src/features/scoring/ThrowSequenceModal.tsx` (create) | Throw-step UI |
| `apps/mobile/src/features/scoring/FieldDiagram.tsx` (create) | SVG field, tap → spray, fielder markers |
| `apps/mobile/src/features/scoring/FieldLocationModal.tsx` (create) | The pop-up: diagram, nearest-fielder selection, Next / Skip |
| `apps/mobile/src/features/lineup/lineup-wizard.ts` (modify) | `hitLocation` tracking → `hitLocationEnabled` |
| `apps/mobile/src/features/scoring/PitchInput.tsx` (modify) | Open the pop-up, `commitInPlay`, throw step, error-picker pre-selection |
| `apps/mobile/app/(tabs)/games/[gameId]/score.tsx` (modify) | Wizard toggle, `scoringConfig.hitLocation`, batted-ball slot wired into handlers |

---

### Task 1: Shared batted-ball rules and payload types

**Files:**
- Create: `packages/shared/src/rules/batted-ball.ts`
- Create: `packages/shared/src/rules/__tests__/batted-ball.test.ts`
- Modify: `packages/shared/src/rules/index.ts`
- Modify: `packages/shared/src/types/game-event.ts` (`HitPayload` ~line 150, `OutPayload` ~line 173)
- Modify: `packages/shared/src/utils/__tests__/fielding-stats.test.ts` (append)

**Interfaces:**
- Consumes: `EventType`, `HitPayload`, `OutPayload` from `packages/shared/src/types/game-event.ts`.
- Produces (all exported from `@baseball/shared`):
  - `SPRAY_FIELD: { width: 240; height: 200; homeX: 120; homeY: 185; radius: 150 }`
  - `interface BattedBall { sprayX: number; sprayY: number; firstFielder: number | null }`
  - `MAX_FIELDING_SEQUENCE = 5`
  - `sprayFromFieldPoint(x: number, y: number): { sprayX: number; sprayY: number }`
  - `fieldPointFromSpray(sprayX: number, sprayY: number): { x: number; y: number }`
  - `FIELDER_SPRAY_POSITIONS: Record<number, { sprayX: number; sprayY: number }>` (keys 1–9)
  - `nearestFielder(sprayX: number, sprayY: number): number`
  - `appendThrow(sequence: readonly number[], position: number): number[]`
  - `undoThrow(sequence: readonly number[]): number[]`
  - `requiresThrowStep(eventType: EventType): boolean`
  - `HitPayload.fieldingSequence?: number[]`; `OutPayload.sprayX?: number`; `OutPayload.sprayY?: number`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/rules/__tests__/batted-ball.test.ts`:

```ts
import { EventType } from '../../types/game-event';
import {
  appendThrow,
  fieldPointFromSpray,
  nearestFielder,
  requiresThrowStep,
  sprayFromFieldPoint,
  undoThrow,
} from '../batted-ball';

describe('sprayFromFieldPoint', () => {
  it('should put home plate at the bottom centre of the spray space', () => {
    expect(sprayFromFieldPoint(120, 185)).toEqual({ sprayX: 0.5, sprayY: 0 });
  });

  it('should match web at the left foul pole, clamping x to the edge', () => {
    const { sprayX, sprayY } = sprayFromFieldPoint(14, 79);
    expect(sprayX).toBe(0);
    expect(sprayY).toBeCloseTo(0.7067, 4);
  });

  it('should match web at the right foul pole, clamping x to the edge', () => {
    const { sprayX, sprayY } = sprayFromFieldPoint(226, 79);
    expect(sprayX).toBe(1);
    expect(sprayY).toBeCloseTo(0.7067, 4);
  });

  it('should put the deep centre-field wall at sprayY 1', () => {
    expect(sprayFromFieldPoint(120, 35)).toEqual({ sprayX: 0.5, sprayY: 1 });
  });

  it('should clamp a tap beyond the wall to sprayY 1', () => {
    expect(sprayFromFieldPoint(120, 5).sprayY).toBe(1);
  });

  it('should place first base where web does', () => {
    const { sprayX, sprayY } = sprayFromFieldPoint(165, 140);
    expect(sprayX).toBeCloseTo(0.8, 10);
    expect(sprayY).toBeCloseTo(0.3, 10);
  });
});

describe('fieldPointFromSpray', () => {
  it('should round-trip a point inside the field', () => {
    const { sprayX, sprayY } = sprayFromFieldPoint(165, 140);
    const { x, y } = fieldPointFromSpray(sprayX, sprayY);
    expect(x).toBeCloseTo(165, 10);
    expect(y).toBeCloseTo(140, 10);
  });
});

describe('nearestFielder', () => {
  it('should give a deep fly to centre to the centre fielder', () => {
    expect(nearestFielder(0.5, 0.97)).toBe(8);
  });

  it('should give a ball up the third-base line to the third baseman', () => {
    expect(nearestFielder(0.25, 0.33)).toBe(5);
  });

  it('should give a grounder nudged toward second but nearer short to the shortstop', () => {
    expect(nearestFielder(0.42, 0.58)).toBe(6);
  });

  it('should give a bunt near the plate to the catcher', () => {
    expect(nearestFielder(0.5, 0.06)).toBe(2);
  });
});

describe('appendThrow', () => {
  it('should add the next fielder to the sequence', () => {
    expect(appendThrow([6], 3)).toEqual([6, 3]);
  });

  it('should not grow past five positions', () => {
    expect(appendThrow([6, 4, 3, 4, 3], 1)).toEqual([6, 4, 3, 4, 3]);
  });

  it('should ignore a fielder throwing to himself', () => {
    expect(appendThrow([6], 6)).toEqual([6]);
  });

  it('should not mutate the sequence it was given', () => {
    const sequence = [6];
    appendThrow(sequence, 3);
    expect(sequence).toEqual([6]);
  });
});

describe('undoThrow', () => {
  it('should remove the last throw', () => {
    expect(undoThrow([6, 4, 3])).toEqual([6, 4]);
  });

  it('should never remove the first fielder', () => {
    expect(undoThrow([6])).toEqual([6]);
  });

  it('should leave an empty sequence empty', () => {
    expect(undoThrow([])).toEqual([]);
  });
});

describe('requiresThrowStep', () => {
  it.each([
    EventType.OUT,
    EventType.SACRIFICE_FLY,
    EventType.SACRIFICE_BUNT,
    EventType.DOUBLE_PLAY,
    EventType.TRIPLE_PLAY,
  ])('should ask for throws on %s', (eventType) => {
    expect(requiresThrowStep(eventType)).toBe(true);
  });

  it.each([EventType.HIT, EventType.FIELD_ERROR])('should not ask for throws on %s', (eventType) => {
    expect(requiresThrowStep(eventType)).toBe(false);
  });
});
```

Append to `packages/shared/src/utils/__tests__/fielding-stats.test.ts` (it already defines `e`, `resetSeq`, `players`, `ctxMap`, `deriveFieldingStats`, `EventType`):

```ts
describe('deriveFieldingStats — first fielder recorded on a hit', () => {
  beforeEach(resetSeq);

  it('should credit no putout or assist for the fielder who picked up a hit', () => {
    const events: Evt[] = [
      e(EventType.HIT, { hitType: 'single', sprayX: 0.5, sprayY: 0.9, fieldingSequence: [8] }, true),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = deriveFieldingStats(events as any, players, ctxMap());
    expect(stats.get('p-cf')?.putouts ?? 0).toBe(0);
    expect(stats.get('p-cf')?.assists ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @baseball/shared test -- batted-ball`
Expected: FAIL — `Cannot find module '../batted-ball'`.

- [ ] **Step 3: Implement the module**

Create `packages/shared/src/rules/batted-ball.ts`:

```ts
import { EventType } from '../types/game-event';

/**
 * The field drawing both clients share: web's SprayChartPicker hard-codes
 * these numbers, and mobile's FieldDiagram draws from them, so a tap on
 * either lands in the same spray space.
 */
export const SPRAY_FIELD = {
  width: 240,
  height: 200,
  homeX: 120,
  homeY: 185,
  radius: 150,
} as const;

/** Where a ball in play went, and who first touched it (null: nobody, e.g. over the wall). */
export interface BattedBall {
  sprayX: number;
  sprayY: number;
  firstFielder: number | null;
}

/** OutPayload.fieldingSequence allows at most five positions. */
export const MAX_FIELDING_SEQUENCE = 5;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * A point in the 240×200 field drawing → normalized spray coordinates:
 * sprayX 0 = left, 0.5 = centre, 1 = right; sprayY 0 = home plate, 1 = the
 * deep centre-field wall. Identical to web's SprayChartPicker.handleClick.
 */
export function sprayFromFieldPoint(x: number, y: number): { sprayX: number; sprayY: number } {
  return {
    sprayX: clamp01((x - SPRAY_FIELD.homeX) / SPRAY_FIELD.radius + 0.5),
    sprayY: clamp01((SPRAY_FIELD.homeY - y) / SPRAY_FIELD.radius),
  };
}

/** The inverse of sprayFromFieldPoint, for drawing a recorded location. */
export function fieldPointFromSpray(sprayX: number, sprayY: number): { x: number; y: number } {
  return {
    x: (sprayX - 0.5) * SPRAY_FIELD.radius + SPRAY_FIELD.homeX,
    y: SPRAY_FIELD.homeY - sprayY * SPRAY_FIELD.radius,
  };
}

/**
 * Where each position stands at normal depth, in spray coordinates. Only used
 * to guess the likeliest first fielder for a tap — the scorer confirms it.
 */
export const FIELDER_SPRAY_POSITIONS: Record<number, { sprayX: number; sprayY: number }> = {
  1: { sprayX: 0.5, sprayY: 0.36 },
  2: { sprayX: 0.5, sprayY: 0.02 },
  3: { sprayX: 0.76, sprayY: 0.4 },
  4: { sprayX: 0.64, sprayY: 0.58 },
  5: { sprayX: 0.24, sprayY: 0.4 },
  6: { sprayX: 0.36, sprayY: 0.58 },
  7: { sprayX: 0.22, sprayY: 0.85 },
  8: { sprayX: 0.5, sprayY: 0.92 },
  9: { sprayX: 0.78, sprayY: 0.85 },
};

/** The position whose normal spot is closest to where the ball went. */
export function nearestFielder(sprayX: number, sprayY: number): number {
  let best = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let position = 1; position <= 9; position++) {
    const spot = FIELDER_SPRAY_POSITIONS[position];
    const distance = Math.hypot(spot.sprayX - sprayX, spot.sprayY - sprayY);
    if (distance < bestDistance) {
      best = position;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The throw step's "tap the next fielder". Capped at five, and a fielder
 * cannot throw to himself, so a double tap on the same position is ignored.
 */
export function appendThrow(sequence: readonly number[], position: number): number[] {
  if (sequence.length >= MAX_FIELDING_SEQUENCE) return [...sequence];
  if (sequence[sequence.length - 1] === position) return [...sequence];
  return [...sequence, position];
}

/** The throw step's Undo. The first fielder came from the field pop-up and stays. */
export function undoThrow(sequence: readonly number[]): number[] {
  return sequence.length <= 1 ? [...sequence] : sequence.slice(0, -1);
}

/**
 * The outcomes fielding-stats credits putouts and assists from via
 * fieldingSequence — the only ones where the throws after the first fielder
 * matter. Recording just the shortstop on a 6-3 groundout would credit him a
 * putout he did not make.
 */
const THROW_STEP_EVENTS: readonly EventType[] = [
  EventType.OUT,
  EventType.SACRIFICE_FLY,
  EventType.SACRIFICE_BUNT,
  EventType.DOUBLE_PLAY,
  EventType.TRIPLE_PLAY,
];

export function requiresThrowStep(eventType: EventType): boolean {
  return THROW_STEP_EVENTS.includes(eventType);
}
```

Append to `packages/shared/src/rules/index.ts`:

```ts
export * from './batted-ball';
```

In `packages/shared/src/types/game-event.ts`, add to `HitPayload` directly after `sprayY?: number;`:

```ts
  /**
   * Position numbers; element 0 is the fielder who first touched the ball.
   * On a hit this credits nothing — fielding-stats reads fieldingSequence
   * only for outs — it records who fielded it.
   */
  fieldingSequence?: number[];
```

Add to `OutPayload` directly after `trajectory?: HitTrajectory;`:

```ts
  // Spray chart coordinates: 0-1 normalized, 0,0 = home plate
  sprayX?: number;
  sprayY?: number;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @baseball/shared test -- batted-ball fielding-stats`
Expected: PASS — all `batted-ball` tests and the new fielding-stats test.

- [ ] **Step 5: Verify the whole repo**

Run: `pnpm type-check && pnpm test`
Expected: type-check exits 0; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/rules/batted-ball.ts packages/shared/src/rules/__tests__/batted-ball.test.ts packages/shared/src/rules/index.ts packages/shared/src/types/game-event.ts packages/shared/src/utils/__tests__/fielding-stats.test.ts
git commit -m "feat(shared): add batted-ball geometry, nearest fielder and throw rules

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Batted-ball payload fields and the throw step

**Files:**
- Create: `apps/mobile/src/features/scoring/batted-ball-fields.ts`
- Create: `apps/mobile/src/features/scoring/__tests__/batted-ball-fields.test.ts`
- Create: `apps/mobile/src/features/scoring/ThrowSequenceModal.tsx`
- Create: `apps/mobile/src/features/scoring/__tests__/ThrowSequenceModal.test.tsx`

**Interfaces:**
- Consumes: `BattedBall`, `appendThrow`, `undoThrow`, `MAX_FIELDING_SEQUENCE`, `FIELDING_POSITION_NUMBERS` from `@baseball/shared` (Task 1; `FIELDING_POSITION_NUMBERS` is existing: `{ number: number; label: string; abbr: string }[]`).
- Produces:
  - `interface BattedBallPayloadFields { sprayX?: number; sprayY?: number; fieldingSequence?: number[] }`
  - `battedBallPayloadFields(battedBall: BattedBall | null, throws?: readonly number[]): BattedBallPayloadFields`
  - `createBattedBallSlot(): { set(fields: BattedBallPayloadFields): void; take(): BattedBallPayloadFields; clear(): void }`
  - `type BattedBallSlot = ReturnType<typeof createBattedBallSlot>`
  - `ThrowSequenceModal(props: { visible: boolean; firstFielder: number | null; onDone: (sequence: number[]) => void })`
  - testIDs: `throw-sequence-readout`, `throw-position-<1..9>`, `throw-undo`, `throw-done`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/features/scoring/__tests__/batted-ball-fields.test.ts`:

```ts
import { battedBallPayloadFields, createBattedBallSlot } from '../batted-ball-fields';

describe('battedBallPayloadFields', () => {
  it('should write no field at all when the scorer skipped', () => {
    const fields = battedBallPayloadFields(null);
    expect(fields).toEqual({});
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('should record the location and the first fielder', () => {
    expect(battedBallPayloadFields({ sprayX: 0.36, sprayY: 0.58, firstFielder: 6 })).toEqual({
      sprayX: 0.36,
      sprayY: 0.58,
      fieldingSequence: [6],
    });
  });

  it('should omit fieldingSequence when no fielder touched it', () => {
    const fields = battedBallPayloadFields({ sprayX: 0.5, sprayY: 1, firstFielder: null });
    expect(fields).toEqual({ sprayX: 0.5, sprayY: 1 });
    expect(fields).not.toHaveProperty('fieldingSequence');
  });

  it('should record the full throw sequence when one was tapped', () => {
    expect(
      battedBallPayloadFields({ sprayX: 0.36, sprayY: 0.58, firstFielder: 6 }, [6, 3]).fieldingSequence,
    ).toEqual([6, 3]);
  });

  it('should copy the throw sequence rather than keep a reference to it', () => {
    const throws = [6, 3];
    const fields = battedBallPayloadFields({ sprayX: 0.36, sprayY: 0.58, firstFielder: 6 }, throws);
    throws.push(1);
    expect(fields.fieldingSequence).toEqual([6, 3]);
  });
});

describe('createBattedBallSlot', () => {
  it('should hand the fields out once and then be empty', () => {
    const slot = createBattedBallSlot();
    slot.set({ sprayX: 0.5, sprayY: 0.9, fieldingSequence: [8] });
    expect(slot.take()).toEqual({ sprayX: 0.5, sprayY: 0.9, fieldingSequence: [8] });
    expect(slot.take()).toEqual({});
  });

  it('should drop fields that are cleared before anything takes them', () => {
    const slot = createBattedBallSlot();
    slot.set({ sprayX: 0.5, sprayY: 0.9 });
    slot.clear();
    expect(slot.take()).toEqual({});
  });
});
```

Create `apps/mobile/src/features/scoring/__tests__/ThrowSequenceModal.test.tsx`:

```tsx
import { render, fireEvent, screen } from '@testing-library/react-native';
import { ThrowSequenceModal } from '../ThrowSequenceModal';

function readout() {
  return screen.getByTestId('throw-sequence-readout').props.children;
}

describe('ThrowSequenceModal', () => {
  it('should start the sequence with the first fielder', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    expect(readout()).toBe('6');
  });

  it('should append tapped fielders in order and undo the last one', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    fireEvent.press(screen.getByTestId('throw-position-4'));
    fireEvent.press(screen.getByTestId('throw-position-3'));
    expect(readout()).toBe('6 → 4 → 3');
    fireEvent.press(screen.getByTestId('throw-undo'));
    expect(readout()).toBe('6 → 4');
  });

  it('should never undo the first fielder', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    fireEvent.press(screen.getByTestId('throw-undo'));
    expect(readout()).toBe('6');
  });

  it('should stop at five positions', () => {
    render(<ThrowSequenceModal visible firstFielder={6} onDone={jest.fn()} />);
    for (const position of [4, 3, 4, 3, 1]) {
      fireEvent.press(screen.getByTestId(`throw-position-${position}`));
    }
    expect(readout()).toBe('6 → 4 → 3 → 4 → 3');
  });

  it('should hand back the sequence on Done — a caught fly is just the first fielder', () => {
    const onDone = jest.fn();
    render(<ThrowSequenceModal visible firstFielder={8} onDone={onDone} />);
    fireEvent.press(screen.getByTestId('throw-done'));
    expect(onDone).toHaveBeenCalledWith([8]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter mobile exec jest src/features/scoring/__tests__/batted-ball-fields.test.ts src/features/scoring/__tests__/ThrowSequenceModal.test.tsx`
Expected: FAIL — `Cannot find module '../batted-ball-fields'` and `'../ThrowSequenceModal'`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/features/scoring/batted-ball-fields.ts`:

```ts
import type { BattedBall } from '@baseball/shared';

/** The batted-ball keys an in-play event payload carries. Absent keys mean "not recorded". */
export interface BattedBallPayloadFields {
  sprayX?: number;
  sprayY?: number;
  fieldingSequence?: number[];
}

/**
 * The one place in-play payload fields are built, so every handler writes the
 * same shape. A skipped play yields no keys at all: a null or zero location
 * would plot as a real ball at home plate.
 *
 * `throws` is the throw step's result, first fielder included; without it the
 * first fielder alone becomes the sequence.
 */
export function battedBallPayloadFields(
  battedBall: BattedBall | null,
  throws?: readonly number[],
): BattedBallPayloadFields {
  if (!battedBall) return {};
  const fields: BattedBallPayloadFields = { sprayX: battedBall.sprayX, sprayY: battedBall.sprayY };
  if (throws && throws.length > 0) {
    fields.fieldingSequence = [...throws];
  } else if (battedBall.firstFielder !== null) {
    fields.fieldingSequence = [battedBall.firstFielder];
  }
  return fields;
}

/**
 * Carries batted-ball fields from PitchInput to the one in-play handler that
 * records them. PitchInput sets it immediately before invoking a terminal
 * handler — with {} when nothing was captured — and the handler takes it,
 * which empties it. score.tsx also clears it on every non-in-play pitch, so a
 * location abandoned mid-flow can never attach to a later play.
 */
export function createBattedBallSlot() {
  let current: BattedBallPayloadFields = {};
  return {
    set(fields: BattedBallPayloadFields): void {
      current = fields;
    },
    take(): BattedBallPayloadFields {
      const fields = current;
      current = {};
      return fields;
    },
    clear(): void {
      current = {};
    },
  };
}

export type BattedBallSlot = ReturnType<typeof createBattedBallSlot>;
```

Create `apps/mobile/src/features/scoring/ThrowSequenceModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import {
  FIELDING_POSITION_NUMBERS,
  MAX_FIELDING_SEQUENCE,
  appendThrow,
  undoThrow,
} from '@baseball/shared';

/**
 * The throw step after an out: the fielder who first touched the ball is
 * already in the sequence, and the scorer taps where it was thrown (6 → 4 → 3).
 * A caught fly is just Done. fielding-stats credits the last position with the
 * putout and the rest with assists, which is why this exists at all.
 */
export function ThrowSequenceModal({
  visible,
  firstFielder,
  onDone,
}: {
  visible: boolean;
  firstFielder: number | null;
  onDone: (sequence: number[]) => void;
}) {
  const [sequence, setSequence] = useState<number[]>(firstFielder !== null ? [firstFielder] : []);

  useEffect(() => {
    if (visible) setSequence(firstFielder !== null ? [firstFielder] : []);
  }, [visible, firstFielder]);

  const full = sequence.length >= MAX_FIELDING_SEQUENCE;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={() => onDone(sequence)}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
          <Text className="text-lg font-bold text-gray-900 mb-1">Where was it thrown?</Text>
          <Text className="text-sm text-gray-500 mb-3">
            Tap each fielder in order. Caught on the fly? Just tap Done.
          </Text>
          <Text testID="throw-sequence-readout" className="text-2xl font-bold text-slate-900 mb-4">
            {sequence.join(' → ')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FIELDING_POSITION_NUMBERS.map(({ number, abbr }) => (
              <TouchableOpacity
                key={number}
                testID={`throw-position-${number}`}
                disabled={full}
                className={`border rounded-xl px-4 py-3 ${full ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'}`}
                onPress={() => setSequence((current) => appendThrow(current, number))}
              >
                <Text className="text-slate-800 font-semibold">
                  {number} {abbr}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View className="flex-row gap-2 mt-4">
            <TouchableOpacity
              testID="throw-undo"
              className="flex-1 py-3 rounded-xl border border-slate-300 items-center"
              onPress={() => setSequence((current) => undoThrow(current))}
            >
              <Text className="text-slate-700 font-semibold">Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="throw-done"
              className="flex-1 py-3 rounded-xl bg-slate-800 items-center"
              onPress={() => onDone(sequence)}
            >
              <Text className="text-white font-semibold">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter mobile exec jest src/features/scoring/__tests__/batted-ball-fields.test.ts src/features/scoring/__tests__/ThrowSequenceModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify the whole repo**

Run: `pnpm type-check && pnpm test`
Expected: type-check exits 0; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/scoring/batted-ball-fields.ts apps/mobile/src/features/scoring/__tests__/batted-ball-fields.test.ts apps/mobile/src/features/scoring/ThrowSequenceModal.tsx apps/mobile/src/features/scoring/__tests__/ThrowSequenceModal.test.tsx
git commit -m "feat(mobile): add batted-ball payload fields and the throw-sequence step

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Field diagram and location pop-up

**Files:**
- Modify: `apps/mobile/package.json` (via `expo install`)
- Create: `apps/mobile/src/features/scoring/FieldDiagram.tsx`
- Create: `apps/mobile/src/features/scoring/FieldLocationModal.tsx`
- Create: `apps/mobile/src/features/scoring/__tests__/FieldLocationModal.test.tsx`

**Interfaces:**
- Consumes: `SPRAY_FIELD`, `FIELDER_SPRAY_POSITIONS`, `fieldPointFromSpray`, `sprayFromFieldPoint`, `nearestFielder`, `type BattedBall`, `FIELDING_POSITION_NUMBERS` from `@baseball/shared`.
- Produces:
  - `FieldDiagram(props: { location: { sprayX: number; sprayY: number } | null; selectedFielder: number | null; onPlaceBall: (point: { sprayX: number; sprayY: number }) => void; onPressFielder: (position: number) => void })`
  - `FieldLocationModal(props: { visible: boolean; onNext: (battedBall: BattedBall) => void; onSkip: () => void })`
  - testIDs: `field-diagram-frame` (receives `layout`), `field-diagram` (receives `press` with `nativeEvent.locationX/locationY`), `fielder-marker-<1..9>`; buttons labelled `Next` and `Skip`.

- [ ] **Step 1: Install the SVG library**

Run: `pnpm --filter mobile exec expo install react-native-svg`
Expected: `apps/mobile/package.json` gains `"react-native-svg": "15.2.0"`. If the resolved version is anything other than `15.2.0`, stop and report — do not hand-edit a different version in.

This is a native module. Nothing in this task needs a device build; Task 6 rebuilds the app.

- [ ] **Step 2: Write the failing tests**

Create `apps/mobile/src/features/scoring/__tests__/FieldLocationModal.test.tsx`:

```tsx
import { render, fireEvent, screen } from '@testing-library/react-native';
import { FieldDiagram } from '../FieldDiagram';
import { FieldLocationModal } from '../FieldLocationModal';

// The SVG drawing is decoration here; the behaviour under test is the touch
// layer and the fielder markers, which are ordinary React Native views.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: { children?: unknown }) => React.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Rect: Stub, Path: Stub, Circle: Stub, Polygon: Stub, Line: Stub };
});

/** Lays the diagram out at the drawing's own 240×200 size, then taps a point in it. */
function tapField(x: number, y: number) {
  fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
    nativeEvent: { layout: { width: 240, height: 200 } },
  });
  fireEvent.press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: x, locationY: y } });
}

describe('FieldDiagram', () => {
  it('should turn a tap into spray coordinates, scaled from the rendered size', () => {
    const onPlaceBall = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={jest.fn()} />);
    fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
      nativeEvent: { layout: { width: 480, height: 400 } },
    });
    // (240, 70) at double size is (120, 35) in the drawing: the deep centre wall.
    fireEvent.press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: 240, locationY: 70 } });
    expect(onPlaceBall).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1 });
  });

  it('should ignore a tap that lands before the diagram has been measured', () => {
    const onPlaceBall = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={jest.fn()} />);
    fireEvent.press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: 120, locationY: 35 } });
    expect(onPlaceBall).not.toHaveBeenCalled();
  });

  it('should report a tapped fielder marker without placing the ball', () => {
    const onPlaceBall = jest.fn();
    const onPressFielder = jest.fn();
    render(<FieldDiagram location={null} selectedFielder={null} onPlaceBall={onPlaceBall} onPressFielder={onPressFielder} />);
    fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
      nativeEvent: { layout: { width: 240, height: 200 } },
    });
    fireEvent.press(screen.getByTestId('fielder-marker-6'));
    expect(onPressFielder).toHaveBeenCalledWith(6);
    expect(onPlaceBall).not.toHaveBeenCalled();
  });
});

describe('FieldLocationModal', () => {
  it('should not allow Next before a location is placed', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    fireEvent.press(screen.getByText('Next'));
    expect(onNext).not.toHaveBeenCalled();
  });

  it('should pre-select the nearest fielder for the tapped location', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    // (99, 98) in the drawing is spray (0.36, 0.58): the shortstop's spot.
    tapField(99, 98);
    fireEvent.press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith({
      sprayX: expect.closeTo(0.36, 6),
      sprayY: expect.closeTo(0.58, 6),
      firstFielder: 6,
    });
  });

  it('should let the scorer pick a different fielder', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    tapField(99, 98);
    fireEvent.press(screen.getByTestId('fielder-marker-4'));
    fireEvent.press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith(expect.objectContaining({ firstFielder: 4 }));
  });

  it('should clear the fielder when the selected marker is tapped again — a ball over the wall', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible onNext={onNext} onSkip={jest.fn()} />);
    tapField(120, 10);
    fireEvent.press(screen.getByTestId('fielder-marker-8'));
    fireEvent.press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1, firstFielder: null });
  });

  it('should skip without a location', () => {
    const onSkip = jest.fn();
    render(<FieldLocationModal visible onNext={jest.fn()} onSkip={onSkip} />);
    fireEvent.press(screen.getByText('Skip'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter mobile exec jest src/features/scoring/__tests__/FieldLocationModal.test.tsx`
Expected: FAIL — `Cannot find module '../FieldDiagram'`.

- [ ] **Step 4: Implement**

Create `apps/mobile/src/features/scoring/FieldDiagram.tsx`:

```tsx
import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';
import {
  FIELDER_SPRAY_POSITIONS,
  FIELDING_POSITION_NUMBERS,
  SPRAY_FIELD,
  fieldPointFromSpray,
  sprayFromFieldPoint,
} from '@baseball/shared';

/** Fielder markers are tap targets thumbed in a dugout — 40pt, not a dot. */
const MARKER_SIZE = 40;

/**
 * The field web's SprayChartPicker draws, in the same 240×200 drawing space,
 * so a location tapped here is the same sprayX / sprayY web would record.
 *
 * The drawing never takes touches itself: a Pressable over it turns a tap into
 * a point in the drawing (scaled from the measured size), and the fielder
 * markers sit above that as ordinary buttons, so tapping a marker picks a
 * fielder without also moving the ball.
 */
export function FieldDiagram({
  location,
  selectedFielder,
  onPlaceBall,
  onPressFielder,
}: {
  location: { sprayX: number; sprayY: number } | null;
  selectedFielder: number | null;
  onPlaceBall: (point: { sprayX: number; sprayY: number }) => void;
  onPressFielder: (position: number) => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  function handlePress(event: GestureResponderEvent) {
    if (size.width === 0 || size.height === 0) return;
    const { locationX, locationY } = event.nativeEvent;
    onPlaceBall(
      sprayFromFieldPoint(
        (locationX / size.width) * SPRAY_FIELD.width,
        (locationY / size.height) * SPRAY_FIELD.height,
      ),
    );
  }

  const ball = location ? fieldPointFromSpray(location.sprayX, location.sprayY) : null;

  return (
    <View
      testID="field-diagram-frame"
      style={{ width: '100%', aspectRatio: SPRAY_FIELD.width / SPRAY_FIELD.height }}
      onLayout={handleLayout}
    >
      <Pressable
        testID="field-diagram"
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
        onPress={handlePress}
      >
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${SPRAY_FIELD.width} ${SPRAY_FIELD.height}`}
          pointerEvents="none"
        >
          <Rect x={0} y={0} width={240} height={200} fill="#e0f2fe" />
          <Path d="M 120 185 L 14 79 A 150 150 0 0 1 226 79 Z" fill="#86efac" />
          <Circle cx={120} cy={132} r={52} fill="#d4a76a" />
          <Polygon points="120,185 165,140 120,95 75,140" fill="#a3c97c" />
          <Polygon points="120,185 165,140 120,95 75,140" fill="none" stroke="#374151" strokeWidth={1.5} />
          <Path d="M 14 79 A 150 150 0 0 1 226 79" stroke="#374151" strokeWidth={2.5} fill="none" />
          <Line x1={120} y1={185} x2={14} y2={79} stroke="#6b7280" strokeWidth={1} strokeDasharray="5 3" />
          <Line x1={120} y1={185} x2={226} y2={79} stroke="#6b7280" strokeWidth={1} strokeDasharray="5 3" />
          <Circle cx={120} cy={131} r={7} fill="#c8956c" stroke="#92644e" strokeWidth={1.5} />
          <Polygon points="165,134 171,140 165,146 159,140" fill="white" stroke="#374151" strokeWidth={1.5} />
          <Polygon points="120,89 126,95 120,101 114,95" fill="white" stroke="#374151" strokeWidth={1.5} />
          <Polygon points="75,134 81,140 75,146 69,140" fill="white" stroke="#374151" strokeWidth={1.5} />
          <Polygon points="120,196 130,188 127,178 113,178 110,188" fill="white" stroke="#374151" strokeWidth={1.5} />
          {ball && (
            <>
              <Circle cx={ball.x} cy={ball.y} r={11} fill="#ef4444" opacity={0.25} />
              <Circle cx={ball.x} cy={ball.y} r={5} fill="#ef4444" />
              <Circle cx={ball.x} cy={ball.y} r={2} fill="white" />
            </>
          )}
        </Svg>
      </Pressable>

      {size.width > 0 &&
        FIELDING_POSITION_NUMBERS.map(({ number, abbr }) => {
          const spot = FIELDER_SPRAY_POSITIONS[number];
          const point = fieldPointFromSpray(spot.sprayX, spot.sprayY);
          const left = (point.x / SPRAY_FIELD.width) * size.width - MARKER_SIZE / 2;
          const top = (point.y / SPRAY_FIELD.height) * size.height - MARKER_SIZE / 2;
          const selected = selectedFielder === number;
          return (
            <TouchableOpacity
              key={number}
              testID={`fielder-marker-${number}`}
              accessibilityRole="button"
              accessibilityLabel={abbr}
              accessibilityState={{ selected }}
              onPress={() => onPressFielder(number)}
              style={{
                position: 'absolute',
                left,
                top,
                width: MARKER_SIZE,
                height: MARKER_SIZE,
                borderRadius: MARKER_SIZE / 2,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                backgroundColor: selected ? '#1d4ed8' : 'rgba(255,255,255,0.9)',
                borderColor: selected ? '#1e3a8a' : '#475569',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: selected ? '#ffffff' : '#0f172a' }}>
                {abbr}
              </Text>
            </TouchableOpacity>
          );
        })}
    </View>
  );
}
```

Create `apps/mobile/src/features/scoring/FieldLocationModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { nearestFielder, type BattedBall } from '@baseball/shared';
import { FieldDiagram } from './FieldDiagram';

/**
 * The pop-up shown on In play when the game tracks hit location. One tap is
 * the common case: it places the ball and selects the nearest fielder. The
 * scorer can pick another fielder, clear it (over the wall), or Skip a play
 * they didn't see — Skip records nothing.
 */
export function FieldLocationModal({
  visible,
  onNext,
  onSkip,
}: {
  visible: boolean;
  onNext: (battedBall: BattedBall) => void;
  onSkip: () => void;
}) {
  const [location, setLocation] = useState<{ sprayX: number; sprayY: number } | null>(null);
  const [fielder, setFielder] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setLocation(null);
      setFielder(null);
    }
  }, [visible]);

  function placeBall(point: { sprayX: number; sprayY: number }) {
    setLocation(point);
    setFielder(nearestFielder(point.sprayX, point.sprayY));
  }

  function pressFielder(position: number) {
    setFielder((current) => (current === position ? null : position));
  }

  function next() {
    if (!location) return;
    onNext({ ...location, firstFielder: fielder });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onSkip}
    >
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <View className="bg-white rounded-2xl p-4 w-full" style={{ maxWidth: 560 }}>
          <Text className="text-lg font-bold text-gray-900">Where did it go?</Text>
          <Text className="text-sm text-gray-500 mb-3">
            {location
              ? 'Tap a fielder to change who touched it first.'
              : 'Tap where the ball landed or was fielded.'}
          </Text>
          <FieldDiagram
            location={location}
            selectedFielder={fielder}
            onPlaceBall={placeBall}
            onPressFielder={pressFielder}
          />
          <View className="flex-row gap-2 mt-3">
            <TouchableOpacity
              className="flex-1 py-3 rounded-xl border border-slate-300 items-center"
              onPress={onSkip}
            >
              <Text className="text-slate-700 font-semibold">Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-3 rounded-xl items-center ${location ? 'bg-slate-800' : 'bg-slate-300'}`}
              disabled={!location}
              onPress={next}
            >
              <Text className="text-white font-semibold">Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter mobile exec jest src/features/scoring/__tests__/FieldLocationModal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify the whole repo**

Run: `pnpm type-check && pnpm test`
Expected: type-check exits 0; all suites pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/features/scoring/FieldDiagram.tsx apps/mobile/src/features/scoring/FieldLocationModal.tsx apps/mobile/src/features/scoring/__tests__/FieldLocationModal.test.tsx
git commit -m "feat(mobile): add the field diagram and hit-location pop-up

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Hit-location tracking toggle

**Files:**
- Modify: `apps/mobile/src/features/lineup/lineup-wizard.ts:49` and `buildGameStartPayload`
- Modify: `apps/mobile/src/features/lineup/__tests__/lineup-wizard.test.ts` (tracking objects at ~lines 90, 107, 129, 147; expectation at ~line 96)
- Modify: `apps/mobile/app/(tabs)/games/[gameId]/score.tsx` (tracking type at ~lines 1022, 1037, 3170; wizard state ~3180; toggles ~3253; `onSubmit` ~3371; `scoringConfig` ~600)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `BuildGameStartPayloadInput.tracking: { pitchType: boolean; pitchLocation: boolean; hitLocation: boolean }`
  - `buildGameStartPayload(...)` writes `hitLocationEnabled: boolean`
  - `scoringConfig.hitLocation: boolean` in `score.tsx` (consumed by Task 5)

- [ ] **Step 1: Write the failing test**

In `apps/mobile/src/features/lineup/__tests__/lineup-wizard.test.ts`, add `hitLocation` to every `tracking:` object literal in the file — the four at ~lines 90, 107, 129, 147. Use `hitLocation: false` in each so existing expectations are unaffected, and add `hitLocationEnabled: false,` to the `toMatchObject` at ~line 96 directly after `pitchLocationEnabled: false,`.

Then add this test inside the same `describe` that holds the ~line 85 test:

```ts
  it('writes hitLocationEnabled from the tracking choice', () => {
    const payload = buildGameStartPayload({
      isHome: false,
      pitcherId: 'pitcher-1',
      battingOrder: ['leadoff-player'],
      tracking: { pitchType: false, pitchLocation: false, hitLocation: true },
    });
    expect(payload).toMatchObject({ hitLocationEnabled: true });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter mobile exec jest src/features/lineup/__tests__/lineup-wizard.test.ts`
Expected: FAIL — the new test's payload has no `hitLocationEnabled`.

- [ ] **Step 3: Implement the payload change**

In `apps/mobile/src/features/lineup/lineup-wizard.ts`, change the `tracking` field of `BuildGameStartPayloadInput`:

```ts
  tracking: { pitchType: boolean; pitchLocation: boolean; hitLocation: boolean };
```

and in `buildGameStartPayload`, directly after `pitchLocationEnabled: input.tracking.pitchLocation,`:

```ts
    hitLocationEnabled: input.tracking.hitLocation,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter mobile exec jest src/features/lineup/__tests__/lineup-wizard.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the toggle through the scoring screen**

In `apps/mobile/app/(tabs)/games/[gameId]/score.tsx`:

(a) Replace all three occurrences of the tracking type (in `handleStartGame`, `startGameOnce`, and the `LineupSetupModal` props):

```ts
    tracking: { pitchType: boolean; pitchLocation: boolean },
```
with
```ts
    tracking: { pitchType: boolean; pitchLocation: boolean; hitLocation: boolean },
```

(b) In `LineupSetupModal`, directly after `const [trackPitchLocation, setTrackPitchLocation] = useState(false);`:

```ts
  // On by default: the coach asked for hit location, and Skip keeps a play
  // the scorer didn't see from costing more than one tap.
  const [trackHitLocation, setTrackHitLocation] = useState(true);
```

(c) Directly after the `Pitch location` `<TrackingToggle ... />` element:

```tsx
                <TrackingToggle
                  label="Hit location"
                  hint="Where each ball in play went, and who fielded it"
                  value={trackHitLocation}
                  onToggle={() => setTrackHitLocation((v) => !v)}
                />
```

(d) In the wizard's `onSubmit(pitcherId, battingOrder, { ... })` call, directly after `pitchLocation: trackPitchLocation,`:

```ts
                    hitLocation: trackHitLocation,
```

(e) In `scoringConfig`'s returned object, directly after `pitchLocation: gsp.pitchLocationEnabled !== false,`:

```ts
      hitLocation: gsp.hitLocationEnabled !== false,
```

- [ ] **Step 6: Verify the whole repo**

Run: `pnpm type-check && pnpm test`
Expected: type-check exits 0; all suites pass. (`scoringConfig.hitLocation` is unused until Task 5; that is not a type error.)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/lineup/lineup-wizard.ts apps/mobile/src/features/lineup/__tests__/lineup-wizard.test.ts "apps/mobile/app/(tabs)/games/[gameId]/score.tsx"
git commit -m "feat(mobile): add a hit-location tracking toggle to the lineup wizard

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the pop-up, throw step and payload fields into scoring

**Files:**
- Modify: `apps/mobile/src/features/scoring/PitchInput.tsx`
- Modify: `apps/mobile/app/(tabs)/games/[gameId]/score.tsx`
- Create: `apps/mobile/src/features/scoring/__tests__/pitch-input-hit-location.test.tsx`

**Interfaces:**
- Consumes: `requiresThrowStep`, `EventType`, `type BattedBall` (`@baseball/shared`, Task 1); `battedBallPayloadFields`, `createBattedBallSlot`, `type BattedBallPayloadFields` (Task 2); `ThrowSequenceModal` (Task 2); `FieldLocationModal` (Task 3); `scoringConfig.hitLocation` (Task 4).
- Produces: `PitchInputProps.trackHitLocation?: boolean`; `PitchInputProps.onBattedBall?: (fields: BattedBallPayloadFields) => void`; error-picker buttons carry `testID="error-position-<n>"` and `accessibilityState={{ selected }}`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/scoring/__tests__/pitch-input-hit-location.test.tsx`:

```tsx
import { render, fireEvent, screen } from '@testing-library/react-native';
import { PitchInput } from '../PitchInput';

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: { children?: unknown }) => React.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Rect: Stub, Path: Stub, Circle: Stub, Polygon: Stub, Line: Stub };
});

function noop() {}

/** Bases empty, nobody out: no sacrifice is possible, so an Out records straight through. */
function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    onRecordPitch: jest.fn(),
    onRecordHit: jest.fn(),
    onRecordOut: jest.fn(),
    onRecordStrikeout: noop,
    onRecordError: jest.fn(),
    onRecordCatcherInterference: jest.fn(),
    onRecordSacFly: noop,
    onRecordSacBunt: noop,
    onRecordFieldersChoice: noop,
    onRecordRunnerOut: noop,
    onRecordWildPitch: noop,
    onRecordPassedBall: noop,
    onRecordBalk: noop,
    onRecordDoublePlay: noop,
    onRecordTriplePlay: noop,
    onRecordPitchingChange: noop,
    onRecordPinchHitter: noop,
    roster: [],
    onUndoLastEvent: noop,
    runnersOnBase: [] as { base: 1 | 2 | 3; runnerId: string }[],
    sacFlyEligible: false,
    sacBuntEligible: false,
    doublePlayEligible: false,
    triplePlayEligible: false,
    sacEligibilityForTrajectory: () => ({ sacFly: false, sacBunt: false }),
    trackHitLocation: true,
    onBattedBall: jest.fn(),
    ...overrides,
  };
}

/** Presses the pressable ancestor of `label` — "Out" is both a group heading and a button. */
function pressButtonLabeled(label: string) {
  const pressable = screen.getAllByText(label).find((node) => {
    let el: typeof node.parent = node.parent;
    while (el) {
      if (typeof el.props?.onPress === 'function') return true;
      el = el.parent;
    }
    return false;
  });
  if (!pressable) throw new Error(`No pressable ancestor found for text "${label}"`);
  fireEvent.press(pressable);
}

/** In play → tap the shortstop's spot → Next. Leaves the outcome sheet open. */
function captureGrounderToShort() {
  fireEvent.press(screen.getByText('In play'));
  fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
    nativeEvent: { layout: { width: 240, height: 200 } },
  });
  // (99, 98) in the 240×200 drawing is spray (0.36, 0.58).
  fireEvent.press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: 99, locationY: 98 } });
  fireEvent.press(screen.getByText('Next'));
}

describe('PitchInput hit location', () => {
  it('should go straight to the outcome sheet when the game does not track hit location', () => {
    render(<PitchInput {...baseProps({ trackHitLocation: false })} />);
    fireEvent.press(screen.getByText('In play'));
    expect(screen.queryByText('Where did it go?')).toBeNull();
    expect(screen.getByText('What happened to the batter?')).toBeTruthy();
  });

  it('should record a 6-3 groundout: location first, then the throw, then the out', () => {
    const calls: string[] = [];
    const onBattedBall = jest.fn(() => calls.push('battedBall'));
    const onRecordOut = jest.fn(() => calls.push('out'));
    render(<PitchInput {...baseProps({ onBattedBall, onRecordOut })} />);

    captureGrounderToShort();
    pressButtonLabeled('Out');
    fireEvent.press(screen.getByText('Groundout'));
    expect(onRecordOut).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('throw-position-3'));
    fireEvent.press(screen.getByTestId('throw-done'));

    expect(onBattedBall).toHaveBeenCalledWith({
      sprayX: expect.closeTo(0.36, 6),
      sprayY: expect.closeTo(0.58, 6),
      fieldingSequence: [6, 3],
    });
    expect(onRecordOut).toHaveBeenCalledWith('groundout');
    expect(calls).toEqual(['battedBall', 'out']);
  });

  it('should record the first fielder on a hit without asking for throws', () => {
    const onBattedBall = jest.fn();
    const onRecordHit = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall, onRecordHit })} />);

    captureGrounderToShort();
    fireEvent.press(screen.getByText('1B'));

    expect(screen.queryByTestId('throw-done')).toBeNull();
    expect(onBattedBall).toHaveBeenCalledWith(expect.objectContaining({ fieldingSequence: [6] }));
    expect(onRecordHit).toHaveBeenCalled();
  });

  it('should record no batted-ball fields when the scorer skips', () => {
    const onBattedBall = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall })} />);

    fireEvent.press(screen.getByText('In play'));
    fireEvent.press(screen.getByText('Skip'));
    fireEvent.press(screen.getByText('1B'));

    expect(onBattedBall).toHaveBeenCalledWith({});
  });

  it('should discard a captured location on a hit batsman and not carry it to the next play', () => {
    const onBattedBall = jest.fn();
    const onRecordPitch = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall, onRecordPitch })} />);

    captureGrounderToShort();
    fireEvent.press(screen.getByText('Hit by pitch'));
    expect(onRecordPitch).toHaveBeenCalled();
    expect(onBattedBall).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('In play'));
    fireEvent.press(screen.getByText('Skip'));
    fireEvent.press(screen.getByText('1B'));
    expect(onBattedBall).toHaveBeenCalledTimes(1);
    expect(onBattedBall).toHaveBeenCalledWith({});
  });

  it('should pre-select the first fielder in the error picker', () => {
    render(<PitchInput {...baseProps()} />);

    captureGrounderToShort();
    pressButtonLabeled('Error');

    expect(screen.getByTestId('error-position-6').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('error-position-5').props.accessibilityState).toEqual({ selected: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter mobile exec jest src/features/scoring/__tests__/pitch-input-hit-location.test.tsx`
Expected: FAIL — `Where did it go?` is never shown (In play opens the sheet directly) / `Unable to find an element with testID: field-diagram-frame`.

- [ ] **Step 3: Implement in `PitchInput.tsx`**

(a) Imports. Change the `@baseball/shared` value import to add `EventType` and `requiresThrowStep`, and add `BattedBall` to the type import:

```ts
import { HitType, PitchOutcome, PitchType, HitTrajectory, hitRunnerOptions, evaluateHitRunnerOutcomes, EventType, requiresThrowStep } from '@baseball/shared';
import type { DefensiveLineup, DroppedThirdStrikeOutcome, SacrificeEligibility, BattedBall } from '@baseball/shared';
```

and add below the existing local imports:

```ts
import { FieldLocationModal } from './FieldLocationModal';
import { ThrowSequenceModal } from './ThrowSequenceModal';
import { battedBallPayloadFields, type BattedBallPayloadFields } from './batted-ball-fields';
```

(b) Props. In `interface PitchInputProps`, directly after `trackPitchLocation?: boolean;`:

```ts
  /** Show the field pop-up on In play (the game's GAME_START hitLocationEnabled). */
  trackHitLocation?: boolean;
  /**
   * Receives the batted-ball payload fields immediately before any in-play
   * terminal handler is invoked — {} when nothing was captured, so the
   * receiver never holds a previous play's location.
   */
  onBattedBall?: (fields: BattedBallPayloadFields) => void;
```

and in the component's destructured props, directly after `trackPitchLocation = false,`:

```ts
  trackHitLocation = false,
  onBattedBall,
```

(c) State. Directly after `const [showInPlaySheet, setShowInPlaySheet] = useState(false);`:

```ts
  // Hit location: the field pop-up, what it captured for the current in-play
  // flow, and a throw step waiting to finish recording an out.
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [battedBall, setBattedBall] = useState<BattedBall | null>(null);
  const [pendingThrow, setPendingThrow] = useState<null | {
    firstFielder: number;
    finish: (throws: number[]) => void;
  }>(null);
```

(d) Helpers. Directly after the `runFromSheet` function:

```ts
  // In play starts a fresh flow: whatever the last flow captured is dropped
  // before the pop-up (or the sheet, when location isn't tracked) opens.
  function openInPlay() {
    setBattedBall(null);
    if (trackHitLocation) setShowFieldModal(true);
    else setShowInPlaySheet(true);
  }

  function continueFromField(captured: BattedBall | null) {
    setBattedBall(captured);
    setShowFieldModal(false);
    setShowInPlaySheet(true);
  }

  // Every in-play terminal handler is invoked through here. It hands the
  // captured batted ball to the receiver first — or {} when there is none —
  // and, for outs with a known first fielder, asks for the throws before
  // recording. The capture is consumed either way.
  function commitInPlay(terminal: EventType, record: () => void) {
    const captured = battedBall;
    setBattedBall(null);
    if (captured && captured.firstFielder !== null && requiresThrowStep(terminal)) {
      setPendingThrow({
        firstFielder: captured.firstFielder,
        finish: (throws) => {
          onBattedBall?.(battedBallPayloadFields(captured, throws));
          record();
        },
      });
      return;
    }
    onBattedBall?.(battedBallPayloadFields(captured));
    record();
  }

  // HBP and catcher's interference aren't batted balls: nothing to locate.
  function discardBattedBall() {
    setBattedBall(null);
  }
```

(e) Route each terminal call through `commitInPlay`. Make exactly these replacements:

| Location | Before | After |
|---|---|---|
| `handleErrorPick` | `onRecordError(errorBy);` | `commitInPlay(EventType.FIELD_ERROR, () => onRecordError(errorBy));` |
| `handleDPTap` | `onRecordDoublePlay(null);` | `commitInPlay(EventType.DOUBLE_PLAY, () => onRecordDoublePlay(null));` |
| `handleDPPick` | `onRecordDoublePlay({ runnerId, base });` | `commitInPlay(EventType.DOUBLE_PLAY, () => onRecordDoublePlay({ runnerId, base }));` |
| `handleFCPick` | `onRecordFieldersChoice(runnerId, fromBase);` | `commitInPlay(EventType.HIT, () => onRecordFieldersChoice(runnerId, fromBase));` |
| `handleHitTap` (no-prompt path) | `onRecordHit(hitType);` | `commitInPlay(EventType.HIT, () => onRecordHit(hitType));` |
| `handleOutPick` (direct path) | `onRecordOut(outType);` | `commitInPlay(EventType.OUT, () => onRecordOut(outType));` |
| `confirmRegularOut` | `onRecordOut(t);` | `commitInPlay(EventType.OUT, () => onRecordOut(t));` |
| `confirmSacFlyFromOut` | `if (onRecordSacFlyFromOut) onRecordSacFlyFromOut(t);`<br>`else onRecordSacFly();` | `commitInPlay(EventType.SACRIFICE_FLY, () => (onRecordSacFlyFromOut ? onRecordSacFlyFromOut(t) : onRecordSacFly()));` |
| `confirmSacBuntFromOut` | `if (onRecordSacBuntFromOut) onRecordSacBuntFromOut(t);`<br>`else onRecordSacBunt();` | `commitInPlay(EventType.SACRIFICE_BUNT, () => (onRecordSacBuntFromOut ? onRecordSacBuntFromOut(t) : onRecordSacBunt()));` |
| Sheet "Sac Fly" button `onPress` | `runFromSheet(setShowInPlaySheet, onRecordSacFly)` | `runFromSheet(setShowInPlaySheet, () => commitInPlay(EventType.SACRIFICE_FLY, onRecordSacFly))` |
| Sheet "Sac Bunt" button `onPress` | `runFromSheet(setShowInPlaySheet, onRecordSacBunt)` | `runFromSheet(setShowInPlaySheet, () => commitInPlay(EventType.SACRIFICE_BUNT, onRecordSacBunt))` |
| Sheet "Triple Play" button `onPress` | `runFromSheet(setShowInPlaySheet, onRecordTriplePlay)` | `runFromSheet(setShowInPlaySheet, () => commitInPlay(EventType.TRIPLE_PLAY, onRecordTriplePlay))` |
| Sheet "Hit by pitch" button `onPress` | `runFromSheet(setShowInPlaySheet, () => handlePitchOutcome(PitchOutcome.HIT_BY_PITCH))` | `runFromSheet(setShowInPlaySheet, () => { discardBattedBall(); handlePitchOutcome(PitchOutcome.HIT_BY_PITCH); })` |
| Sheet "Catcher Int." button `onPress` | `runFromSheet(setShowInPlaySheet, onRecordCatcherInterference)` | `runFromSheet(setShowInPlaySheet, () => { discardBattedBall(); onRecordCatcherInterference(); })` |

In `confirmHitWithRunners`, replace:

```ts
    const outcomes = Object.values(runnerOutcomeChoices);
    onRecordHitWithRunnerOutcomes(pendingHitWithRunners, outcomes);
```
with
```ts
    const outcomes = Object.values(runnerOutcomeChoices);
    const hitType = pendingHitWithRunners;
    const recordWithOutcomes = onRecordHitWithRunnerOutcomes;
    commitInPlay(EventType.HIT, () => recordWithOutcomes(hitType, outcomes));
```

(f) In play button. Change the `PrimaryAction` labelled `In play`:

```tsx
          onPress={() => setShowInPlaySheet(true)}
```
to
```tsx
          onPress={openInPlay}
```

(g) Error picker pre-selection. In the error modal, replace the `FIELDER_POSITIONS.map(...)` button:

```tsx
                <TouchableOpacity
                  key={position}
                  className="bg-white border border-slate-300 rounded-xl px-4 py-3"
                  onPress={() => handleErrorPick(position)}
                >
```
with
```tsx
                <TouchableOpacity
                  key={position}
                  testID={`error-position-${position}`}
                  accessibilityState={{ selected: battedBall?.firstFielder === position }}
                  className={`border rounded-xl px-4 py-3 ${battedBall?.firstFielder === position ? 'bg-blue-50 border-blue-600' : 'bg-white border-slate-300'}`}
                  onPress={() => handleErrorPick(position)}
                >
```

(h) Render the two new modals. Directly before the closing `</View>` of the component's root (immediately after the runner-outcomes `</Modal>`):

```tsx
      <FieldLocationModal
        visible={showFieldModal}
        onNext={(captured) => continueFromField(captured)}
        onSkip={() => continueFromField(null)}
      />

      <ThrowSequenceModal
        visible={pendingThrow !== null}
        firstFielder={pendingThrow?.firstFielder ?? null}
        onDone={(throws) => {
          const pending = pendingThrow;
          setPendingThrow(null);
          pending?.finish(throws);
        }}
      />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter mobile exec jest src/features/scoring/__tests__/pitch-input-hit-location.test.tsx`
Expected: PASS — all six tests.

- [ ] **Step 5: Attach the fields in `score.tsx`**

In `apps/mobile/app/(tabs)/games/[gameId]/score.tsx`:

(a) Import, next to the other `src/features/scoring` imports:

```ts
import { createBattedBallSlot } from '../../../../src/features/scoring/batted-ball-fields';
```

(b) Directly above `const withInPlayPitch = useMemo(`:

```ts
  // Batted-ball fields handed over by PitchInput immediately before an in-play
  // handler runs; each handler takes them into its payload, which empties the
  // slot. Cleared on every non-in-play pitch too, so a location from an
  // abandoned flow can never attach to a later play.
  const battedBallSlot = useRef(createBattedBallSlot()).current;
```

(c) Spread `...battedBallSlot.take(),` into the payload of each in-play handler, on the line directly after `...halfAttribution,`, in exactly these functions: `handleHit`, `handleHitWithRunnerOutcomes` (the `HitPayload`), `handleOut`, `handleError`, `handleSacrificeFly`, `handleSacrificeBunt`, `handleSacrificeFlyFromOut`, `handleSacrificeBuntFromOut`, `handleFieldersChoice` (the `hitPayload`, not the `BASERUNNER_OUT`), `handleDoublePlay`, `handleTriplePlay`. Each function takes the slot exactly once.

(d) In `handlePitch`, directly after `if (!gameState) return;`:

```ts
    battedBallSlot.clear();
```

and in `handleCatcherInterference`, directly after `if (!gameState) return;`:

```ts
    battedBallSlot.clear();
```

(e) On the `<PitchInput` element, directly after `trackPitchType={scoringConfig.pitchType}`:

```tsx
        trackHitLocation={scoringConfig.hitLocation}
        onBattedBall={battedBallSlot.set}
```

- [ ] **Step 6: Verify the whole repo**

Run: `pnpm type-check && pnpm test`
Expected: type-check exits 0; all suites pass, including the existing `pitch-input-*` suites (they omit `trackHitLocation`, which defaults to false, so In play still opens the sheet directly).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/scoring/PitchInput.tsx "apps/mobile/app/(tabs)/games/[gameId]/score.tsx" apps/mobile/src/features/scoring/__tests__/pitch-input-hit-location.test.tsx
git commit -m "feat(mobile): record where a ball in play went and who fielded it

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Device build and manual verification (controller-run)

No subagent. This task writes to prod, under the shakedown protocol.

- [ ] **Step 1: Rebuild the native app** (react-native-svg is a native module; a reload is not enough)

Run from `apps/mobile`: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pnpm exec expo run:ios --device 00008130-000970500193803A`
Expected: `Build Succeeded`, installed. If `ENABLE_USER_SCRIPT_SANDBOXING` or `DEVELOPMENT_TEAM` were lost to a prebuild, restore them (`NO`, `MF923A7QPD`) in `ios/BaseballCoaches.xcodeproj/project.pbxproj` and rebuild.

- [ ] **Step 2: Score plays on the shakedown game** (`842151c0-b385-4ae6-adc5-d297aeab3b82`, opponent `SHAKEDOWN phase2 - do not use`)

The coach scores, in landscape: a single fielded by CF; a 6-3 groundout; a caught fly to LF (Done with one fielder); a home run with the fielder cleared; one play Skipped; a hit batsman after placing a location.

- [ ] **Step 3: Verify the recorded payloads**

```sql
select sequence_number, event_type, payload->'sprayX' as x, payload->'sprayY' as y, payload->'fieldingSequence' as seq
from game_events where game_id = '842151c0-b385-4ae6-adc5-d297aeab3b82'
order by sequence_number desc limit 20;
```

Expected: the single `seq [8]`; the groundout `seq [6,3]`; the fly `seq [7]`; the home run with `x`/`y` and no `seq`; the skipped play and the hit batsman with no `x`, `y` or `seq`.

- [ ] **Step 4: Report** tap accuracy and marker size on the iPad mini, and whether a skip-heavy half-inning stayed fast. Watch specifically that the outcome sheet actually appears after Next / Skip, and the throw step after picking an out: each closes one iOS modal and opens another in the same tick. The app already does this (sheet → Out modal), but if a second modal ever fails to present, that is the cause. Delete the shakedown game and its events only at the end of the full regression pass, scoped by its id.

---

## Revision 1 — outcome first, field immediately after (Tasks 7–9)

The first device test reversed the flow (spec "Revision 1"). **Tap an outcome; the field comes next**, for every batted ball. Follow-up detail (out type, runner outcomes, the FC/DP runner, the error position) comes after the field. A home run shows the field with no fielder markers and records no fielder. Hit by pitch and catcher's interference never open the field. Tasks 1–5 stand; Task 6's device check is superseded by Task 9.

**Additional global constraints for Tasks 7–9:**
- The field pop-up opens immediately after a batted-ball outcome button is tapped: 1B, 2B, 3B, HR, Out, Sac Fly, Sac Bunt, Double Play, Triple Play, Error, Fielder's Choice. Never for Hit by pitch or Catcher Int.
- A home run records `sprayX` / `sprayY` and never `fieldingSequence`.
- The captured batted ball must be readable by `commitInPlay` in the same tick it is captured: an outcome that records immediately after Next (a home run, a single with the bases empty, a sac fly, a triple play) must still record its location.

---

### Task 7: Home runs show no fielders

**Files:**
- Modify: `apps/mobile/src/features/scoring/FieldDiagram.tsx`
- Modify: `apps/mobile/src/features/scoring/FieldLocationModal.tsx`
- Modify: `apps/mobile/src/features/scoring/__tests__/FieldLocationModal.test.tsx` (append)

**Interfaces:**
- Consumes: existing `FieldDiagram`, `FieldLocationModal`, `nearestFielder`.
- Produces:
  - `FieldDiagram` gains `showFielders?: boolean` (default `true`); when `false`, no `fielder-marker-<n>` renders.
  - `FieldLocationModal` gains `fielderApplies?: boolean` (default `true`); when `false`, no marker renders, no fielder is ever selected, and `onNext` always emits `firstFielder: null`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/mobile/src/features/scoring/__tests__/FieldLocationModal.test.tsx`. This file already defines `press`, `tapField`, fake timers, and the `react-native-svg` mock — use them.

```tsx
describe('FieldDiagram without fielders', () => {
  it('should render no fielder markers when fielders are not shown', () => {
    render(
      <FieldDiagram
        location={null}
        selectedFielder={null}
        showFielders={false}
        onPlaceBall={jest.fn()}
        onPressFielder={jest.fn()}
      />,
    );
    fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
      nativeEvent: { layout: { width: 240, height: 200 } },
    });
    expect(screen.queryByTestId('fielder-marker-8')).toBeNull();
  });
});

describe('FieldLocationModal for a home run', () => {
  it('should record the location with no fielder and offer no fielder markers', () => {
    const onNext = jest.fn();
    render(<FieldLocationModal visible fielderApplies={false} onNext={onNext} onSkip={jest.fn()} />);
    tapField(120, 10);
    expect(screen.queryByTestId('fielder-marker-8')).toBeNull();
    press(screen.getByText('Next'));
    expect(onNext).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1, firstFielder: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/mobile`): `pnpm exec jest src/features/scoring/__tests__/FieldLocationModal.test.tsx`
Expected: FAIL — `fielder-marker-8` is found (markers still render) / `firstFielder: 8` instead of `null`. TypeScript may also reject the unknown props; either failure is the expected RED.

- [ ] **Step 3: Implement**

In `FieldDiagram.tsx`, add `showFielders = true,` to the destructured props directly after `onPressFielder,`, and to the props type directly after `onPressFielder: (position: number) => void;`:

```ts
  /** False on a home run: nobody fielded it, so there is nobody to pick. */
  showFielders?: boolean;
```

and change the marker render guard

```tsx
      {size.width > 0 &&
```
to
```tsx
      {showFielders && size.width > 0 &&
```

In `FieldLocationModal.tsx`:

(a) Add the prop. Change the destructured props to

```tsx
export function FieldLocationModal({
  visible,
  fielderApplies = true,
  onNext,
  onSkip,
}: {
  visible: boolean;
  /** False for a home run: location only, no fielder offered or recorded. */
  fielderApplies?: boolean;
  onNext: (battedBall: BattedBall) => void;
  onSkip: () => void;
}) {
```

(b) Replace `placeBall` and `next`:

```tsx
  function placeBall(point: { sprayX: number; sprayY: number }) {
    setLocation(point);
    setFielder(fielderApplies ? nearestFielder(point.sprayX, point.sprayY) : null);
  }
```
```tsx
  function next() {
    if (!location) return;
    onNext({ ...location, firstFielder: fielderApplies ? fielder : null });
  }
```

(c) Replace the prompt text

```tsx
            {location
              ? 'Tap a fielder to change who touched it first.'
              : 'Tap where the ball landed or was fielded.'}
```
with
```tsx
            {!fielderApplies
              ? 'Tap where the ball left the park.'
              : location
                ? 'Tap a fielder to change who touched it first.'
                : 'Tap where the ball landed or was fielded.'}
```

(d) Pass the flag to the diagram — add `showFielders={fielderApplies}` to the `<FieldDiagram` element.

Update the component's doc comment's last sentence to: `On a home run there is no fielder to pick: fielderApplies={false} hides the markers and records location only.`

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/mobile`): `pnpm exec jest src/features/scoring/__tests__/FieldLocationModal.test.tsx`
Expected: PASS, with no `act()` warnings.

- [ ] **Step 5: Verify the whole repo**

Run: `pnpm type-check && pnpm test`
Expected: type-check exits 0; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/scoring/FieldDiagram.tsx apps/mobile/src/features/scoring/FieldLocationModal.tsx apps/mobile/src/features/scoring/__tests__/FieldLocationModal.test.tsx
git commit -m "feat(mobile): record location only, with no fielder, on a home run

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Open the field immediately after the outcome

**Files:**
- Modify: `apps/mobile/src/features/scoring/PitchInput.tsx`
- Rewrite: `apps/mobile/src/features/scoring/__tests__/pitch-input-hit-location.test.tsx`

**Interfaces:**
- Consumes: `FieldLocationModal` with `fielderApplies` (Task 7); `commitInPlay`, `battedBallPayloadFields`, `ThrowSequenceModal`, `requiresThrowStep` (Tasks 2 and 5, already wired).
- Produces: no new exports. `PitchInputProps` is unchanged (`trackHitLocation`, `onBattedBall` stay). `score.tsx` is not touched.

- [ ] **Step 1: Rewrite the test for the new flow**

Replace the entire contents of `apps/mobile/src/features/scoring/__tests__/pitch-input-hit-location.test.tsx` with:

```tsx
import { render, fireEvent, screen } from '@testing-library/react-native';
import { HitType } from '@baseball/shared';
import { PitchInput } from '../PitchInput';

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: { children?: unknown }) => React.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Rect: Stub, Path: Stub, Circle: Stub, Polygon: Stub, Line: Stub };
});

function noop() {}

/** Bases empty, nobody out: no sacrifice is possible, so an Out records straight through. */
function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    onRecordPitch: jest.fn(),
    onRecordHit: jest.fn(),
    onRecordOut: jest.fn(),
    onRecordStrikeout: noop,
    onRecordError: jest.fn(),
    onRecordCatcherInterference: jest.fn(),
    onRecordSacFly: noop,
    onRecordSacBunt: noop,
    onRecordFieldersChoice: noop,
    onRecordRunnerOut: noop,
    onRecordWildPitch: noop,
    onRecordPassedBall: noop,
    onRecordBalk: noop,
    onRecordDoublePlay: noop,
    onRecordTriplePlay: noop,
    onRecordPitchingChange: noop,
    onRecordPinchHitter: noop,
    roster: [],
    onUndoLastEvent: noop,
    runnersOnBase: [] as { base: 1 | 2 | 3; runnerId: string }[],
    sacFlyEligible: false,
    sacBuntEligible: false,
    doublePlayEligible: false,
    triplePlayEligible: false,
    sacEligibilityForTrajectory: () => ({ sacFly: false, sacBunt: false }),
    trackHitLocation: true,
    onBattedBall: jest.fn(),
    ...overrides,
  };
}

/** Presses the pressable ancestor of `label` — "Out" and "Error" are both group headings or titles and buttons. */
function pressButtonLabeled(label: string) {
  const pressable = screen.getAllByText(label).find((node) => {
    let el: typeof node.parent = node.parent;
    while (el) {
      if (typeof el.props?.onPress === 'function') return true;
      el = el.parent;
    }
    return false;
  });
  if (!pressable) throw new Error(`No pressable ancestor found for text "${label}"`);
  fireEvent.press(pressable);
}

/** Lays the field out at the drawing's own size and taps a point in it. */
function tapField(x: number, y: number) {
  fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
    nativeEvent: { layout: { width: 240, height: 200 } },
  });
  fireEvent.press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: x, locationY: y } });
}

/** (99, 98) in the 240×200 drawing is spray (0.36, 0.58): the shortstop's spot. Then Next. */
function placeAtShortAndContinue() {
  tapField(99, 98);
  fireEvent.press(screen.getByText('Next'));
}

describe('PitchInput hit location — outcome first', () => {
  it('should open the outcome sheet, not the field, on In play', () => {
    render(<PitchInput {...baseProps()} />);
    fireEvent.press(screen.getByText('In play'));
    expect(screen.getByText('What happened to the batter?')).toBeTruthy();
    expect(screen.queryByText('Where did it go?')).toBeNull();
  });

  it('should open no field and record no location when the game does not track hit location', () => {
    const onBattedBall = jest.fn();
    const onRecordHit = jest.fn();
    render(<PitchInput {...baseProps({ trackHitLocation: false, onBattedBall, onRecordHit })} />);
    fireEvent.press(screen.getByText('In play'));
    fireEvent.press(screen.getByText('1B'));
    expect(screen.queryByText('Where did it go?')).toBeNull();
    expect(onBattedBall).toHaveBeenCalledWith({});
    expect(onRecordHit).toHaveBeenCalledWith(HitType.SINGLE);
  });

  it('should open the field immediately after Out, before the out type, and record a 6-3 groundout', () => {
    const calls: string[] = [];
    const onBattedBall = jest.fn(() => calls.push('battedBall'));
    const onRecordOut = jest.fn(() => calls.push('out'));
    render(<PitchInput {...baseProps({ onBattedBall, onRecordOut })} />);

    fireEvent.press(screen.getByText('In play'));
    pressButtonLabeled('Out');
    expect(screen.getByText('Where did it go?')).toBeTruthy();
    expect(screen.queryByText('Groundout')).toBeNull();

    placeAtShortAndContinue();
    fireEvent.press(screen.getByText('Groundout'));
    expect(onRecordOut).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('throw-position-3'));
    fireEvent.press(screen.getByTestId('throw-done'));

    expect(onBattedBall).toHaveBeenCalledWith({
      sprayX: expect.closeTo(0.36, 6),
      sprayY: expect.closeTo(0.58, 6),
      fieldingSequence: [6, 3],
    });
    expect(onRecordOut).toHaveBeenCalledWith('groundout');
    expect(calls).toEqual(['battedBall', 'out']);
  });

  it('should record a home run location with no fielder and offer no fielders', () => {
    const onBattedBall = jest.fn();
    const onRecordHit = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall, onRecordHit })} />);

    fireEvent.press(screen.getByText('In play'));
    fireEvent.press(screen.getByText('HR'));
    tapField(120, 10);
    expect(screen.queryByTestId('fielder-marker-8')).toBeNull();
    fireEvent.press(screen.getByText('Next'));

    // A home run records the moment Next is tapped: this fails if the capture
    // is read from stale state rather than from where Next just put it.
    expect(onBattedBall).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1 });
    expect(onRecordHit).toHaveBeenCalledWith(HitType.HOME_RUN);
  });

  it('should record the first fielder on a single with the bases empty, without a throw step', () => {
    const onBattedBall = jest.fn();
    const onRecordHit = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall, onRecordHit })} />);

    fireEvent.press(screen.getByText('In play'));
    fireEvent.press(screen.getByText('1B'));
    placeAtShortAndContinue();

    expect(screen.queryByTestId('throw-done')).toBeNull();
    expect(onBattedBall).toHaveBeenCalledWith(expect.objectContaining({ fieldingSequence: [6] }));
    expect(onRecordHit).toHaveBeenCalledWith(HitType.SINGLE);
  });

  it('should record no batted-ball fields when the scorer skips', () => {
    const onBattedBall = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall })} />);

    fireEvent.press(screen.getByText('In play'));
    fireEvent.press(screen.getByText('1B'));
    fireEvent.press(screen.getByText('Skip'));

    expect(onBattedBall).toHaveBeenCalledWith({});
  });

  it('should never open the field for a hit batsman', () => {
    const onBattedBall = jest.fn();
    const onRecordPitch = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall, onRecordPitch })} />);

    fireEvent.press(screen.getByText('In play'));
    fireEvent.press(screen.getByText('Hit by pitch'));

    expect(screen.queryByText('Where did it go?')).toBeNull();
    expect(onRecordPitch).toHaveBeenCalled();
    expect(onBattedBall).not.toHaveBeenCalled();
  });

  it('should pre-select the field pop-up fielder in the error picker', () => {
    render(<PitchInput {...baseProps()} />);

    fireEvent.press(screen.getByText('In play'));
    pressButtonLabeled('Error');
    placeAtShortAndContinue();

    expect(screen.getByTestId('error-position-6').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('error-position-5').props.accessibilityState).toEqual({ selected: false });
  });

  it('should not carry a location from a play abandoned at the out type to the next play', () => {
    const onBattedBall = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall })} />);

    fireEvent.press(screen.getByText('In play'));
    pressButtonLabeled('Out');
    placeAtShortAndContinue();
    fireEvent.press(screen.getByText('Cancel'));

    fireEvent.press(screen.getByText('In play'));
    fireEvent.press(screen.getByText('1B'));
    fireEvent.press(screen.getByText('Skip'));

    expect(onBattedBall).toHaveBeenCalledTimes(1);
    expect(onBattedBall).toHaveBeenCalledWith({});
  });
});
```

If this file prints `act()` warnings, apply the pattern already used in `FieldLocationModal.test.tsx` (fake timers in `beforeEach`, flush pending timers inside `act()` in `afterEach` and after each press). Keep every assertion.

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/mobile`): `pnpm exec jest src/features/scoring/__tests__/pitch-input-hit-location.test.tsx`
Expected: FAIL — "should open the outcome sheet, not the field, on In play" fails because In play still opens `Where did it go?`.

- [ ] **Step 3: Implement in `PitchInput.tsx`**

(a) Replace the state block

```ts
  // Hit location: the field pop-up, what it captured for the current in-play
  // flow, and a throw step waiting to finish recording an out.
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [battedBall, setBattedBall] = useState<BattedBall | null>(null);
```
with
```ts
  // Hit location. The field pop-up request for the outcome just tapped —
  // whether a fielder applies (not on a home run) and that outcome's own next
  // step — and what the pop-up captured for the play in progress.
  //
  // The capture is a ref, not state: Next stores it and runs the outcome's
  // next step in the same tick, and an outcome that records immediately (a
  // home run, a single with the bases empty, a sac fly) reaches commitInPlay
  // before any re-render, where state would still read null.
  const [fieldRequest, setFieldRequest] = useState<null | {
    fielderApplies: boolean;
    proceed: () => void;
  }>(null);
  const battedBallRef = useRef<BattedBall | null>(null);
```

(leave the `pendingThrow` state that follows unchanged).

(b) Replace `openInPlay`, `continueFromField`, `commitInPlay`'s first two lines, and `discardBattedBall`. The block

```ts
  // In play starts a fresh flow: whatever the last flow captured is dropped
  // before the pop-up (or the sheet, when location isn't tracked) opens.
  function openInPlay() {
    setBattedBall(null);
    if (trackHitLocation) setShowFieldModal(true);
    else setShowInPlaySheet(true);
  }

  function continueFromField(captured: BattedBall | null) {
    setBattedBall(captured);
    setShowFieldModal(false);
    setShowInPlaySheet(true);
  }
```
becomes
```ts
  // In play starts a fresh play: whatever an abandoned play captured is
  // dropped, so it can never attach to this one.
  function openInPlay() {
    battedBallRef.current = null;
    setShowInPlaySheet(true);
  }

  // Every batted-ball outcome button goes through here: the field comes next,
  // at the same moment for every play, then the outcome's own next step.
  function chooseBattedBall(proceed: () => void, options: { fielderApplies?: boolean } = {}) {
    battedBallRef.current = null;
    if (!trackHitLocation) {
      proceed();
      return;
    }
    setFieldRequest({ fielderApplies: options.fielderApplies ?? true, proceed });
  }

  function continueFromField(captured: BattedBall | null) {
    const request = fieldRequest;
    setFieldRequest(null);
    battedBallRef.current = captured;
    request?.proceed();
  }
```

In `commitInPlay`, replace

```ts
    const captured = battedBall;
    setBattedBall(null);
```
with
```ts
    const captured = battedBallRef.current;
    battedBallRef.current = null;
```

and replace `discardBattedBall`'s body `setBattedBall(null);` with `battedBallRef.current = null;`.

(c) Route each batted-ball outcome button through `chooseBattedBall`. In the In play sheet, make exactly these `onPress` replacements:

| Button | Before | After |
|---|---|---|
| Hit (`HIT_TYPES.map`) | `() => runFromSheet(setShowInPlaySheet, () => handleHitTap(hitType))` | `() => runFromSheet(setShowInPlaySheet, () => chooseBattedBall(() => handleHitTap(hitType), { fielderApplies: hitType !== HitType.HOME_RUN }))` |
| Out | `() => runFromSheet(setShowInPlaySheet, () => setShowOutModal(true))` | `() => runFromSheet(setShowInPlaySheet, () => chooseBattedBall(() => setShowOutModal(true)))` |
| Sac Fly | `() => runFromSheet(setShowInPlaySheet, () => commitInPlay(EventType.SACRIFICE_FLY, onRecordSacFly))` | `() => runFromSheet(setShowInPlaySheet, () => chooseBattedBall(() => commitInPlay(EventType.SACRIFICE_FLY, onRecordSacFly)))` |
| Sac Bunt | `() => runFromSheet(setShowInPlaySheet, () => commitInPlay(EventType.SACRIFICE_BUNT, onRecordSacBunt))` | `() => runFromSheet(setShowInPlaySheet, () => chooseBattedBall(() => commitInPlay(EventType.SACRIFICE_BUNT, onRecordSacBunt)))` |
| Double Play | `() => runFromSheet(setShowInPlaySheet, handleDPTap)` | `() => runFromSheet(setShowInPlaySheet, () => chooseBattedBall(handleDPTap))` |
| Triple Play | `() => runFromSheet(setShowInPlaySheet, () => commitInPlay(EventType.TRIPLE_PLAY, onRecordTriplePlay))` | `() => runFromSheet(setShowInPlaySheet, () => chooseBattedBall(() => commitInPlay(EventType.TRIPLE_PLAY, onRecordTriplePlay)))` |
| Error | `() => runFromSheet(setShowInPlaySheet, () => setShowErrorModal(true))` | `() => runFromSheet(setShowInPlaySheet, () => chooseBattedBall(() => setShowErrorModal(true)))` |
| Fielder's Choice | `() => runFromSheet(setShowInPlaySheet, () => setShowFCModal(true))` | `() => runFromSheet(setShowInPlaySheet, () => chooseBattedBall(() => setShowFCModal(true)))` |

Hit by pitch and Catcher Int. are unchanged.

(d) Error picker: replace both occurrences of `battedBall?.firstFielder` with `battedBallRef.current?.firstFielder`.

(e) Replace the modal element

```tsx
      <FieldLocationModal
        visible={showFieldModal}
        onNext={(captured) => continueFromField(captured)}
        onSkip={() => continueFromField(null)}
      />
```
with
```tsx
      <FieldLocationModal
        visible={fieldRequest !== null}
        fielderApplies={fieldRequest?.fielderApplies ?? true}
        onNext={(captured) => continueFromField(captured)}
        onSkip={() => continueFromField(null)}
      />
```

After these edits, `grep -n "setBattedBall\|showFieldModal\|setShowFieldModal" apps/mobile/src/features/scoring/PitchInput.tsx` must print nothing.

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/mobile`): `pnpm exec jest src/features/scoring/__tests__/pitch-input-hit-location.test.tsx`
Expected: PASS — all nine tests, no `act()` warnings.

- [ ] **Step 5: Verify the whole repo**

Run: `pnpm type-check && pnpm test`
Expected: type-check exits 0; all suites pass, including the unchanged `pitch-input-*` suites.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/scoring/PitchInput.tsx apps/mobile/src/features/scoring/__tests__/pitch-input-hit-location.test.tsx
git commit -m "feat(mobile): open the field immediately after the outcome, for every batted ball

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Device verification (controller-run, supersedes Task 6)

No subagent. Writes to prod under the shakedown protocol.

- [ ] **Step 1: Reload** — JavaScript-only change since Task 6's native build: relaunch the app. Metro must be running with `NODE_OPTIONS=--unhandled-rejections=warn` (Node 25 otherwise crashes on the pnpm HMR entry-path rejection).

- [ ] **Step 2: The coach scores, in landscape, on the shakedown game** (`842151c0-b385-4ae6-adc5-d297aeab3b82`): a single fielded by CF; a 6-3 groundout; a caught fly to LF; a home run; one Skipped play; a hit batsman; an error charged to SS.

- [ ] **Step 3: Verify the recorded payloads**

```sql
select sequence_number, event_type, payload->>'hitType' as hit, payload->'sprayX' as x, payload->'sprayY' as y, payload->'fieldingSequence' as seq, payload->'errorBy' as err
from game_events where game_id = '842151c0-b385-4ae6-adc5-d297aeab3b82'
order by sequence_number desc limit 30;
```

Expected: the single `seq [8]`; the groundout `[6,3]`; the fly `[7]`; the home run with `x`/`y` and **no** `seq`; the skipped play and the hit batsman with no `x`/`y`/`seq`; the error with `seq [6]` and `err 6`.

- [ ] **Step 4: Report** tap accuracy, and that every follow-up screen appeared after the field (out type after Out, error position after Error, throw step after the out type).
