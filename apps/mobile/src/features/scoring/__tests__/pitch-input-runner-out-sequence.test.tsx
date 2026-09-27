import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { HitType } from '@baseball/shared';
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

/** Lays the field out at the drawing's own size and taps a point in it. */
function tapField(x: number, y: number) {
  fireEvent(screen.getByTestId('field-diagram-frame'), 'layout', {
    nativeEvent: { layout: { width: 240, height: 200 } },
  });
  press(screen.getByTestId('field-diagram'), { nativeEvent: { locationX: x, locationY: y } });
}

/** (99, 98) in the 240×200 drawing is spray (0.36, 0.58): the shortstop's spot. Then Next. */
function placeAtShortAndContinue() {
  tapField(99, 98);
  press(screen.getByText('Next'));
}

function readout() {
  return screen.getByTestId('throw-sequence-readout').props.children;
}

const ON_FIRST = [{ base: 1 as const, runnerId: 'r1' }];

/** In play → Double → field at short (SS fields it) → the runner-outcome prompt. */
function doubleFieldedAtShort() {
  press(screen.getByText('In play'));
  press(screen.getByText('2B'));
  placeAtShortAndContinue();
}

describe('PitchInput — putout order for a runner thrown out on a hit', () => {
  it('should ask who made the play, starting from the fielder who fielded the hit', () => {
    const onRecordHitWithRunnerOutcomes = jest.fn();
    render(<PitchInput {...baseProps({ runnersOnBase: ON_FIRST, onRecordHitWithRunnerOutcomes })} />);

    doubleFieldedAtShort();
    press(screen.getByText('Thrown out'));
    press(screen.getByText('Confirm Double'));

    expect(screen.getByText('Runner on 1st thrown out — who made the play?')).toBeTruthy();
    expect(readout()).toBe('6');
    expect(onRecordHitWithRunnerOutcomes).not.toHaveBeenCalled();

    press(screen.getByTestId('throw-position-2'));
    press(screen.getByTestId('throw-done'));

    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledTimes(1);
    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledWith(HitType.DOUBLE, [
      { runnerId: 'r1', fromBase: 1, kind: 'thrown_out', fieldingSequence: [6, 2] },
    ]);
  });

  it('should let Undo clear the prefilled fielder when the relay started elsewhere', () => {
    const onRecordHitWithRunnerOutcomes = jest.fn();
    render(<PitchInput {...baseProps({ runnersOnBase: ON_FIRST, onRecordHitWithRunnerOutcomes })} />);

    doubleFieldedAtShort();
    press(screen.getByText('Thrown out'));
    press(screen.getByText('Confirm Double'));
    press(screen.getByTestId('throw-undo'));
    press(screen.getByTestId('throw-position-8'));
    press(screen.getByTestId('throw-position-2'));
    press(screen.getByTestId('throw-done'));

    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledWith(HitType.DOUBLE, [
      expect.objectContaining({ runnerId: 'r1', fieldingSequence: [8, 2] }),
    ]);
  });

  it('should record no sequence when the scorer just taps Done on the prefilled fielder', () => {
    const onRecordHitWithRunnerOutcomes = jest.fn();
    render(<PitchInput {...baseProps({ runnersOnBase: ON_FIRST, onRecordHitWithRunnerOutcomes })} />);

    doubleFieldedAtShort();
    press(screen.getByText('Thrown out'));
    press(screen.getByText('Confirm Double'));
    press(screen.getByTestId('throw-done'));

    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledWith(HitType.DOUBLE, [
      { runnerId: 'r1', fromBase: 1, kind: 'thrown_out' },
    ]);
  });

  it('should record the out without a sequence when the scorer clears it and taps Done', () => {
    const onRecordHitWithRunnerOutcomes = jest.fn();
    render(<PitchInput {...baseProps({ runnersOnBase: ON_FIRST, onRecordHitWithRunnerOutcomes })} />);

    doubleFieldedAtShort();
    press(screen.getByText('Thrown out'));
    press(screen.getByText('Confirm Double'));
    press(screen.getByTestId('throw-undo'));
    press(screen.getByTestId('throw-done'));

    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledWith(HitType.DOUBLE, [
      { runnerId: 'r1', fromBase: 1, kind: 'thrown_out' },
    ]);
  });

  it('should start empty when hit location was skipped', () => {
    render(<PitchInput {...baseProps({ runnersOnBase: ON_FIRST, onRecordHitWithRunnerOutcomes: jest.fn() })} />);

    press(screen.getByText('In play'));
    press(screen.getByText('2B'));
    press(screen.getByText('Skip'));
    press(screen.getByText('Thrown out'));
    press(screen.getByText('Confirm Double'));

    expect(readout()).toBe('');
  });

  it('should ask for each thrown-out runner in turn, lead runner first, and record once', () => {
    const onRecordHitWithRunnerOutcomes = jest.fn();
    render(
      <PitchInput
        {...baseProps({
          runnersOnBase: [{ base: 1, runnerId: 'r1' }, { base: 2, runnerId: 'r2' }],
          onRecordHitWithRunnerOutcomes,
        })}
      />,
    );

    doubleFieldedAtShort();
    for (const button of screen.getAllByText('Thrown out')) press(button);
    press(screen.getByText('Confirm Double'));

    expect(screen.getByText('Runner on 2nd thrown out — who made the play?')).toBeTruthy();
    press(screen.getByTestId('throw-position-2'));
    press(screen.getByTestId('throw-done'));
    expect(onRecordHitWithRunnerOutcomes).not.toHaveBeenCalled();

    expect(screen.getByText('Runner on 1st thrown out — who made the play?')).toBeTruthy();
    expect(readout()).toBe('6');
    press(screen.getByTestId('throw-position-5'));
    press(screen.getByTestId('throw-done'));

    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledTimes(1);
    const [, outcomes] = onRecordHitWithRunnerOutcomes.mock.calls[0];
    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runnerId: 'r2', fieldingSequence: [6, 2] }),
        expect.objectContaining({ runnerId: 'r1', fieldingSequence: [6, 5] }),
      ]),
    );
  });

  it('should not ask anything when no runner was thrown out', () => {
    const onRecordHitWithRunnerOutcomes = jest.fn();
    render(<PitchInput {...baseProps({ runnersOnBase: ON_FIRST, onRecordHitWithRunnerOutcomes })} />);

    doubleFieldedAtShort();
    press(screen.getByText('Confirm Double'));

    expect(screen.queryByTestId('throw-done')).toBeNull();
    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledWith(HitType.DOUBLE, [
      { runnerId: 'r1', fromBase: 1, kind: 'auto' },
    ]);
  });
});

describe('PitchInput — putout order from the Runner Out sheet', () => {
  it('should ask who made the play, starting empty, and pass the sequence on', () => {
    const onRecordRunnerOut = jest.fn();
    render(<PitchInput {...baseProps({ runnersOnBase: ON_FIRST, onRecordRunnerOut })} />);

    press(screen.getByText('Runners'));
    press(screen.getByText('Runner Out'));
    press(screen.getByText('Runner on 1st thrown out'));

    expect(screen.getByText('Runner on 1st thrown out — who made the play?')).toBeTruthy();
    expect(readout()).toBe('');
    expect(onRecordRunnerOut).not.toHaveBeenCalled();

    press(screen.getByTestId('throw-position-9'));
    press(screen.getByTestId('throw-position-5'));
    press(screen.getByTestId('throw-done'));

    expect(onRecordRunnerOut).toHaveBeenCalledWith('r1', 1, [9, 5]);
  });
});
