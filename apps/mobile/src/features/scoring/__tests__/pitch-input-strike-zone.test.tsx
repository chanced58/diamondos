import { render, fireEvent, screen } from '@testing-library/react-native';
import { PitchOutcome, PitchType } from '@baseball/shared';
import { PitchInput } from '../PitchInput';

/**
 * Task 12: the strike-zone grid used to render all nine zones, but the
 * modifiers pane around it (`PitchInput.tsx`) could be squeezed by a
 * sibling once the game started, scrolling the bottom row (zones 7/8/9)
 * out of view with no indication it was there — the clipped two-column
 * state read as a *complete* grid.
 *
 * RNTL doesn't perform real layout, so it can't reproduce the pixel-level
 * clipping itself (that's the real device verification this task explicitly
 * defers). What it *can* assert, and what would catch the class of
 * regression that caused this bug — someone reintroducing a fixed/short
 * container, or the grid silently dropping a row — is that all nine zone
 * cells actually exist in the tree and are independently reachable end to
 * end: tapping a bottom-row zone (7, 8, 9) and then a pitch outcome must
 * thread that exact zone through to `onRecordPitch`. A test that only
 * checked a pixel height would be asserting an implementation detail, not
 * behavior — this instead pins the same observable outcome the brief's own
 * manual verification step checks (tap zone 7, confirm `zoneLocation` is 7).
 */

function noop() {}

function baseProps() {
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
    sacFlyEligible: false,
    sacBuntEligible: false,
    doublePlayEligible: false,
    triplePlayEligible: false,
    sacEligibilityForTrajectory: () => ({ sacFly: false, sacBunt: false }),
  };
}

describe('PitchInput strike-zone grid — all nine zones reachable', () => {
  it('renders all nine zone cells plus "Outside zone" when both trackers are on', () => {
    render(<PitchInput {...baseProps()} trackPitchType trackPitchLocation />);

    for (let zone = 1; zone <= 9; zone++) {
      expect(screen.getByLabelText(`Strike zone ${zone}`)).toBeTruthy();
    }
    expect(screen.getByText('Outside zone')).toBeTruthy();

    // The pitch-type row must coexist with the grid, not replace it — this
    // is exactly the scenario (both trackers enabled) that triggered the
    // squeeze.
    expect(screen.getByText('FB')).toBeTruthy();
  });

  it('records zoneLocation 7 (bottom-left, the row that used to clip) end to end', () => {
    const onRecordPitch = jest.fn();
    render(
      <PitchInput
        {...baseProps()}
        onRecordPitch={onRecordPitch}
        trackPitchType
        trackPitchLocation
      />,
    );

    fireEvent.press(screen.getByLabelText('Strike zone 7'));
    fireEvent.press(screen.getByText('Called'));

    expect(onRecordPitch).toHaveBeenCalledWith(PitchOutcome.CALLED_STRIKE, undefined, 7);
  });

  it('records zones 8 and 9 (the rest of the bottom row) just as reliably', () => {
    const onRecordPitch = jest.fn();
    const { rerender } = render(
      <PitchInput
        {...baseProps()}
        onRecordPitch={onRecordPitch}
        trackPitchType
        trackPitchLocation
      />,
    );

    fireEvent.press(screen.getByLabelText('Strike zone 8'));
    fireEvent.press(screen.getByText('Called'));
    expect(onRecordPitch).toHaveBeenLastCalledWith(PitchOutcome.CALLED_STRIKE, undefined, 8);

    rerender(
      <PitchInput
        {...baseProps()}
        onRecordPitch={onRecordPitch}
        trackPitchType
        trackPitchLocation
      />,
    );
    fireEvent.press(screen.getByLabelText('Strike zone 9'));
    fireEvent.press(screen.getByText('Called'));
    expect(onRecordPitch).toHaveBeenLastCalledWith(PitchOutcome.CALLED_STRIKE, undefined, 9);
  });

  it('also carries the selected pitch type alongside a bottom-row zone', () => {
    const onRecordPitch = jest.fn();
    render(
      <PitchInput
        {...baseProps()}
        onRecordPitch={onRecordPitch}
        trackPitchType
        trackPitchLocation
      />,
    );

    fireEvent.press(screen.getByText('SL')); // Slider chip
    fireEvent.press(screen.getByLabelText('Strike zone 9'));
    fireEvent.press(screen.getByText('Swinging'));

    expect(onRecordPitch).toHaveBeenCalledWith(
      PitchOutcome.SWINGING_STRIKE,
      PitchType.SLIDER,
      9,
    );
  });
});
