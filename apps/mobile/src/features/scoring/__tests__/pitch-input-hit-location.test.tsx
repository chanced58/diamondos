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
