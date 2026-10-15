import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { HitType } from '@baseball/shared';
import { PitchInput } from '../PitchInput';

jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  /** Renders children only — react-native-svg has no test renderer. */
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

/** A handler the test does not observe. */
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

/** In play → Single → skip the field → the runner-outcome prompt. */
function singleToPrompt() {
  press(screen.getByText('In play'));
  press(screen.getByText('1B'));
  press(screen.getByText('Skip'));
}

describe('PitchInput — holding an unforced runner at his base', () => {
  it('should offer "Held at 2B" to a runner on 2nd with 1st open, and record it', () => {
    const onRecordHitWithRunnerOutcomes = jest.fn();
    render(
      <PitchInput
        {...baseProps({ runnersOnBase: [{ base: 2, runnerId: 'r2' }], onRecordHitWithRunnerOutcomes })}
      />,
    );

    singleToPrompt();
    press(screen.getByText('Held at 2B'));
    press(screen.getByText('Confirm Single'));

    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledWith(HitType.SINGLE, [
      { runnerId: 'r2', fromBase: 2, kind: 'held', toBase: 2 },
    ]);
  });

  it('should not offer a hold at 2B when a runner on 1st forces him', () => {
    render(
      <PitchInput
        {...baseProps({
          runnersOnBase: [{ base: 1, runnerId: 'r1' }, { base: 2, runnerId: 'r2' }],
          onRecordHitWithRunnerOutcomes: jest.fn(),
        })}
      />,
    );

    singleToPrompt();
    expect(screen.queryByText('Held at 2B')).toBeNull();
  });

  it('should offer a runner on 3rd a hold at 3B on a single when 2nd is open', () => {
    render(
      <PitchInput
        {...baseProps({
          runnersOnBase: [{ base: 1, runnerId: 'r1' }, { base: 3, runnerId: 'r3' }],
          onRecordHitWithRunnerOutcomes: jest.fn(),
        })}
      />,
    );

    singleToPrompt();
    expect(screen.getByText('Held at 3B')).toBeTruthy();
  });

  it('should offer the runner from 2nd a hold at 2B once the runner from 1st is thrown out', () => {
    const onRecordHitWithRunnerOutcomes = jest.fn();
    render(
      <PitchInput
        {...baseProps({
          runnersOnBase: [{ base: 1, runnerId: 'r1' }, { base: 2, runnerId: 'r2' }],
          onRecordHitWithRunnerOutcomes,
        })}
      />,
    );

    singleToPrompt();
    expect(screen.queryByText('Held at 2B')).toBeNull();
    press(screen.getAllByText('Thrown out')[0]);
    press(screen.getByText('Held at 2B'));
    press(screen.getByText('Confirm Single'));
    press(screen.getByTestId('throw-done'));

    expect(onRecordHitWithRunnerOutcomes).toHaveBeenCalledWith(
      HitType.SINGLE,
      expect.arrayContaining([
        { runnerId: 'r1', fromBase: 1, kind: 'thrown_out' },
        { runnerId: 'r2', fromBase: 2, kind: 'held', toBase: 2 },
      ]),
    );
  });
});
