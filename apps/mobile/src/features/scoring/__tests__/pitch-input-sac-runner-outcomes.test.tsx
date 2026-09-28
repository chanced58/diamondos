import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { PitchInput } from '../PitchInput';

jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Stub = (props: { children?: import('react').ReactNode }) => React.createElement(View, null, props.children);
  return { __esModule: true, default: Stub, Rect: Stub, Path: Stub, Circle: Stub, Polygon: Stub, Line: Stub };
});

/**
 * Real RN `TouchableOpacity` and `Modal` start `Animated.timing` fades on
 * mount/visibility/disabled changes — exactly what the throw-step and
 * runner-picker modals do here. Those animations run on real timers via the
 * rAF-over-setTimeout polyfill in RN's jest setup, so left unflushed they
 * keep ticking past the end of the synchronous test body and update state
 * outside of `act()`. Fake timers plus a flush after every press keep each
 * animation's frames inside `act()`, so it settles before the test (and the
 * suite) moves on. See FieldLocationModal.test.tsx for the same pattern.
 */
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

/** `fireEvent.press`, then settle any Animated timing it started. */
function press(element: unknown, ...data: unknown[]) {
  fireEvent.press(element as never, ...(data as []));
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

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
  press(pressable);
}

/** Sac buttons show when the caller says the play is eligible. */
function sacProps(overrides: Record<string, unknown> = {}) {
  return baseProps({
    sacFlyEligible: true,
    sacBuntEligible: true,
    sacEligibilityForTrajectory: () => ({ sacFly: true, sacBunt: true }),
    ...overrides,
  });
}

/** In play → the sac button → skip the field → the runner-outcome prompt. */
function sacToPrompt(label: 'Sac Fly' | 'Sac Bunt') {
  press(screen.getByText('In play'));
  press(screen.getByText(label));
  press(screen.getByText('Skip'));
}

const FIRST_AND_SECOND = [{ base: 1 as const, runnerId: 'r1' }, { base: 2 as const, runnerId: 'r2' }];

describe('PitchInput — runner outcomes on a sacrifice', () => {
  it('should open the runner prompt on a sac bunt and record the chosen outcomes', () => {
    const onRecordSacrificeWithRunnerOutcomes = jest.fn();
    render(<PitchInput {...sacProps({ runnersOnBase: FIRST_AND_SECOND, onRecordSacrificeWithRunnerOutcomes })} />);

    sacToPrompt('Sac Bunt');
    expect(screen.getByText('Sac Bunt — Runner Outcomes')).toBeTruthy();
    press(screen.getByText('Held at 1B'));
    press(screen.getByText('Confirm Sac Bunt'));

    expect(onRecordSacrificeWithRunnerOutcomes).toHaveBeenCalledWith(
      'sac_bunt',
      expect.arrayContaining([
        { runnerId: 'r1', fromBase: 1, kind: 'held', toBase: 1 },
        { runnerId: 'r2', fromBase: 2, kind: 'auto' },
      ]),
      null,
    );
  });

  it('should refuse a sac fly on which no run scores', () => {
    const onRecordSacrificeWithRunnerOutcomes = jest.fn();
    render(
      <PitchInput
        {...sacProps({ runnersOnBase: [{ base: 3, runnerId: 'r3' }], onRecordSacrificeWithRunnerOutcomes })}
      />,
    );

    sacToPrompt('Sac Fly');
    press(screen.getByText('Thrown out'));
    expect(screen.getByText('No run scored — record it as a fly out instead.')).toBeTruthy();
    press(screen.getByText('Confirm Sac Fly'));
    expect(onRecordSacrificeWithRunnerOutcomes).not.toHaveBeenCalled();
  });

  it('should let a runner tag up on a sac fly', () => {
    const onRecordSacrificeWithRunnerOutcomes = jest.fn();
    render(
      <PitchInput
        {...sacProps({
          runnersOnBase: [{ base: 2, runnerId: 'r2' }, { base: 3, runnerId: 'r3' }],
          onRecordSacrificeWithRunnerOutcomes,
        })}
      />,
    );

    sacToPrompt('Sac Fly');
    expect(screen.getByText('Standard: stays')).toBeTruthy();
    press(screen.getByText('Advance to 3B'));
    press(screen.getByText('Confirm Sac Fly'));

    expect(onRecordSacrificeWithRunnerOutcomes).toHaveBeenCalledWith(
      'sac_fly',
      expect.arrayContaining([
        { runnerId: 'r2', fromBase: 2, kind: 'advanced', toBase: 3 },
        { runnerId: 'r3', fromBase: 3, kind: 'auto' },
      ]),
      null,
    );
  });

  it('should ask the putout order for a runner thrown out tagging on a sac fly', () => {
    const onRecordSacrificeWithRunnerOutcomes = jest.fn();
    render(
      <PitchInput
        {...sacProps({
          runnersOnBase: [{ base: 2, runnerId: 'r2' }, { base: 3, runnerId: 'r3' }],
          onRecordSacrificeWithRunnerOutcomes,
        })}
      />,
    );

    sacToPrompt('Sac Fly');
    press(screen.getAllByText('Thrown out')[0]); // runner from 2nd, out tagging to 3rd
    press(screen.getByText('Confirm Sac Fly'));
    expect(screen.getByText('Runner on 2nd thrown out — who made the play?')).toBeTruthy();
    press(screen.getByTestId('throw-position-8'));
    press(screen.getByTestId('throw-position-5'));
    press(screen.getByTestId('throw-done'));

    expect(onRecordSacrificeWithRunnerOutcomes).toHaveBeenCalledWith(
      'sac_fly',
      expect.arrayContaining([
        { runnerId: 'r2', fromBase: 2, kind: 'thrown_out', fieldingSequence: [8, 5] },
        { runnerId: 'r3', fromBase: 3, kind: 'auto' },
      ]),
      null,
    );
  });

  it('should refuse a sac bunt on which a runner is put out (OBR 9.08(a))', () => {
    const onRecordSacrificeWithRunnerOutcomes = jest.fn();
    render(<PitchInput {...sacProps({ runnersOnBase: FIRST_AND_SECOND, onRecordSacrificeWithRunnerOutcomes })} />);

    sacToPrompt('Sac Bunt');
    press(screen.getAllByText('Thrown out')[0]); // runner from 1st
    expect(screen.getByText('A runner was put out advancing — record it as an out instead.')).toBeTruthy();
    press(screen.getByText('Confirm Sac Bunt'));
    expect(onRecordSacrificeWithRunnerOutcomes).not.toHaveBeenCalled();
  });

  it('should carry the out type through from the Out → "was it a sacrifice?" path', () => {
    const onRecordSacrificeWithRunnerOutcomes = jest.fn();
    render(
      <PitchInput
        {...sacProps({ runnersOnBase: [{ base: 3, runnerId: 'r3' }], onRecordSacrificeWithRunnerOutcomes })}
      />,
    );

    press(screen.getByText('In play'));
    pressButtonLabeled('Out');
    press(screen.getByText('Skip'));
    press(screen.getByText('Flyout'));
    press(screen.getByText('Sacrifice fly'));
    press(screen.getByText('Confirm Sac Fly'));

    expect(onRecordSacrificeWithRunnerOutcomes).toHaveBeenCalledWith(
      'sac_fly',
      [{ runnerId: 'r3', fromBase: 3, kind: 'auto' }],
      'flyout',
    );
  });

  it('should record a sacrifice straight through when the caller takes no runner outcomes', () => {
    const onRecordSacBunt = jest.fn();
    render(<PitchInput {...sacProps({ runnersOnBase: FIRST_AND_SECOND, onRecordSacBunt })} />);

    sacToPrompt('Sac Bunt');
    expect(screen.queryByText('Sac Bunt — Runner Outcomes')).toBeNull();
    expect(onRecordSacBunt).toHaveBeenCalled();
  });
});
