import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { HitType } from '@baseball/shared';
import { PitchInput } from '../PitchInput';

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props: { children?: unknown }) => React.createElement(View, null, props.children);
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

describe('PitchInput hit location — outcome first', () => {
  it('should open the outcome sheet, not the field, on In play', () => {
    render(<PitchInput {...baseProps()} />);
    press(screen.getByText('In play'));
    expect(screen.getByText('What happened to the batter?')).toBeTruthy();
    expect(screen.queryByText('Where did it go?')).toBeNull();
  });

  it('should open no field and record no location when the game does not track hit location', () => {
    const onBattedBall = jest.fn();
    const onRecordHit = jest.fn();
    render(<PitchInput {...baseProps({ trackHitLocation: false, onBattedBall, onRecordHit })} />);
    press(screen.getByText('In play'));
    press(screen.getByText('1B'));
    expect(screen.queryByText('Where did it go?')).toBeNull();
    expect(onBattedBall).toHaveBeenCalledWith({});
    expect(onRecordHit).toHaveBeenCalledWith(HitType.SINGLE);
  });

  it('should open the field immediately after Out, before the out type, and record a 6-3 groundout', () => {
    const calls: string[] = [];
    const onBattedBall = jest.fn(() => calls.push('battedBall'));
    const onRecordOut = jest.fn(() => calls.push('out'));
    render(<PitchInput {...baseProps({ onBattedBall, onRecordOut })} />);

    press(screen.getByText('In play'));
    pressButtonLabeled('Out');
    expect(screen.getByText('Where did it go?')).toBeTruthy();
    expect(screen.queryByText('Groundout')).toBeNull();

    placeAtShortAndContinue();
    press(screen.getByText('Groundout'));
    expect(onRecordOut).not.toHaveBeenCalled();
    press(screen.getByTestId('throw-position-3'));
    press(screen.getByTestId('throw-done'));

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

    press(screen.getByText('In play'));
    press(screen.getByText('HR'));
    tapField(120, 10);
    expect(screen.queryByTestId('fielder-marker-8')).toBeNull();
    press(screen.getByText('Next'));

    // A home run records the moment Next is tapped: this fails if the capture
    // is read from stale state rather than from where Next just put it.
    expect(onBattedBall).toHaveBeenCalledWith({ sprayX: 0.5, sprayY: 1 });
    expect(onRecordHit).toHaveBeenCalledWith(HitType.HOME_RUN);
  });

  it('should record the first fielder on a single with the bases empty, without a throw step', () => {
    const onBattedBall = jest.fn();
    const onRecordHit = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall, onRecordHit })} />);

    press(screen.getByText('In play'));
    press(screen.getByText('1B'));
    placeAtShortAndContinue();

    expect(screen.queryByTestId('throw-done')).toBeNull();
    expect(onBattedBall).toHaveBeenCalledWith(expect.objectContaining({ fieldingSequence: [6] }));
    expect(onRecordHit).toHaveBeenCalledWith(HitType.SINGLE);
  });

  it('should record no batted-ball fields when the scorer skips', () => {
    const onBattedBall = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall })} />);

    press(screen.getByText('In play'));
    press(screen.getByText('1B'));
    press(screen.getByText('Skip'));

    expect(onBattedBall).toHaveBeenCalledWith({});
  });

  it('should never open the field for a hit batsman', () => {
    const onBattedBall = jest.fn();
    const onRecordPitch = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall, onRecordPitch })} />);

    press(screen.getByText('In play'));
    press(screen.getByText('Hit by pitch'));

    expect(screen.queryByText('Where did it go?')).toBeNull();
    expect(onRecordPitch).toHaveBeenCalled();
    expect(onBattedBall).not.toHaveBeenCalled();
  });

  it('should pre-select the field pop-up fielder in the error picker', () => {
    render(<PitchInput {...baseProps()} />);

    press(screen.getByText('In play'));
    pressButtonLabeled('Error');
    placeAtShortAndContinue();

    expect(screen.getByTestId('error-position-6').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('error-position-5').props.accessibilityState).toEqual({ selected: false });
  });

  it('should not carry a location from a play abandoned at the out type to the next play', () => {
    const onBattedBall = jest.fn();
    render(<PitchInput {...baseProps({ onBattedBall })} />);

    press(screen.getByText('In play'));
    pressButtonLabeled('Out');
    placeAtShortAndContinue();
    press(screen.getByText('Cancel'));

    press(screen.getByText('In play'));
    press(screen.getByText('1B'));
    press(screen.getByText('Skip'));

    expect(onBattedBall).toHaveBeenCalledTimes(1);
    expect(onBattedBall).toHaveBeenCalledWith({});
  });
});

describe('PitchInput hit location — other batted-ball outcome buttons', () => {
  it.each([
    { label: 'Sac Fly', eligibilityKey: 'sacFlyEligible', handlerKey: 'onRecordSacFly', pickRunner: false },
    { label: 'Sac Bunt', eligibilityKey: 'sacBuntEligible', handlerKey: 'onRecordSacBunt', pickRunner: false },
    { label: 'Double Play', eligibilityKey: 'doublePlayEligible', handlerKey: 'onRecordDoublePlay', pickRunner: true },
    { label: 'Triple Play', eligibilityKey: 'triplePlayEligible', handlerKey: 'onRecordTriplePlay', pickRunner: false },
  ])(
    'opens the field for $label, then the throw step, then records',
    ({ label, eligibilityKey, handlerKey, pickRunner }) => {
      const onBattedBall = jest.fn();
      const handler = jest.fn();
      render(
        <PitchInput
          {...baseProps({
            [eligibilityKey]: true,
            [handlerKey]: handler,
            onBattedBall,
            runnersOnBase: [{ base: 1, runnerId: 'r1' }],
          })}
        />,
      );

      press(screen.getByText('In play'));
      press(screen.getByText(label));
      expect(screen.getByText('Where did it go?')).toBeTruthy();

      placeAtShortAndContinue();

      if (pickRunner) {
        press(screen.getByText('Runner on 1st retired'));
      }

      expect(screen.getByTestId('throw-done')).toBeTruthy();
      press(screen.getByTestId('throw-position-3'));
      press(screen.getByTestId('throw-done'));

      expect(handler).toHaveBeenCalled();
      if (pickRunner) {
        expect(handler).toHaveBeenCalledWith({ runnerId: 'r1', base: 1 });
      }
      expect(onBattedBall).toHaveBeenCalledWith(
        expect.objectContaining({ fieldingSequence: [6, 3] }),
      );
    },
  );

  it('opens the field for Fielder\'s Choice, then the FC runner picker, and records with no throw step', () => {
    const onBattedBall = jest.fn();
    const onRecordFieldersChoice = jest.fn();
    render(
      <PitchInput
        {...baseProps({
          onBattedBall,
          onRecordFieldersChoice,
          runnersOnBase: [{ base: 1, runnerId: 'r1' }],
        })}
      />,
    );

    press(screen.getByText('In play'));
    press(screen.getByText('Fielder\'s Choice'));
    expect(screen.getByText('Where did it go?')).toBeTruthy();

    placeAtShortAndContinue();

    expect(screen.getByText('Fielder\'s Choice')).toBeTruthy();
    press(screen.getByText('Runner on 1st retired'));

    expect(screen.queryByTestId('throw-done')).toBeNull();
    expect(onBattedBall).toHaveBeenCalledWith(
      expect.objectContaining({ fieldingSequence: [6] }),
    );
    expect(onRecordFieldersChoice).toHaveBeenCalledWith('r1', 1);
  });

  it('never opens the field and never records a batted ball for Catcher Int.', () => {
    const onBattedBall = jest.fn();
    const onRecordCatcherInterference = jest.fn();
    render(
      <PitchInput {...baseProps({ onBattedBall, onRecordCatcherInterference })} />,
    );

    press(screen.getByText('In play'));
    press(screen.getByText('Catcher Int.'));

    expect(screen.queryByText('Where did it go?')).toBeNull();
    expect(onBattedBall).not.toHaveBeenCalled();
    expect(onRecordCatcherInterference).toHaveBeenCalled();
  });
});
