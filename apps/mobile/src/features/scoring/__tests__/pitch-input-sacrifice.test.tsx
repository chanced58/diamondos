import { render, fireEvent, screen } from '@testing-library/react-native';
import { HitTrajectory, sacrificeEligibility } from '@baseball/shared';
import type { LiveGameState } from '@baseball/shared';
import { PitchInput, trajectoryForOutType, type BattedOutType } from '../PitchInput';

/**
 * Gating coverage for Task 3 (OBR 9.08 sacrifice eligibility on mobile).
 * The actual eligibility rule (`sacrificeEligibility`) lives in
 * `@baseball/shared` and is covered by its own unit tests — this file
 * asserts that PitchInput respects it in two places:
 *
 *  1. The in-play sheet's Sac Fly / Sac Bunt buttons, gated by the
 *     trajectory-agnostic `sacFlyEligible` / `sacBuntEligible` props.
 *  2. The post-out "was this a sacrifice?" prompt, gated by trajectory via
 *     the `sacEligibilityForTrajectory` callback — the actual novel wiring
 *     this task added, driven here through the real `sacrificeEligibility`
 *     rule rather than a hand-rolled stub, so a regression in the wiring
 *     (not just the rule) would fail these tests.
 */

function noop() {}

/** Minimal `runnersOnBase` state with a runner on 3rd only — enough to make
 *  a sac fly possible and a sac bunt possible, so trajectory is the only
 *  thing that can disqualify the fly. */
const runnerOnThird: Pick<LiveGameState, 'outs' | 'runnersOnBase'> = {
  outs: 0,
  runnersOnBase: { first: null, second: null, third: 'runner-3' },
};

const twoOutsRunnerOnThird: Pick<LiveGameState, 'outs' | 'runnersOnBase'> = {
  outs: 2,
  runnersOnBase: { first: null, second: null, third: 'runner-3' },
};

/** Builds the real `sacEligibilityForTrajectory` callback the way score.tsx
 *  does — closing over a fixed game state and delegating straight to the
 *  shared rule, never re-deriving it. */
function sacEligibilityForTrajectoryFrom(
  state: Pick<LiveGameState, 'outs' | 'runnersOnBase'>,
) {
  return (trajectory: HitTrajectory | undefined) => sacrificeEligibility(state, trajectory);
}

function baseProps(state: Pick<LiveGameState, 'outs' | 'runnersOnBase'>) {
  const eligibility = sacrificeEligibility(state);
  return {
    onRecordPitch: noop,
    onRecordHit: noop,
    onRecordOut: noop,
    onRecordStrikeout: noop,
    onRecordError: noop,
    onRecordCatcherInterference: noop,
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
    sacFlyEligible: eligibility.sacFly,
    sacBuntEligible: eligibility.sacBunt,
    doublePlayEligible: false,
    triplePlayEligible: false,
    sacEligibilityForTrajectory: sacEligibilityForTrajectoryFrom(state),
  };
}

/** Opens the "In play" branch sheet, where the Sac Fly / Sac Bunt buttons live. */
function openInPlaySheet() {
  fireEvent.press(screen.getByText('In play'));
}

/**
 * Presses the pressable ancestor of the (possibly ambiguous) text node
 * labelled `label`. Needed for the "Out" outcome button specifically: the
 * "Out" `SheetGroup` heading and the "Out" `OutcomeButton` inside it are
 * both exact-text matches for `getByText('Out')`, so a plain query is
 * ambiguous. Walks up from each candidate text node to find the one whose
 * ancestor actually has an `onPress` handler.
 */
function pressButtonLabeled(label: string) {
  const candidates = screen.getAllByText(label);
  const pressable = candidates.find((node) => {
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

/** Opens the In play sheet, taps "Out", then picks the given trajectory —
 *  landing on the post-out "was this a sacrifice?" step (or, when neither
 *  sac is eligible, recording the out directly and closing the modal). */
function pickOutType(outType: BattedOutType) {
  openInPlaySheet();
  pressButtonLabeled('Out');
  const label = { groundout: 'Groundout', flyout: 'Flyout', lineout: 'Lineout', popout: 'Popout', other: 'Other' }[outType];
  fireEvent.press(screen.getByText(label));
}

describe('PitchInput sacrifice gating — in-play sheet', () => {
  it('hides Sac Fly and Sac Bunt when both are ineligible', () => {
    render(<PitchInput {...baseProps(twoOutsRunnerOnThird)} />);
    openInPlaySheet();

    expect(screen.queryByText('Sac Fly')).toBeNull();
    expect(screen.queryByText('Sac Bunt')).toBeNull();
  });

  it('shows Sac Fly and Sac Bunt when both are eligible', () => {
    render(<PitchInput {...baseProps(runnerOnThird)} />);
    openInPlaySheet();

    expect(screen.getByText('Sac Fly')).toBeTruthy();
    expect(screen.getByText('Sac Bunt')).toBeTruthy();
  });

  it('gates Sac Fly and Sac Bunt independently', () => {
    // Runner on 1st only: sac bunt possible (any runner on), sac fly not
    // (nobody on 2nd/3rd able to score on the catch).
    const runnerOnFirst: Pick<LiveGameState, 'outs' | 'runnersOnBase'> = {
      outs: 0,
      runnersOnBase: { first: 'runner-1', second: null, third: null },
    };
    render(<PitchInput {...baseProps(runnerOnFirst)} />);
    openInPlaySheet();

    expect(screen.queryByText('Sac Fly')).toBeNull();
    expect(screen.getByText('Sac Bunt')).toBeTruthy();
  });
});

describe('PitchInput sacrifice gating — post-out prompt (trajectory-aware)', () => {
  it('a groundout with a runner on 3rd and fewer than two outs offers Sacrifice bunt but not Sacrifice fly', () => {
    render(<PitchInput {...baseProps(runnerOnThird)} />);
    pickOutType('groundout');

    expect(screen.getByText('Groundout — sacrifice?')).toBeTruthy();
    expect(screen.queryByText('Sacrifice fly')).toBeNull();
    expect(screen.getByText('Sacrifice bunt')).toBeTruthy();
  });

  it('a flyout in the same state offers Sacrifice fly', () => {
    render(<PitchInput {...baseProps(runnerOnThird)} />);
    pickOutType('flyout');

    expect(screen.getByText('Flyout — sacrifice?')).toBeTruthy();
    expect(screen.getByText('Sacrifice fly')).toBeTruthy();
    expect(screen.queryByText('Sacrifice bunt')).toBeNull();
  });

  it('with two outs, choosing any out type skips the sacrifice prompt and records the out directly', () => {
    const onRecordOut = jest.fn();
    render(
      <PitchInput {...baseProps(twoOutsRunnerOnThird)} onRecordOut={onRecordOut} />,
    );
    pickOutType('groundout');

    // The modal must never appear — not merely render without sac buttons.
    expect(screen.queryByText('Groundout — sacrifice?')).toBeNull();
    expect(screen.queryByText('Out')).toBeNull();
    expect(screen.queryByText('Sacrifice fly')).toBeNull();
    expect(screen.queryByText('Sacrifice bunt')).toBeNull();
    expect(onRecordOut).toHaveBeenCalledWith('groundout');
  });
});

describe('trajectoryForOutType (sanity check backing the post-out gating)', () => {
  it('maps out types to the trajectories the shared rule expects', () => {
    expect(trajectoryForOutType('groundout')).toBe(HitTrajectory.GROUND_BALL);
    expect(trajectoryForOutType('flyout')).toBe(HitTrajectory.FLY_BALL);
    expect(trajectoryForOutType('lineout')).toBe(HitTrajectory.LINE_DRIVE);
    expect(trajectoryForOutType('popout')).toBe(HitTrajectory.FLY_BALL);
    expect(trajectoryForOutType('other')).toBeUndefined();
  });
});
