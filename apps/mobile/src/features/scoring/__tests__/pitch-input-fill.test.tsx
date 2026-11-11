import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { PitchInput } from '../PitchInput';

/**
 * On phones the scorer's action pane is sized by its content. PitchInput used
 * `flex-1` (flex: 1, a basis of 0), which gave that pane no height to keep, so
 * the outcome buttons were squeezed on top of each other on an iPhone 17 Pro.
 * RNTL does no real layout, so this pins the flex properties that prevent it.
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

it('should fill its pane from its content size so a content-sized pane keeps the buttons', () => {
  render(<PitchInput {...baseProps()} />);
  const style = StyleSheet.flatten(screen.getByTestId('pitch-input-root').props.style);
  expect(style.flexBasis).toBe('auto');
  expect(style.flexGrow).toBe(1);
  expect(style.flexShrink).toBe(1);
  expect(style.flex).toBeUndefined();
});
